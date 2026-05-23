# Adobe Commerce (Magento) Rules

---

## Architecture Rules

---

### COMM-ARCH-001: Direct ObjectManager Usage

- **Severity**: High
- **Description**: Direct use of `ObjectManager::getInstance()` bypasses dependency injection, breaks testability, hides dependencies, and makes code impossible to trace statically. This is the most common anti-pattern in Commerce codebases.

#### Detect — Files to Scan
```
app/code/**/*.php
!app/code/**/Test/**
!app/code/**/registration.php
```

#### Detect — Bad Pattern
```regex
ObjectManager::getInstance\(\)
\$this->_objectManager->create\(
\$this->_objectManager->get\(
\\Magento\\Framework\\App\\ObjectManager::getInstance
```

#### Detect — Good Pattern
- Constructor injection: `public function __construct(private readonly ProductRepositoryInterface $productRepo)`
- Factory injection for dynamic creation: `private ProductInterfaceFactory $productFactory`
- Proxy injection for lazy loading: `private ProductRepositoryInterface\Proxy $productRepo`

#### Bad Example
```php
class ProductHelper
{
    public function getProduct(int $productId): ProductInterface
    {
        // BAD: Hidden dependency, untestable, bypasses DI container
        $objectManager = \Magento\Framework\App\ObjectManager::getInstance();
        $productRepository = $objectManager->get(ProductRepositoryInterface::class);
        return $productRepository->getById($productId);
    }

    public function createProduct(): ProductInterface
    {
        // BAD: Using ObjectManager to create instances
        $objectManager = \Magento\Framework\App\ObjectManager::getInstance();
        return $objectManager->create(ProductInterface::class);
    }
}
```

#### Good Example
```php
class ProductHelper
{
    public function __construct(
        private readonly ProductRepositoryInterface $productRepository,
        private readonly ProductInterfaceFactory $productFactory
    ) {}

    public function getProduct(int $productId): ProductInterface
    {
        return $this->productRepository->getById($productId);
    }

    public function createProduct(): ProductInterface
    {
        return $this->productFactory->create();
    }
}
```

#### False Positives
- `ObjectManager` usage in `registration.php` (required by framework)
- Usage in integration tests extending `\Magento\TestFramework\TestCase\AbstractController`
- CLI commands where DI isn't fully bootstrapped (rare, should still use DI when possible)
- Legacy core Magento files (vendor code, not your code to fix)

#### Related Rules
- `COMM-ARCH-002` (plugins — proper extension mechanism vs ObjectManager hacks)
- `COMM-ARCH-004` (missing dependencies — often ObjectManager masks missing di.xml entries)

---

### COMM-ARCH-002: Plugin (Interceptor) on Non-Interceptable Methods

- **Severity**: Critical
- **Description**: Plugins cannot intercept `final`, `private`, `static`, or `__construct` methods — they silently fail with no error. The plugin appears to work in di.xml but never executes at runtime, causing subtle bugs.

#### Detect — Files to Scan
```
app/code/**/etc/di.xml
app/code/**/Plugin/**/*.php
app/code/**/Plugins/**/*.php
```

#### Detect — Bad Pattern
1. In `di.xml`: Identify `<plugin>` declarations
2. Resolve the target class and method
3. Check if target method is `final`, `private`, `static`, or `__construct`

```regex
<plugin\s+name=".*"\s+type=".*".*/>
```

Then cross-reference with target class:
```regex
final\s+(public|protected)\s+function\s+
private\s+function\s+
public\s+static\s+function\s+
```

#### Detect — Good Pattern
- Plugins targeting `public` non-final methods
- Using events/observers for scenarios where plugins can't intercept
- Using `preference` (class rewrite) for final method overrides (with caution)

#### Bad Example
```xml
<!-- di.xml -->
<type name="Magento\Catalog\Model\Product">
    <plugin name="mysite_product_plugin" type="MyVendor\MyModule\Plugin\ProductPlugin"/>
</type>
```

```php
// Target method is final — plugin will NEVER execute
class ProductPlugin
{
    public function afterGetSku(\Magento\Catalog\Model\Product $subject, $result)
    {
        // This NEVER runs if getSku() is final in the target class
        return strtoupper($result);
    }
}
```

#### Good Example
```php
// Plugin targeting a public non-final method
class ProductPlugin
{
    public function afterGetName(\Magento\Catalog\Model\Product $subject, $result): string
    {
        return trim($result) . ' - On Sale';
    }

    public function aroundGetPrice(
        \Magento\Catalog\Model\Product $subject,
        callable $proceed,
        ...$args
    ): float {
        $price = $proceed(...$args);
        return $price * 0.9; // 10% discount
    }
}
```

#### False Positives
- Plugins on interface methods (valid — the concrete class may not be final)
- Plugins targeting methods that were non-final in the installed version (could break on upgrade though)

#### Related Rules
- `COMM-ARCH-003` (preference overrides — alternative to plugins for non-interceptable methods)

#### References
- https://developer.adobe.com/commerce/php/development/components/plugins/

---

### COMM-ARCH-003: Preference Override Without Upstream Compatibility

- **Severity**: High
- **Description**: Full class preferences (`<preference>`) replace the entire class, breaking when upstream adds new methods, changes signatures, or fixes bugs. Unlike plugins, preferences don't compose — the last one wins.

#### Detect — Files to Scan
```
app/code/**/etc/di.xml
app/code/**/etc/frontend/di.xml
app/code/**/etc/adminhtml/di.xml
```

#### Detect — Bad Pattern
```regex
<preference\s+for="Magento\\.*"\s+type="
```

Then check the rewrite class:
- Does NOT call `parent::` for overridden methods
- Does NOT implement the same interface as the original
- Overrides more methods than necessary

#### Detect — Good Pattern
- Preference implements the same interface
- Only overrides specific methods, delegates rest to parent
- Comment explaining why a plugin can't solve this

#### Bad Example
```xml
<!-- di.xml -->
<preference for="Magento\Catalog\Model\Product" type="MyVendor\MyModule\Model\Product"/>
```

```php
// Completely replaces Product — breaks on every Magento upgrade
namespace MyVendor\MyModule\Model;

class Product extends \Magento\Catalog\Model\Product
{
    // Overrides getName() — but what about new methods added in 2.4.7?
    public function getName()
    {
        // Custom logic that doesn't call parent
        return $this->getData('custom_name') ?: $this->getData('name');
    }

    // Overrides getPrice() — conflicts with other extensions
    public function getPrice()
    {
        return $this->getData('special_price') ?: parent::getPrice();
    }
}
```

#### Good Example
```xml
<!-- di.xml — use plugin instead of preference -->
<type name="Magento\Catalog\Model\Product">
    <plugin name="mysite_product_name" type="MyVendor\MyModule\Plugin\ProductNamePlugin" sortOrder="10"/>
</type>
```

```php
// OR if preference is truly needed:
namespace MyVendor\MyModule\Model;

use Magento\Catalog\Api\Data\ProductInterface;

class Product extends \Magento\Catalog\Model\Product implements ProductInterface
{
    /**
     * Preference required because getName() is final in base class.
     * Only overrides single method, delegates everything else.
     */
    public function getName()
    {
        $name = parent::getName();
        return $this->applyCustomNaming($name);
    }
}
```

#### False Positives
- Preferences for interfaces (expected pattern: `<preference for="...Interface" type="..."/>`)
- Preferences for framework extension points designed for replacement (e.g., custom session handler)

#### Related Rules
- `COMM-ARCH-002` (plugins — preferred over preferences)
- `COMM-ARCH-004` (missing dependencies — preferences hide dependency issues)

---

### COMM-ARCH-004: Missing Module Dependencies

- **Severity**: Medium
- **Description**: Modules must declare all dependencies in both `etc/module.xml` (sequence) and `composer.json` (require). Missing declarations cause random failures depending on module load order and break `setup:di:compile`.

#### Detect — Files to Scan
```
app/code/**/etc/module.xml
app/code/**/composer.json
app/code/**/*.php
```

#### Detect — Bad Pattern
1. Scan PHP `use` statements for classes from other modules
2. Check if those modules are listed in `etc/module.xml` `<sequence>` and `composer.json` `require`
3. Flag missing entries

```regex
use\s+Magento\\(\w+)\\  # Extract module name from use statement
```

Cross-reference with:
```xml
<!-- module.xml should have -->
<sequence><module name="Magento_CatalogModule"/></sequence>
```

#### Detect — Good Pattern
- Every `use Magento\Xxx\` has corresponding `Magento_Xxx` in sequence
- `composer.json` `require` lists all used packages

#### Bad Example
```xml
<!-- etc/module.xml — missing Magento_Customer dependency -->
<config>
    <module name="MyVendor_MyModule" setup_version="1.0.0">
        <sequence>
            <module name="Magento_Catalog"/>
            <!-- MISSING: Magento_Customer — used in PHP code -->
        </sequence>
    </module>
</config>
```

```php
// PHP code uses Customer module classes
use Magento\Customer\Api\CustomerRepositoryInterface; // NOT in module.xml sequence!
```

#### Good Example
```xml
<config>
    <module name="MyVendor_MyModule" setup_version="1.0.0">
        <sequence>
            <module name="Magento_Catalog"/>
            <module name="Magento_Customer"/>
            <module name="Magento_Sales"/>
        </sequence>
    </module>
</config>
```

#### False Positives
- Soft dependencies (optional features that work without the module) — should use `<module>` without `<sequence>`
- Framework-level classes (`Magento\Framework\*`) — don't need explicit sequence entries

#### Related Rules
- `COMM-ARCH-001` (ObjectManager usage hides dependencies from static analysis)

---

### COMM-ARCH-005: Improper Event Observer Usage

- **Severity**: Medium
- **Description**: Events/observers are powerful but misuse causes performance issues and unexpected behavior. Common problems: heavy logic in frequently-fired events, modifying data in observers that fire after save, and circular event chains.

#### Detect — Files to Scan
```
app/code/**/etc/events.xml
app/code/**/etc/frontend/events.xml
app/code/**/etc/adminhtml/events.xml
app/code/**/Observer/**/*.php
```

#### Detect — Bad Pattern
- Observer on `catalog_product_save_before` or `sales_order_save_after` with external API calls
- Observer that loads collections inside (N+1 pattern)
- Multiple observers on same event doing sequential dependent operations
- Observer on `controller_action_predispatch` doing heavy work (fires on EVERY request)

#### Detect — Good Pattern
- Lightweight observers that set flags or enqueue jobs
- Observers on specific events (not generic ones)
- Using `after` plugins for method-specific interception instead of broad events

#### Bad Example
```xml
<!-- events.xml -->
<event name="controller_action_predispatch">
    <observer name="mysite_track_visitor" instance="MyVendor\MyModule\Observer\TrackVisitor"/>
</event>
```

```php
class TrackVisitor implements ObserverInterface
{
    public function execute(Observer $observer)
    {
        // BAD: External API call on EVERY page request
        $this->analyticsApi->trackPageView($observer->getRequest()->getFullActionName());
        // BAD: Database query on every request
        $visitor = $this->visitorRepository->getBySession(session_id());
    }
}
```

#### Good Example
```php
class TrackVisitor implements ObserverInterface
{
    public function execute(Observer $observer)
    {
        // Lightweight: just enqueue for async processing
        $this->messageQueue->publish('mysite.analytics.pageview', json_encode([
            'action' => $observer->getRequest()->getFullActionName(),
            'timestamp' => time()
        ]));
    }
}
```

#### False Positives
- Admin-only observers where performance is less critical
- One-time setup events (`catalog_category_prepare_save` for admin saves)

---

## Performance Rules

---

### COMM-PERF-001: N+1 Queries in Collections

- **Severity**: High
- **Description**: Loading related entities inside a loop creates N+1 database query patterns. With collections of 100+ items, this causes hundreds of queries per page load, severely impacting TTFB.

#### Detect — Files to Scan
```
app/code/**/*.php
app/code/**/*.phtml
!app/code/**/Test/**
```

#### Detect — Bad Pattern
```regex
foreach\s*\(.*\$collection.*\)\s*\{[\s\S]*?\$\w+->get(Product|Customer|Category|Order|Item|Address)\(
foreach\s*\(.*\)\s*\{[\s\S]*?\$\w+Repository->get(ById|List)\(
foreach\s*\(.*\)\s*\{[\s\S]*?\$\w+->load\(
```

#### Detect — Good Pattern
- Collection joins before iteration: `$collection->join(...)`
- Batch loading with `getList()` + SearchCriteria before loop
- Extension attributes with join: `addExtensionAttributes()`

#### Bad Example
```php
// N+1: Each iteration triggers a separate SQL query
$orderCollection = $this->orderCollectionFactory->create()
    ->addFieldToFilter('status', 'pending');

foreach ($orderCollection as $order) {
    // BAD: Loads customer per order = N additional queries
    $customer = $this->customerRepository->getById($order->getCustomerId());
    $email = $customer->getEmail();

    // BAD: Loads all items per order = N additional queries
    $items = $order->getAllItems(); // Lazy-loads from DB

    foreach ($items as $item) {
        // BAD: Loads product per item = N×M additional queries!
        $product = $this->productRepository->getById($item->getProductId());
        $sku = $product->getSku();
    }
}
```

#### Good Example
```php
// Pre-load all needed data with joins and batch fetching
$orderCollection = $this->orderCollectionFactory->create()
    ->addFieldToFilter('status', 'pending');

// Join customer email directly
$orderCollection->getSelect()->joinLeft(
    ['ce' => $orderCollection->getResource()->getTable('customer_entity')],
    'main_table.customer_id = ce.entity_id',
    ['customer_email' => 'ce.email']
);

// Batch-load all order items
$orderIds = $orderCollection->getColumnValues('entity_id');
$itemCollection = $this->orderItemCollectionFactory->create()
    ->addFieldToFilter('order_id', ['in' => $orderIds]);

// Group items by order
$itemsByOrder = [];
foreach ($itemCollection as $item) {
    $itemsByOrder[$item->getOrderId()][] = $item;
}

// Now iterate without additional queries
foreach ($orderCollection as $order) {
    $email = $order->getData('customer_email'); // From join
    $items = $itemsByOrder[$order->getId()] ?? [];
}
```

#### False Positives
- Loops with < 5 iterations where the N+1 impact is negligible
- Admin grids that are paginated with small page sizes
- CLI commands where latency doesn't matter

#### Related Rules
- `COMM-GQL-002` (GraphQL resolver N+1 — same pattern in API layer)
- `COMM-PERF-003` (unnecessary collection load — related collection issue)

---

### COMM-PERF-002: Missing Full Page Cache Compatibility

- **Severity**: High
- **Description**: Magento's Full Page Cache (FPC) serves cached HTML for anonymous users. Blocks containing user-specific data (cart, wishlist, customer name) must use the private content (sections) system via JavaScript, otherwise FPC is disabled for the entire page.

#### Detect — Files to Scan
```
app/code/**/view/frontend/layout/**/*.xml
app/code/**/Block/**/*.php
app/code/**/view/frontend/templates/**/*.phtml
app/code/**/etc/frontend/sections.xml
```

#### Detect — Bad Pattern
- Layout XML with `cacheable="false"` on a block (disables FPC for entire page)
- Block PHP class accessing `$this->customerSession->getCustomer()` or `$this->cart->getQuote()`
- Template directly echoing customer-specific data without JS section loader

#### Detect — Good Pattern
- Customer data served via `sections.xml` (private content / customer sections)
- `data-bind="scope: 'customer'"` in templates using Knockout.js
- No `cacheable="false"` in layout XML

#### Bad Example
```xml
<!-- layout XML — disables FPC for entire page! -->
<referenceContainer name="header">
    <block class="MyVendor\MyModule\Block\CustomerGreeting"
           template="MyVendor_MyModule::greeting.phtml"
           cacheable="false"/>  <!-- KILLS FPC -->
</referenceContainer>
```

```php
// Block class accessing session — forces cacheable="false"
class CustomerGreeting extends Template
{
    public function getCustomerName(): string
    {
        return $this->customerSession->getCustomer()->getName();
    }
}
```

#### Good Example
```xml
<!-- sections.xml — register a private content section -->
<config>
    <action name="customer/account/login">
        <section name="customer-greeting"/>
    </action>
</config>
```

```html
<!-- Template using JS to load private data -->
<div data-bind="scope: 'customer-greeting'">
    <span data-bind="text: customer().fullname"></span>
</div>
<script type="text/x-magento-init">
    {"*": {"Magento_Ui/js/core/app": {"components": {"customer-greeting": {
        "component": "MyVendor_MyModule/js/greeting",
        "customerData": "customer"
    }}}}}
</script>
```

#### False Positives
- Checkout/cart pages (already not cached)
- Admin area pages (no FPC)
- `cacheable="false"` on a block that's only used on uncached pages (customer account)

#### Related Rules
- `COMM-PERF-001` (N+1 in blocks compounds the problem when FPC is disabled)

#### References
- https://developer.adobe.com/commerce/php/development/cache/page/private-content/

---

### COMM-PERF-003: Unnecessary Collection Load

- **Severity**: Medium
- **Description**: Calling `$collection->load()` explicitly or iterating a collection when only a count or specific columns are needed wastes memory and DB resources. Collections load all columns by default.

#### Detect — Files to Scan
```
app/code/**/*.php
!app/code/**/Test/**
```

#### Detect — Bad Pattern
```regex
\$\w+Collection->load\(\)->getSize\(\)
\$\w+Collection->load\(\)->count\(\)
\$\w+->getCollection\(\)->load\(\)(?!.*getItems)
count\(\$\w+Collection->load\(\)\)
```

#### Detect — Good Pattern
- `$collection->getSize()` (uses COUNT SQL, no load)
- `$collection->addFieldToSelect(['id', 'name'])` (limit columns)
- `$collection->setPageSize($limit)->setCurPage($page)` (pagination)
- `$collection->getColumnValues('entity_id')` (single column fetch)

#### Bad Example
```php
// BAD: Loads ALL products into memory just to count them
$collection = $this->productCollectionFactory->create();
$collection->addFieldToFilter('status', 1);
$totalCount = $collection->load()->getSize(); // load() is wasteful here

// BAD: Loads all columns when only SKU is needed
$collection = $this->productCollectionFactory->create();
foreach ($collection as $product) {
    $skus[] = $product->getSku(); // Loaded all 50+ columns per product
}
```

#### Good Example
```php
// Count without loading
$collection = $this->productCollectionFactory->create();
$collection->addFieldToFilter('status', 1);
$totalCount = $collection->getSize(); // COUNT(*) query only

// Select only needed columns
$collection = $this->productCollectionFactory->create();
$collection->addFieldToSelect(['entity_id', 'sku']);
$collection->setPageSize(100);
$skus = $collection->getColumnValues('sku');
```

#### False Positives
- Collections that genuinely need all data (export operations)
- Collections with < 10 items where optimization is premature

#### Related Rules
- `COMM-PERF-001` (N+1 — often combined with unnecessary full load)
- `COMM-PERF-004` (indexer strategy — collections in indexers need careful handling)

---

### COMM-PERF-004: Missing Indexer Optimization

- **Severity**: Medium
- **Description**: Custom indexers should support partial reindex via Mview (materialized view) changelog to avoid full reindex on every product/category save. Without this, a single product save triggers full reindex of custom indexes.

#### Detect — Files to Scan
```
app/code/**/etc/indexer.xml
app/code/**/etc/mview.xml
app/code/**/Model/Indexer/**/*.php
```

#### Detect — Bad Pattern
- `indexer.xml` entry without corresponding `mview.xml` entry
- Indexer class implementing only `executeFull()` without `executeRow()`/`executeList()`
- `mview.xml` without changelog subscription

#### Detect — Good Pattern
```xml
<!-- mview.xml -->
<view id="mysite_custom_index" class="MyVendor\MyModule\Model\Indexer\CustomIndexer" group="indexer">
    <subscriptions>
        <table name="catalog_product_entity" entity_column="entity_id"/>
    </subscriptions>
</view>
```

#### Bad Example
```php
class CustomIndexer implements IndexerInterface
{
    public function executeFull()
    {
        // Reindexes ALL 50K products every time
        $collection = $this->productCollectionFactory->create();
        foreach ($collection as $product) {
            $this->processProduct($product);
        }
    }

    // MISSING: executeRow(), executeList()
}
```

#### Good Example
```php
class CustomIndexer implements IndexerInterface, DimensionProviderInterface
{
    public function executeFull()
    {
        $this->executeByDimensions([]);
    }

    public function executeRow($id)
    {
        $this->executeList([$id]);
    }

    public function executeList(array $ids)
    {
        // Only reindex changed products
        $collection = $this->productCollectionFactory->create();
        $collection->addIdFilter($ids);
        foreach ($collection as $product) {
            $this->processProduct($product);
        }
    }
}
```

#### False Positives
- Indexes that genuinely need full rebuild (rare, e.g., full-text search re-scoring)
- Development/staging-only indexes

---

## Security Rules

---

### COMM-SEC-001: Missing CSRF Validation

- **Severity**: Critical
- **Description**: POST/PUT/DELETE controller actions without CSRF (form key) validation allow Cross-Site Request Forgery attacks. Attackers can trick authenticated admin/customer into performing actions.

#### Detect — Files to Scan
```
app/code/**/Controller/**/*.php
```

#### Detect — Bad Pattern
```regex
class\s+\w+\s+extends\s+(Action|AbstractAction)(?![\s\S]*CsrfAwareActionInterface)(?![\s\S]*_validateFormKey)
public\s+function\s+execute\(\).*\{[\s\S]*\$this->getRequest\(\)->(getPost|isPost)(?![\s\S]*formKey|form_key|CsrfValidator)
```

#### Detect — Good Pattern
- Class implements `CsrfAwareActionInterface` with proper `createCsrfValidationException()` and `validateForCsrf()`
- Or validates form key: `if (!$this->_formKeyValidator->validate($this->getRequest()))`
- For API endpoints: Uses `\Magento\Framework\App\CsrfAwareActionInterface`

#### Bad Example
```php
class SaveSettings extends Action
{
    public function execute()
    {
        // BAD: No CSRF validation — any site can POST to this endpoint
        $data = $this->getRequest()->getPostValue();
        $this->settingsService->save($data);
        return $this->redirectToSuccess();
    }
}
```

#### Good Example
```php
use Magento\Framework\App\CsrfAwareActionInterface;
use Magento\Framework\App\Request\InvalidRequestException;
use Magento\Framework\App\RequestInterface;

class SaveSettings extends Action implements CsrfAwareActionInterface
{
    public function createCsrfValidationException(RequestInterface $request): ?InvalidRequestException
    {
        return new InvalidRequestException(
            $this->resultRedirectFactory->create()->setPath('*/*/edit'),
            [__('Invalid Form Key. Please refresh the page.')]
        );
    }

    public function validateForCsrf(RequestInterface $request): ?bool
    {
        return $request->getParam('form_key')
            && $this->formKeyValidator->validate($request);
    }

    public function execute()
    {
        $data = $this->getRequest()->getPostValue();
        $this->settingsService->save($data);
        return $this->redirectToSuccess();
    }
}
```

#### False Positives
- REST/GraphQL API endpoints (use token-based auth instead of form keys)
- Webhook receivers that validate via HMAC signature
- GET-only controllers (CSRF is primarily a concern for state-changing operations)

#### Related Rules
- `COMM-SEC-004` (unescaped output — XSS + CSRF = account takeover chain)

---

### COMM-SEC-002: Raw SQL Without Parameter Binding

- **Severity**: Critical
- **Description**: SQL queries using string concatenation or interpolation are vulnerable to SQL injection. All user-controllable values must use parameter binding via prepared statements or Magento's quoting methods.

#### Detect — Files to Scan
```
app/code/**/*.php
app/code/**/Setup/**/*.php
!app/code/**/Test/**
```

#### Detect — Bad Pattern
```regex
\$connection->query\s*\(\s*["']SELECT.*\$
\$connection->query\s*\(\s*["'].*\.\s*\$
->where\s*\(\s*["'].*\.\s*\$(?!connection)
\$connection->raw_query\s*\(
"SELECT.*FROM.*WHERE.*\{\$
```

#### Detect — Good Pattern
- `$connection->quoteInto("field = ?", $value)`
- `$select->where('entity_id = ?', $id)`
- `$connection->select()->from(...)->where(..., $bind)`
- Prepared statements: `$connection->prepare($sql)->execute($bind)`

#### Bad Example
```php
// SQL INJECTION: User input directly in query
$customerId = $this->getRequest()->getParam('customer_id');
$sql = "SELECT * FROM customer_entity WHERE entity_id = " . $customerId;
$result = $connection->query($sql);

// SQL INJECTION: String interpolation
$email = $this->getRequest()->getParam('email');
$connection->query("SELECT * FROM customer_entity WHERE email = '{$email}'");

// SQL INJECTION: Concatenation in where clause
$collection->getSelect()->where("main_table.sku = '" . $sku . "'");
```

#### Good Example
```php
// SAFE: Parameter binding with ?
$select = $connection->select()
    ->from('customer_entity')
    ->where('entity_id = ?', (int)$customerId);
$result = $connection->fetchAll($select);

// SAFE: quoteInto
$where = $connection->quoteInto('email = ?', $email);
$connection->select()->from('customer_entity')->where($where);

// SAFE: Collection API
$collection->addFieldToFilter('sku', $sku);

// SAFE: Named binding
$sql = "SELECT * FROM customer_entity WHERE entity_id = :customer_id";
$bind = ['customer_id' => (int)$customerId];
$connection->fetchAll($sql, $bind);
```

#### False Positives
- Queries with only hardcoded values (no user input) — still bad practice but not exploitable
- Schema definition queries in setup scripts (`CREATE TABLE`, `ALTER TABLE`)
- Queries where the interpolated variable is a class constant or config value (not user input)

#### Related Rules
- `COMM-STD-002` (superglobals — raw input often flows into SQL)
- `COMM-SEC-001` (CSRF — can be used to trigger SQL injection via forged form submission)

---

### COMM-SEC-003: Missing ACL Check in Admin Controllers

- **Severity**: High
- **Description**: Admin controllers must verify the current admin user has permission for the action via ACL (Access Control List). Missing checks allow any admin user to access any admin feature, regardless of their role.

#### Detect — Files to Scan
```
app/code/**/Controller/Adminhtml/**/*.php
```

#### Detect — Bad Pattern
```regex
class\s+\w+\s+extends\s+.*\\Action(?![\s\S]*ADMIN_RESOURCE|_isAllowed)
extends\s+\\Magento\\Backend\\App\\Action(?![\s\S]*const\s+ADMIN_RESOURCE|_isAllowed)
```

#### Detect — Good Pattern
- `const ADMIN_RESOURCE = 'MyVendor_MyModule::resource_name';`
- Or `protected function _isAllowed() { return $this->_authorization->isAllowed('...'); }`

#### Bad Example
```php
namespace MyVendor\MyModule\Controller\Adminhtml\Settings;

use Magento\Backend\App\Action;

class Save extends Action
{
    // MISSING: No ADMIN_RESOURCE constant
    // MISSING: No _isAllowed() method
    // Any admin user can access this regardless of role

    public function execute()
    {
        $this->settingsService->save($this->getRequest()->getPostValue());
        return $this->resultRedirectFactory->create()->setPath('*/*/');
    }
}
```

#### Good Example
```php
namespace MyVendor\MyModule\Controller\Adminhtml\Settings;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;

class Save extends Action
{
    const ADMIN_RESOURCE = 'MyVendor_MyModule::settings_save';

    public function execute()
    {
        $this->settingsService->save($this->getRequest()->getPostValue());
        return $this->resultRedirectFactory->create()->setPath('*/*/');
    }
}
```

```xml
<!-- acl.xml -->
<acl>
    <resources>
        <resource id="Magento_Backend::admin">
            <resource id="MyVendor_MyModule::settings" title="Settings">
                <resource id="MyVendor_MyModule::settings_save" title="Save Settings"/>
            </resource>
        </resource>
    </resources>
</acl>
```

#### False Positives
- Controllers that inherit `ADMIN_RESOURCE` from a parent abstract class (check parent chain)
- AJAX controllers used only by already-ACL-checked pages (still should have own ACL)

#### Related Rules
- `COMM-SEC-001` (CSRF — ACL + CSRF = full auth protection)

---

### COMM-SEC-004: Unescaped Output in Templates

- **Severity**: High
- **Description**: All dynamic output in `.phtml` templates must be escaped using `$block->escapeHtml()`, `escapeUrl()`, `escapeJs()`, or `escapeHtmlAttr()`. Raw `<?= $variable ?>` enables stored/reflected XSS.

#### Detect — Files to Scan
```
app/code/**/view/**/*.phtml
app/design/**/templates/**/*.phtml
```

#### Detect — Bad Pattern
```regex
<\?=\s*\$(?!block->escape|this->escape|escaper->escape)\w+
<\?=\s*\$block->get\w+\(\)(?!\s*\?>.*escape)
echo\s+\$(?!block->escape|this->escape)
```

#### Detect — Good Pattern
```regex
<\?=\s*\$block->escapeHtml\(
<\?=\s*\$block->escapeUrl\(
<\?=\s*\$block->escapeHtmlAttr\(
<\?=\s*\$block->escapeJs\(
<\?=\s*\$escaper->escapeHtml\(
```

#### Bad Example
```php
<!-- XSS: Direct output without escaping -->
<h1><?= $block->getTitle() ?></h1>
<p><?= $product->getDescription() ?></p>
<a href="<?= $block->getUrl() ?>">Link</a>
<div class="<?= $className ?>">Content</div>
<script>var name = '<?= $customerName ?>';</script>
```

#### Good Example
```php
<!-- SAFE: Properly escaped output -->
<h1><?= $block->escapeHtml($block->getTitle()) ?></h1>
<p><?= $block->escapeHtml($product->getDescription(), ['p', 'br', 'strong']) ?></p>
<a href="<?= $block->escapeUrl($block->getUrl()) ?>">Link</a>
<div class="<?= $block->escapeHtmlAttr($className) ?>">Content</div>
<script>var name = '<?= $block->escapeJs($customerName) ?>';</script>
```

#### False Positives
- `<?= $block->getChildHtml() ?>` — child HTML is already rendered/escaped
- `<?= $block->getBlockHtml('...') ?>` — already rendered block output
- Integer/boolean values that can't contain HTML: `<?= (int)$productId ?>`
- Translation output: `<?= __('Static string') ?>` (no user data)

#### Related Rules
- `COMM-SEC-002` (SQL injection — combined with XSS enables attack chains)
- `AEMCS-SEC-003` (HTL XSS — same concept, different template engine)

---

## GraphQL Rules

---

### COMM-GQL-001: Missing Resolver Cache Identity

- **Severity**: Medium
- **Description**: GraphQL responses are cached by Magento's built-in caching layer. Resolvers without cache identity (`getIdentities()`) cause stale data or unnecessary cache misses. The `@cache` directive in schema must match the resolver's identity.

#### Detect — Files to Scan
```
app/code/**/Model/Resolver/**/*.php
app/code/**/etc/schema.graphqls
```

#### Detect — Bad Pattern
- Resolver class not implementing `\Magento\Framework\GraphQl\Query\Resolver\IdentityInterface`
- Schema field without `@cache(cacheIdentity: "...")` directive for data that should be cached
- `getIdentities()` returning empty array or overly broad cache tags

#### Detect — Good Pattern
- Resolver implements `IdentityInterface` with specific cache tags
- Schema uses `@cache(cacheIdentity: "MyVendor\\MyModule\\Model\\Resolver\\Identity\\Product")`
- Identity returns entity-specific tags: `['cat_p_' . $productId]`

#### Bad Example
```graphql
# schema.graphqls — no cache directive
type Query {
    customProducts(filter: ProductFilterInput): [Product] @resolver(class: "MyVendor\\MyModule\\Model\\Resolver\\CustomProducts")
}
```

```php
// Resolver without cache identity — responses not cached properly
class CustomProducts implements ResolverInterface
{
    public function resolve(Field $field, $context, ResolveInfo $info, array $value = null, array $args = null)
    {
        return $this->productRepository->getList($searchCriteria)->getItems();
    }
}
```

#### Good Example
```graphql
type Query {
    customProducts(filter: ProductFilterInput): [Product]
        @resolver(class: "MyVendor\\MyModule\\Model\\Resolver\\CustomProducts")
        @cache(cacheIdentity: "MyVendor\\MyModule\\Model\\Resolver\\Identity\\CustomProducts")
}
```

```php
class CustomProductsIdentity implements IdentityInterface
{
    public function getIdentities(array $resolvedData): array
    {
        $ids = [];
        foreach ($resolvedData as $product) {
            $ids[] = sprintf('cat_p_%s', $product['entity_id']);
        }
        return $ids;
    }
}
```

#### False Positives
- Mutation resolvers (mutations shouldn't be cached)
- Resolvers for highly dynamic data (real-time inventory, prices with customer-specific rules)

#### Related Rules
- `COMM-PERF-002` (FPC — GraphQL caching is the API equivalent)

---

### COMM-GQL-002: Heavy Resolver Without DataLoader Pattern

- **Severity**: High
- **Description**: GraphQL executes resolvers per-field per-item. A resolver calling `$repository->getById()` creates N+1 queries when a list of products is fetched. The batch/deferred resolver pattern (DataLoader) solves this.

#### Detect — Files to Scan
```
app/code/**/Model/Resolver/**/*.php
```

#### Detect — Bad Pattern
```regex
Repository->get(ById|)\s*\(\s*\$
->load\s*\(\s*\$value\[
class\s+\w+\s+implements\s+ResolverInterface[\s\S]*?function\s+resolve[\s\S]*?->getById\(
```

#### Detect — Good Pattern
- Extends `\Magento\Framework\GraphQl\Query\Resolver\BatchResolverInterface`
- Uses `$context->getExtensionAttributes()->getStore()` for batch context
- Collects IDs first, then batch-loads in a single query

#### Bad Example
```php
class ProductCustomAttribute implements ResolverInterface
{
    public function resolve(Field $field, $context, ResolveInfo $info, array $value = null, array $args = null)
    {
        // BAD: Called once per product in a list — N queries for N products
        $productId = $value['entity_id'];
        $product = $this->productRepository->getById($productId);
        return $product->getCustomAttribute('my_attribute')?->getValue();
    }
}
```

#### Good Example
```php
class ProductCustomAttribute implements BatchResolverInterface
{
    public function resolve(ContextInterface $context, Field $field, array $requests): BatchResponse
    {
        // Collect all product IDs from batch
        $productIds = array_map(fn($req) => $req->getValue()['entity_id'], $requests);

        // Single query for ALL products
        $searchCriteria = $this->searchCriteriaBuilder
            ->addFilter('entity_id', $productIds, 'in')
            ->create();
        $products = $this->productRepository->getList($searchCriteria)->getItems();

        // Map results back
        $productMap = [];
        foreach ($products as $product) {
            $productMap[$product->getId()] = $product->getCustomAttribute('my_attribute')?->getValue();
        }

        $response = new BatchResponse();
        foreach ($requests as $request) {
            $id = $request->getValue()['entity_id'];
            $response->addResponse($request, $productMap[$id] ?? null);
        }
        return $response;
    }
}
```

#### False Positives
- Resolvers for single-entity queries (not lists) where N=1 always
- Resolvers with internal caching that prevents duplicate queries

#### Related Rules
- `COMM-PERF-001` (N+1 in collections — same pattern in REST/page context)

---

## Coding Standards

---

### COMM-STD-001: Missing Strict Types Declaration

- **Severity**: Low
- **Description**: PHP files should declare `strict_types=1` to enable type coercion checking. Without it, PHP silently converts types, hiding bugs (e.g., passing string "abc" where int expected → 0).

#### Detect — Files to Scan
```
app/code/**/*.php
!app/code/**/registration.php
```

#### Detect — Bad Pattern
```regex
^<\?php\s*\n(?!declare\(strict_types\s*=\s*1\))
```

#### Detect — Good Pattern
```regex
^<\?php\s*\n\s*declare\(strict_types\s*=\s*1\);
```

#### Bad Example
```php
<?php

namespace MyVendor\MyModule\Model;
// Missing declare(strict_types=1) — type errors are silent
```

#### Good Example
```php
<?php

declare(strict_types=1);

namespace MyVendor\MyModule\Model;
```

#### False Positives
- `registration.php` (framework requirement — doesn't use strict types)
- Generated files in `generated/` folder
- Third-party library files

---

### COMM-STD-002: Direct Use of Superglobals

- **Severity**: High
- **Description**: Direct access to `$_GET`, `$_POST`, `$_REQUEST`, `$_SERVER`, `$_COOKIE` bypasses Magento's input validation and sanitization layer. This makes the code vulnerable to injection attacks and breaks testability.

#### Detect — Files to Scan
```
app/code/**/*.php
!app/code/**/Test/**
```

#### Detect — Bad Pattern
```regex
\$_GET\s*\[
\$_POST\s*\[
\$_REQUEST\s*\[
\$_SERVER\s*\[(?!'REQUEST_METHOD'|'REMOTE_ADDR'|'HTTP_HOST')
\$_COOKIE\s*\[
\$_FILES\s*\[
```

#### Detect — Good Pattern
- `$this->getRequest()->getParam('key')`
- `$this->getRequest()->getPostValue('key')`
- `$request->getServer('HTTP_HOST')`
- `$this->cookieManager->getCookie('name')`

#### Bad Example
```php
// DANGEROUS: Raw superglobal access
$customerId = $_GET['customer_id'];  // No validation, no sanitization
$formData = $_POST['data'];           // Bypasses CSRF & input filtering
$uploadedFile = $_FILES['document'];  // No Magento file validation
```

#### Good Example
```php
// SAFE: Magento request interface
$customerId = (int) $this->getRequest()->getParam('customer_id');
$formData = $this->getRequest()->getPostValue();
// File upload via Magento uploader
$uploader = $this->fileUploaderFactory->create(['fileId' => 'document']);
$uploader->setAllowedExtensions(['pdf', 'doc']);
```

#### False Positives
- `$_SERVER['REQUEST_METHOD']` for HTTP method detection (acceptable but still prefer Request interface)
- Test helpers that mock superglobals
- CLI entry points before Magento bootstrap

#### Related Rules
- `COMM-SEC-002` (SQL injection — superglobal values often flow to queries)
- `COMM-SEC-001` (CSRF — bypassing request interface also bypasses CSRF checks)
