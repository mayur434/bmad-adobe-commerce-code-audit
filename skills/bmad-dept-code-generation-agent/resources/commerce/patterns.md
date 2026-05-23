# Adobe Commerce — Code Generation Patterns

## Overview

Adobe Commerce (Magento 2) code generation uses **LLM skills** + **project scanning**. No MCP.

All generated code must:
- Follow PSR-12 coding standards
- Pass Magento Coding Standard (PHPCS + PHPMD)
- Use constructor dependency injection (never ObjectManager directly)
- Implement interfaces where appropriate
- Be backwards-compatible unless explicitly breaking
- Follow the security rules in `resources/commerce/security.md`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  BMAD Code Generation Agent (Adobe Commerce)                │
│                                                             │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │  LLM Skills     │  │  Project Scanner                 │ │
│  │  (this file)    │  │  (static analysis of source)     │ │
│  │                 │  │                                  │ │
│  │  • Patterns     │  │  • Module inventory              │ │
│  │  • Conventions  │  │  • DI config (di.xml)            │ │
│  │  • Best prctcs  │  │  • Plugin/observer registry      │ │
│  │  • Templates    │  │  • DB schema declarations        │ │
│  │  • Anti-pats    │  │  • Existing API endpoints        │ │
│  │  • Security     │  │  • Admin UI layouts              │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Generation Engine                                    │   │
│  │  Combines skills + scanned context → output files     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure (Adobe Commerce)

```
app/code/{Vendor}/{Module}/
├── registration.php              → Module registration
├── etc/
│   ├── module.xml                → Module declaration (version, sequence)
│   ├── di.xml                    → Dependency injection config (global)
│   ├── frontend/
│   │   ├── di.xml                → Frontend-area DI
│   │   ├── routes.xml            → Frontend routes
│   │   └── sections.xml          → Customer section invalidation
│   ├── adminhtml/
│   │   ├── di.xml                → Admin-area DI
│   │   ├── routes.xml            → Admin routes
│   │   ├── menu.xml              → Admin menu entries
│   │   └── system.xml            → System configuration fields
│   ├── webapi.xml                → REST/SOAP API declarations
│   ├── db_schema.xml             → Declarative DB schema
│   ├── db_schema_whitelist.json  → Schema whitelist (auto-generated)
│   ├── events.xml                → Observer event subscriptions
│   ├── crontab.xml               → Cron job schedule
│   ├── acl.xml                   → Access control resources
│   ├── config.xml                → Default configuration values
│   └── communication.xml         → Message queue topology
├── Api/
│   └── Data/                     → Service contract interfaces
├── Model/
│   ├── ResourceModel/            → DB resource models
│   └── Repository/               → Repository implementations
├── Controller/
│   ├── Adminhtml/                → Admin controllers
│   └── Index/                    → Frontend controllers
├── Block/
│   ├── Adminhtml/                → Admin UI blocks
│   └── Frontend/                 → Storefront blocks
├── Plugin/                       → Interceptors (before/after/around)
├── Observer/                     → Event observers
├── Console/
│   └── Command/                  → CLI commands
├── Cron/                         → Cron job classes
├── Queue/                        → Message queue consumers/publishers
├── Setup/
│   └── Patch/
│       ├── Data/                 → Data patches (repeatable data migrations)
│       └── Schema/               → Schema patches (legacy, prefer db_schema.xml)
├── Ui/
│   └── Component/                → UI component data providers
├── ViewModel/                    → View models (presentation logic)
├── view/
│   ├── frontend/
│   │   ├── layout/              → Frontend layout XML
│   │   ├── templates/           → Frontend .phtml templates
│   │   ├── web/
│   │   │   ├── css/             → CSS/LESS
│   │   │   ├── js/              → RequireJS modules
│   │   │   └── template/        → Knockout.js templates (.html)
│   │   └── requirejs-config.js  → RequireJS configuration
│   └── adminhtml/
│       ├── layout/              → Admin layout XML
│       ├── templates/           → Admin .phtml templates
│       ├── ui_component/        → UI component XML
│       └── web/
│           ├── css/
│           └── js/
├── Test/
│   ├── Unit/                    → PHPUnit unit tests
│   └── Integration/             → Integration tests
└── i18n/
    └── en_US.csv                → Translation strings
```

---

## Skill 1: Module Scaffolding

### When to use
User asks to "create a module", "scaffold a module", "new Commerce module".

### Generated Files

| File | Purpose |
|------|---------|
| `registration.php` | ComponentRegistrar entry |
| `etc/module.xml` | Module name, setup_version, sequence |
| `composer.json` | Module-level composer metadata |

### Template: registration.php

```php
<?php
declare(strict_types=1);

use Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(
    ComponentRegistrar::MODULE,
    '{Vendor}_{Module}',
    __DIR__
);
```

### Template: etc/module.xml

```xml
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:framework:Module/etc/module.xsd">
    <module name="{Vendor}_{Module}">
        <sequence>
            <!-- Add dependencies here -->
        </sequence>
    </module>
</config>
```

### Template: composer.json

```json
{
    "name": "{vendor}/{module}",
    "description": "{description}",
    "type": "magento2-module",
    "license": "proprietary",
    "autoload": {
        "files": ["registration.php"],
        "psr-4": {
            "{Vendor}\\{Module}\\": ""
        }
    },
    "require": {
        "magento/framework": "*"
    }
}
```

---

## Skill 2: Plugin (Interceptor) Generation

### When to use
User asks to "create a plugin", "intercept method", "modify behavior of X".

### Rules
- Prefer `before`/`after` over `around` (performance + less breakage)
- `around` only when you MUST conditionally prevent execution
- One plugin class per logical concern (not one per method)
- Set `sortOrder` explicitly to avoid conflicts
- Never plugin on: `__construct`, `__destruct`, `__clone`, `__sleep`, `__wakeup`, final methods, non-public methods

### Generated Files

| File | Purpose |
|------|---------|
| `Plugin/{TargetClass}Plugin.php` | Plugin class |
| `etc/{area}/di.xml` | Plugin registration |

### Template: Plugin Class

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Plugin;

use {TargetClassFQN};

class {TargetClass}Plugin
{
    /**
     * @param {TargetClass} $subject
     * @param {returnType} $result
     * @return {returnType}
     */
    public function after{MethodName}({TargetClass} $subject, {returnType} $result): {returnType}
    {
        // Modification logic
        return $result;
    }
}
```

### Template: di.xml entry

```xml
<type name="{TargetClassFQN}">
    <plugin name="{vendor}_{module}_{target_class}_plugin"
            type="{Vendor}\{Module}\Plugin\{TargetClass}Plugin"
            sortOrder="10"
            disabled="false"/>
</type>
```

---

## Skill 3: Observer Generation

### When to use
User asks to "create an observer", "listen to event", "react when X happens".

### Rules
- Use observers for loosely-coupled reactions to events
- Never modify the event object (use plugins for modification)
- Keep observer logic minimal — delegate to service classes
- One observer class per event subscription

### Generated Files

| File | Purpose |
|------|---------|
| `Observer/{EventName}Observer.php` | Observer class |
| `etc/{area}/events.xml` | Event subscription |

### Template: Observer Class

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Psr\Log\LoggerInterface;

class {EventName}Observer implements ObserverInterface
{
    public function __construct(
        private readonly LoggerInterface $logger
    ) {
    }

    public function execute(Observer $observer): void
    {
        $event = $observer->getEvent();
        // Observer logic — delegate to service
    }
}
```

### Template: events.xml

```xml
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:framework:Event/etc/events.xsd">
    <event name="{event_name}">
        <observer name="{vendor}_{module}_{event_name}_observer"
                  instance="{Vendor}\{Module}\Observer\{EventName}Observer"/>
    </event>
</config>
```

---

## Skill 4: REST/SOAP API Endpoint

### When to use
User asks to "create an API endpoint", "expose REST endpoint", "add web API".

### Rules
- Always define a service contract (interface in `Api/`)
- Implement in `Model/`
- Declare in `etc/webapi.xml`
- Define ACL resource in `etc/acl.xml`
- Use DTO interfaces in `Api/Data/` for complex request/response
- Validate all input (see security.md)

### Generated Files

| File | Purpose |
|------|---------|
| `Api/{ServiceName}Interface.php` | Service contract interface |
| `Api/Data/{EntityName}Interface.php` | DTO interface |
| `Model/{ServiceName}.php` | Implementation |
| `etc/webapi.xml` | Route + method + ACL binding |
| `etc/di.xml` | Interface → implementation preference |
| `etc/acl.xml` | ACL resource definition |

### Template: Service Interface

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Api;

interface {ServiceName}Interface
{
    /**
     * @param int $id
     * @return \{Vendor}\{Module}\Api\Data\{EntityName}Interface
     * @throws \Magento\Framework\Exception\NoSuchEntityException
     */
    public function getById(int $id): Data\{EntityName}Interface;

    /**
     * @param \{Vendor}\{Module}\Api\Data\{EntityName}Interface $entity
     * @return \{Vendor}\{Module}\Api\Data\{EntityName}Interface
     * @throws \Magento\Framework\Exception\CouldNotSaveException
     */
    public function save(Data\{EntityName}Interface $entity): Data\{EntityName}Interface;

    /**
     * @param \Magento\Framework\Api\SearchCriteriaInterface $searchCriteria
     * @return \{Vendor}\{Module}\Api\Data\{EntityName}SearchResultsInterface
     */
    public function getList(\Magento\Framework\Api\SearchCriteriaInterface $searchCriteria);
}
```

### Template: webapi.xml

```xml
<?xml version="1.0"?>
<routes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_Webapi:etc/webapi.xsd">
    <route url="/V1/{entity}/:id" method="GET">
        <service class="{Vendor}\{Module}\Api\{ServiceName}Interface" method="getById"/>
        <resources>
            <resource ref="{Vendor}_{Module}::{entity}_view"/>
        </resources>
    </route>
    <route url="/V1/{entity}" method="POST">
        <service class="{Vendor}\{Module}\Api\{ServiceName}Interface" method="save"/>
        <resources>
            <resource ref="{Vendor}_{Module}::{entity}_manage"/>
        </resources>
    </route>
</routes>
```

---

## Skill 5: GraphQL Resolver

### When to use
User asks to "create GraphQL endpoint", "add GraphQL resolver", "extend GraphQL schema".

### Rules
- Schema in `etc/schema.graphqls`
- Resolver implements `\Magento\Framework\GraphQl\Query\ResolverInterface`
- Use `DataProvider` pattern for batch-loading (avoid N+1)
- Always validate authorization via `$context`
- Return arrays (not objects) from resolvers — the framework handles serialization

### Generated Files

| File | Purpose |
|------|---------|
| `etc/schema.graphqls` | GraphQL schema definition |
| `Model/Resolver/{ResolverName}.php` | Query/Mutation resolver |
| `Model/Resolver/DataProvider/{EntityName}.php` | Batch data provider |

### Template: schema.graphqls

```graphql
type Query {
    {entityName}(id: Int! @doc(description: "Entity ID")): {EntityName}
        @resolver(class: "{Vendor}\\{Module}\\Model\\Resolver\\{EntityName}")
        @doc(description: "Get entity by ID")
        @cache(cacheIdentity: "{Vendor}\\{Module}\\Model\\Resolver\\{EntityName}\\Identity")
}

type {EntityName} @doc(description: "{Entity description}") {
    id: Int @doc(description: "Entity ID")
    name: String @doc(description: "Entity name")
    created_at: String @doc(description: "Creation timestamp")
}
```

### Template: Resolver

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Model\Resolver;

use Magento\Framework\GraphQl\Config\Element\Field;
use Magento\Framework\GraphQl\Query\ResolverInterface;
use Magento\Framework\GraphQl\Schema\Type\ResolveInfo;
use Magento\Framework\GraphQl\Exception\GraphQlAuthorizationException;
use Magento\Framework\GraphQl\Exception\GraphQlNoSuchEntityException;
use {Vendor}\{Module}\Api\{ServiceName}Interface;

class {EntityName} implements ResolverInterface
{
    public function __construct(
        private readonly {ServiceName}Interface $service
    ) {
    }

    public function resolve(Field $field, $context, ResolveInfo $info, ?array $value = null, ?array $args = null): array
    {
        if (false === $context->getExtensionAttributes()->getIsCustomer()) {
            throw new GraphQlAuthorizationException(__('Customer is not authorized.'));
        }

        $id = (int)($args['id'] ?? 0);
        try {
            $entity = $this->service->getById($id);
        } catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
            throw new GraphQlNoSuchEntityException(__('Entity with id "%1" does not exist.', $id));
        }

        return [
            'id' => $entity->getId(),
            'name' => $entity->getName(),
            'created_at' => $entity->getCreatedAt(),
        ];
    }
}
```

---

## Skill 6: Admin UI Grid (UI Component)

### When to use
User asks to "create admin grid", "add listing page", "admin UI for entity".

### Rules
- Use UI Component XML (not layout blocks)
- DataProvider via `\Magento\Framework\View\Element\UiComponent\DataProvider\DataProvider`
- Collection must implement `\Magento\Framework\Api\Search\SearchResultInterface`
- Controller must extend `\Magento\Backend\App\Action`
- ACL check in `_isAllowed()`
- CSRF validation via `\Magento\Backend\App\Action\Context`

### Generated Files

| File | Purpose |
|------|---------|
| `view/adminhtml/ui_component/{entity}_listing.xml` | Grid definition |
| `Ui/Component/DataProvider/{Entity}DataProvider.php` | Data provider |
| `Controller/Adminhtml/{Entity}/Index.php` | Grid page controller |
| `view/adminhtml/layout/{route}_{controller}_{action}.xml` | Layout with UI component |
| `etc/adminhtml/menu.xml` | Admin menu entry |
| `etc/adminhtml/routes.xml` | Admin route |
| `etc/acl.xml` | ACL resource |

### Template: UI Component Grid (listing.xml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<listing xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_Ui:etc/ui_configuration.xsd">
    <argument name="data" xsi:type="array">
        <item name="js_config" xsi:type="array">
            <item name="provider" xsi:type="string">{entity}_listing.{entity}_listing_data_source</item>
        </item>
    </argument>
    <settings>
        <spinner>{entity}_listing_columns</spinner>
        <deps>
            <dep>{entity}_listing.{entity}_listing_data_source</dep>
        </deps>
    </settings>
    <dataSource name="{entity}_listing_data_source" component="Magento_Ui/js/grid/provider">
        <settings>
            <requestFieldName>id</requestFieldName>
            <primaryFieldName>entity_id</primaryFieldName>
        </settings>
        <aclResource>{Vendor}_{Module}::{entity}_view</aclResource>
        <dataProvider class="{Vendor}\{Module}\Ui\Component\DataProvider\{Entity}DataProvider"
                      name="{entity}_listing_data_source">
            <settings>
                <requestFieldName>id</requestFieldName>
                <primaryFieldName>entity_id</primaryFieldName>
            </settings>
        </dataProvider>
    </dataSource>
    <listingToolbar name="listing_top">
        <bookmark name="bookmarks"/>
        <columnsControls name="columns_controls"/>
        <filters name="listing_filters"/>
        <paging name="listing_paging"/>
    </listingToolbar>
    <columns name="{entity}_listing_columns">
        <selectionsColumn name="ids" sortOrder="0">
            <settings>
                <indexField>entity_id</indexField>
            </settings>
        </selectionsColumn>
        <column name="entity_id" sortOrder="10">
            <settings>
                <filter>textRange</filter>
                <label translate="true">ID</label>
                <sorting>asc</sorting>
            </settings>
        </column>
        <!-- Add columns here -->
    </columns>
</listing>
```

---

## Skill 7: Admin UI Form (UI Component)

### When to use
User asks to "create admin form", "add edit page", "entity create/edit form".

### Generated Files

| File | Purpose |
|------|---------|
| `view/adminhtml/ui_component/{entity}_form.xml` | Form definition |
| `Controller/Adminhtml/{Entity}/Edit.php` | Edit controller |
| `Controller/Adminhtml/{Entity}/Save.php` | Save controller |
| `Controller/Adminhtml/{Entity}/Delete.php` | Delete controller |
| `Model/{Entity}DataProvider.php` | Form data provider |

### Template: Admin Controller (with ACL + CSRF)

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Controller\Adminhtml\{Entity};

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\View\Result\PageFactory;

class Index extends Action
{
    public const ADMIN_RESOURCE = '{Vendor}_{Module}::{entity}_view';

    public function __construct(
        Context $context,
        private readonly PageFactory $resultPageFactory
    ) {
        parent::__construct($context);
    }

    public function execute(): \Magento\Framework\View\Result\Page
    {
        $resultPage = $this->resultPageFactory->create();
        $resultPage->setActiveMenu('{Vendor}_{Module}::{entity}');
        $resultPage->getConfig()->getTitle()->prepend(__('Manage {Entity}'));
        return $resultPage;
    }
}
```

---

## Skill 8: Storefront Block + Template

### When to use
User asks to "create a frontend block", "add storefront widget", "create a page section".

### Rules
- Block extends `\Magento\Framework\View\Element\Template`
- Use ViewModel pattern for presentation logic (not Block)
- Template = `.phtml` (minimal PHP, just render)
- Use `$escaper->escapeHtml()` / `$escaper->escapeUrl()` in templates
- Never use ObjectManager in blocks or templates
- Cacheable by default unless dynamically personalized

### Generated Files

| File | Purpose |
|------|---------|
| `Block/{BlockName}.php` | Block class (thin — delegates to ViewModel) |
| `ViewModel/{FeatureName}ViewModel.php` | Presentation logic |
| `view/frontend/templates/{feature}/{template}.phtml` | Template |
| `view/frontend/layout/{route}_{controller}_{action}.xml` | Layout |

### Template: ViewModel

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\ViewModel;

use Magento\Framework\View\Element\Block\ArgumentInterface;

class {FeatureName}ViewModel implements ArgumentInterface
{
    public function __construct(
        private readonly \{Vendor}\{Module}\Api\{ServiceName}Interface $service
    ) {
    }

    public function getItems(): array
    {
        // Presentation logic
        return [];
    }
}
```

### Template: .phtml (secure)

```php
<?php
/** @var \Magento\Framework\View\Element\Template $block */
/** @var \Magento\Framework\Escaper $escaper */
/** @var \{Vendor}\{Module}\ViewModel\{FeatureName}ViewModel $viewModel */
$viewModel = $block->getViewModel();
?>
<div class="{vendor}-{module}-{feature}">
    <?php foreach ($viewModel->getItems() as $item): ?>
        <div class="item">
            <?= $escaper->escapeHtml($item['name']) ?>
        </div>
    <?php endforeach; ?>
</div>
```

---

## Skill 9: Console Command (CLI)

### When to use
User asks to "create CLI command", "add bin/magento command", "console command".

### Rules
- Extend `\Symfony\Component\Console\Command\Command`
- Register in `etc/di.xml` under `Magento\Framework\Console\CommandListInterface`
- Use InputArgument/InputOption for parameters
- Return exit codes (0 = success, non-zero = failure)
- Log long-running operations with OutputInterface

### Generated Files

| File | Purpose |
|------|---------|
| `Console/Command/{CommandName}Command.php` | Command class |
| `etc/di.xml` | Command registration |

### Template: Console Command

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Console\Command;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class {CommandName}Command extends Command
{
    private const ARG_NAME = 'name';

    public function __construct(
        private readonly \{Vendor}\{Module}\Api\{ServiceName}Interface $service
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->setName('{vendor}:{module}:{command}')
            ->setDescription('{Command description}')
            ->addArgument(self::ARG_NAME, InputArgument::REQUIRED, 'Entity name');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        try {
            $name = $input->getArgument(self::ARG_NAME);
            // Command logic via injected service
            $output->writeln("<info>Success: {$name}</info>");
            return Command::SUCCESS;
        } catch (\Exception $e) {
            $output->writeln("<error>{$e->getMessage()}</error>");
            return Command::FAILURE;
        }
    }
}
```

### Template: di.xml registration

```xml
<type name="Magento\Framework\Console\CommandListInterface">
    <arguments>
        <argument name="commands" xsi:type="array">
            <item name="{vendor}_{module}_{command}" xsi:type="object">
                {Vendor}\{Module}\Console\Command\{CommandName}Command
            </item>
        </argument>
    </arguments>
</type>
```

---

## Skill 10: Cron Job

### When to use
User asks to "create a cron job", "scheduled task", "run something periodically".

### Rules
- Class in `Cron/` directory
- Schedule in `etc/crontab.xml`
- Use configurable schedule expression (from system.xml)
- Implement locking to prevent overlap (`\Magento\Framework\Lock\LockManagerInterface`)
- Keep execution time short; use message queues for heavy work

### Generated Files

| File | Purpose |
|------|---------|
| `Cron/{JobName}.php` | Cron job class |
| `etc/crontab.xml` | Schedule definition |

### Template: Cron Job (with locking)

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Cron;

use Magento\Framework\Lock\LockManagerInterface;
use Psr\Log\LoggerInterface;

class {JobName}
{
    private const LOCK_NAME = '{vendor}_{module}_{job_name}';
    private const LOCK_TIMEOUT = 300;

    public function __construct(
        private readonly LockManagerInterface $lockManager,
        private readonly LoggerInterface $logger
    ) {
    }

    public function execute(): void
    {
        if (!$this->lockManager->lock(self::LOCK_NAME, self::LOCK_TIMEOUT)) {
            $this->logger->info('Cron job already running, skipping.');
            return;
        }

        try {
            // Job logic
        } finally {
            $this->lockManager->unlock(self::LOCK_NAME);
        }
    }
}
```

### Template: crontab.xml

```xml
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_Cron:etc/crontab.xsd">
    <group id="{vendor}_{module}">
        <job name="{vendor}_{module}_{job_name}"
             instance="{Vendor}\{Module}\Cron\{JobName}"
             method="execute">
            <config_path>{vendor}_{module}/cron/{job_name}_schedule</config_path>
        </job>
    </group>
</config>
```

---

## Skill 11: Message Queue (Consumer/Publisher)

### When to use
User asks to "create message queue", "async processing", "publish/consume messages", "offload heavy work".

### Rules
- Define topology in `etc/communication.xml`
- Queue binding in `etc/queue_topology.xml`
- Consumer in `etc/queue_consumer.xml`
- Publisher in `etc/queue_publisher.xml`
- Use for: heavy processing, third-party API calls, async operations
- Consumer must be idempotent (may receive duplicates)
- Handle poison messages (dead letter after N retries)

### Generated Files

| File | Purpose |
|------|---------|
| `etc/communication.xml` | Message topic definition |
| `etc/queue_topology.xml` | Exchange + queue binding |
| `etc/queue_consumer.xml` | Consumer registration |
| `etc/queue_publisher.xml` | Publisher registration |
| `Queue/Consumer/{ConsumerName}.php` | Consumer class |
| `Queue/Publisher/{PublisherName}.php` | Publisher helper |

### Template: Consumer

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Queue\Consumer;

use Psr\Log\LoggerInterface;

class {ConsumerName}
{
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly \{Vendor}\{Module}\Api\{ServiceName}Interface $service
    ) {
    }

    /**
     * Process queue message.
     *
     * @param string $message JSON-encoded message payload
     */
    public function process(string $message): void
    {
        try {
            $data = json_decode($message, true, 512, JSON_THROW_ON_ERROR);
            // Process message via service
            $this->service->process($data);
        } catch (\JsonException $e) {
            $this->logger->error('Invalid message payload', ['error' => $e->getMessage()]);
        } catch (\Exception $e) {
            $this->logger->error('Queue processing failed', ['error' => $e->getMessage()]);
            throw $e; // Re-throw to trigger retry/dead-letter
        }
    }
}
```

---

## Skill 12: Declarative DB Schema

### When to use
User asks to "create database table", "add column", "DB schema", "add index".

### Rules
- Always use `db_schema.xml` (NOT InstallSchema/UpgradeSchema)
- Run `bin/magento setup:db-declaration:generate-whitelist` after changes
- Use proper column types (int/smallint/varchar/text/decimal/datetime/boolean)
- Add indexes for columns used in WHERE/JOIN/ORDER BY
- Add foreign keys for referential integrity
- Use `unsigned="true"` for ID columns
- Consider column sizes — don't over-allocate varchar lengths

### Generated Files

| File | Purpose |
|------|---------|
| `etc/db_schema.xml` | Table/column/index/constraint definitions |
| `etc/db_schema_whitelist.json` | Auto-generated whitelist |

### Template: db_schema.xml

```xml
<?xml version="1.0"?>
<schema xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:framework:Setup/Declaration/Schema/etc/schema.xsd">
    <table name="{vendor}_{module}_{entity}" resource="default" engine="innodb"
           comment="{Entity} Table">
        <column xsi:type="int" name="entity_id" unsigned="true" nullable="false"
                identity="true" comment="Entity ID"/>
        <column xsi:type="varchar" name="name" nullable="false" length="255"
                comment="Name"/>
        <column xsi:type="text" name="description" nullable="true"
                comment="Description"/>
        <column xsi:type="smallint" name="is_active" unsigned="true" nullable="false"
                default="1" comment="Is Active"/>
        <column xsi:type="int" name="store_id" unsigned="true" nullable="false"
                default="0" comment="Store ID"/>
        <column xsi:type="timestamp" name="created_at" nullable="false"
                default="CURRENT_TIMESTAMP" comment="Created At"/>
        <column xsi:type="timestamp" name="updated_at" nullable="false"
                default="CURRENT_TIMESTAMP" on_update="true" comment="Updated At"/>

        <constraint xsi:type="primary" referenceId="PRIMARY">
            <column name="entity_id"/>
        </constraint>
        <constraint xsi:type="foreign" referenceId="{VENDOR}_{MODULE}_{ENTITY}_STORE_ID_STORE_STORE_ID"
                    table="{vendor}_{module}_{entity}" column="store_id"
                    referenceTable="store" referenceColumn="store_id"
                    onDelete="CASCADE"/>
        <index referenceId="{VENDOR}_{MODULE}_{ENTITY}_IS_ACTIVE" indexType="btree">
            <column name="is_active"/>
        </index>
        <index referenceId="{VENDOR}_{MODULE}_{ENTITY}_STORE_ID" indexType="btree">
            <column name="store_id"/>
        </index>
    </table>
</schema>
```

---

## Skill 13: Data Patch

### When to use
User asks to "add initial data", "seed data", "migration data", "data patch".

### Rules
- Class in `Setup/Patch/Data/`
- Implements `\Magento\Framework\Setup\Patch\DataPatchInterface`
- Optionally `\Magento\Framework\Setup\Patch\PatchRevertableInterface`
- Dependencies declared via `getDependencies()` (other patches to run first)
- Patches are run once and tracked in `patch_list` table

### Generated Files

| File | Purpose |
|------|---------|
| `Setup/Patch/Data/{PatchName}.php` | Data patch class |

### Template: Data Patch

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Setup\Patch\Data;

use Magento\Framework\Setup\ModuleDataSetupInterface;
use Magento\Framework\Setup\Patch\DataPatchInterface;
use Magento\Framework\Setup\Patch\PatchRevertableInterface;

class {PatchName} implements DataPatchInterface, PatchRevertableInterface
{
    public function __construct(
        private readonly ModuleDataSetupInterface $moduleDataSetup
    ) {
    }

    public function apply(): self
    {
        $this->moduleDataSetup->startSetup();

        // Data migration logic
        $connection = $this->moduleDataSetup->getConnection();
        $connection->insertMultiple(
            $this->moduleDataSetup->getTable('{vendor}_{module}_{entity}'),
            [
                ['name' => 'Default Item', 'is_active' => 1],
            ]
        );

        $this->moduleDataSetup->endSetup();
        return $this;
    }

    public function revert(): void
    {
        $this->moduleDataSetup->startSetup();
        $connection = $this->moduleDataSetup->getConnection();
        $connection->delete($this->moduleDataSetup->getTable('{vendor}_{module}_{entity}'));
        $this->moduleDataSetup->endSetup();
    }

    public static function getDependencies(): array
    {
        return [];
    }

    public function getAliases(): array
    {
        return [];
    }
}
```

---

## Skill 14: System Configuration (system.xml)

### When to use
User asks to "add admin config", "system configuration", "settings page".

### Generated Files

| File | Purpose |
|------|---------|
| `etc/adminhtml/system.xml` | Configuration fields UI |
| `etc/config.xml` | Default values |
| `etc/acl.xml` | Config section ACL |
| `Model/Config/{FeatureName}.php` | Config helper (reads values) |

### Template: Config Helper

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Model\Config;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

class {FeatureName}
{
    private const XML_PATH_ENABLED = '{vendor}_{module}/{feature}/enabled';
    private const XML_PATH_API_KEY = '{vendor}_{module}/{feature}/api_key';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    public function isEnabled(?int $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(
            self::XML_PATH_ENABLED,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );
    }

    public function getApiKey(?int $storeId = null): string
    {
        return (string)$this->scopeConfig->getValue(
            self::XML_PATH_API_KEY,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );
    }
}
```

---

## Skill 15: Repository Pattern (CRUD)

### When to use
User asks to "create a repository", "CRUD for entity", "data model with persistence".

### Rules
- Interface in `Api/`
- Implementation in `Model/`
- ResourceModel for DB operations
- Collection for listing
- SearchResults for API-compatible listing
- Use `EntityManager` or direct ResourceModel (NOT save/load on model)

### Generated Files

| File | Purpose |
|------|---------|
| `Api/{EntityName}RepositoryInterface.php` | Repository contract |
| `Api/Data/{EntityName}Interface.php` | Entity DTO interface |
| `Api/Data/{EntityName}SearchResultsInterface.php` | Search results interface |
| `Model/{EntityName}.php` | Entity model |
| `Model/ResourceModel/{EntityName}.php` | Resource model |
| `Model/ResourceModel/{EntityName}/Collection.php` | Collection |
| `Model/{EntityName}Repository.php` | Repository implementation |
| `etc/di.xml` | Interface preferences |

---

## Skill 16: Frontend JavaScript (RequireJS Module)

### When to use
User asks to "create JS component", "add frontend interactivity", "knockout component", "jQuery widget".

### Rules
- Use RequireJS module pattern (`define(['jquery'], function($) {...})`)
- For DOM manipulation: jQuery widget (`$.widget`)
- For data binding: Knockout.js component
- Register via `requirejs-config.js`
- Never use inline `<script>` tags
- Never access DOM before it's ready

### Generated Files

| File | Purpose |
|------|---------|
| `view/frontend/web/js/{component-name}.js` | JS module |
| `view/frontend/requirejs-config.js` | RequireJS mapping |
| `view/frontend/web/template/{component-name}.html` | KO template (if needed) |

---

## Skill 17: Integration & Unit Tests

### When to use
User asks to "generate tests", "add unit tests", "integration test for module".

### Rules
- Unit tests: mock all dependencies, test one class
- Integration tests: use `\Magento\TestFramework\Helper\Bootstrap` for object manager
- Use fixtures (`@magentoDataFixture`) for integration test data
- Test service contracts, not implementations
- Cover: happy path, edge cases, error conditions, ACL

### Generated Files (Unit)

| File | Purpose |
|------|---------|
| `Test/Unit/Model/{ClassName}Test.php` | Unit test |

### Generated Files (Integration)

| File | Purpose |
|------|---------|
| `Test/Integration/Model/{ClassName}Test.php` | Integration test |
| `Test/Integration/_files/{fixture_name}.php` | Test fixture |
| `Test/Integration/_files/{fixture_name}_rollback.php` | Fixture rollback |

### Template: Unit Test

```php
<?php
declare(strict_types=1);

namespace {Vendor}\{Module}\Test\Unit\Model;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use {Vendor}\{Module}\Model\{ClassName};

class {ClassName}Test extends TestCase
{
    private {ClassName} $subject;
    private MockObject $dependencyMock;

    protected function setUp(): void
    {
        $this->dependencyMock = $this->createMock(\{DependencyInterface}::class);
        $this->subject = new {ClassName}($this->dependencyMock);
    }

    public function testMethodReturnsExpectedResult(): void
    {
        $this->dependencyMock->expects($this->once())
            ->method('getData')
            ->willReturn(['key' => 'value']);

        $result = $this->subject->execute();
        $this->assertSame('expected', $result);
    }
}
```

---

## Skill 18: EAV Attribute

### When to use
User asks to "add product attribute", "create customer attribute", "category attribute".

### Rules
- Use Data Patch to create EAV attributes (not InstallData)
- Set proper frontend_input, backend_type, source model
- Add to attribute set/group
- Consider indexing for filterable attributes

### Generated Files

| File | Purpose |
|------|---------|
| `Setup/Patch/Data/Add{AttributeName}Attribute.php` | EAV attribute creation |

---

## Deploy & Validate

### Deploy (if requested)

```bash
# Enable module
bin/magento module:enable {Vendor}_{Module}

# Run setup
bin/magento setup:upgrade

# Compile DI
bin/magento setup:di:compile

# Deploy static content (if frontend changes)
bin/magento setup:static-content:deploy -f

# Clear cache
bin/magento cache:flush
```

### Validate

| Check | Command |
|-------|---------|
| Module enabled | `bin/magento module:status {Vendor}_{Module}` |
| No DI errors | `bin/magento setup:di:compile` (exit 0) |
| DB schema applied | `bin/magento setup:db:status` |
| Coding standards | `vendor/bin/phpcs --standard=Magento2 app/code/{Vendor}/{Module}` |
| Unit tests pass | `vendor/bin/phpunit -c dev/tests/unit/phpunit.xml.dist app/code/{Vendor}/{Module}/Test/Unit` |

---

## Anti-Patterns (NEVER Generate)

| Anti-Pattern | Why | Correct Approach |
|-------------|-----|-----------------|
| `ObjectManager::getInstance()` | Bypasses DI, untestable | Constructor injection |
| `new ClassName()` for Magento classes | Untestable, breaks preferences | DI via constructor |
| Direct SQL queries | Bypasses model layer, no events | Repository/Collection |
| `exit`/`die` in code | Breaks execution flow | Throw exception |
| Hardcoded store/website IDs | Multi-store breakage | StoreManagerInterface |
| Hardcoded URLs | Environment breakage | UrlInterface |
| `$_GET`/`$_POST`/`$_REQUEST` | No input validation | Request object methods |
| Business logic in controllers | Untestable, not reusable | Service layer (Model/Api) |
| Business logic in templates | Unmaintainable | ViewModel pattern |
| `around` plugin when `after` works | Performance overhead | before/after plugins |
| Plugin on constructor | Framework violation | Use DI preference instead |
| Writing to `var/` without lock | Race conditions | LockManagerInterface |
| Catching generic `\Exception` | Swallows real errors | Catch specific exceptions |
| Mutable public properties | Encapsulation violation | Getters/setters or readonly |
