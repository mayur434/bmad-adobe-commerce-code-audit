# AEM AMS — LLM Skills Reference

## Overview

AEM AMS does **not** use MCP servers. All code generation intelligence comes from:
1. **LLM Skills** — Built-in knowledge patterns in this file
2. **Project Scanning** — Static analysis of the codebase
3. **Custom Scripts Engine** — (Future) Automation scripts for live instance queries

> MCP support for AEM AMS will be delivered via a custom Scripts Engine in a future release.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  BMAD Code Generation Agent (AEM AMS)                       │
│                                                             │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │  LLM Skills     │  │  Project Scanner                 │ │
│  │  (this file)    │  │  (static analysis of source)     │ │
│  │                 │  │                                  │ │
│  │  • Patterns     │  │  • Component inventory           │ │
│  │  • Conventions  │  │  • Package structure             │ │
│  │  • Best prctcs  │  │  • Naming conventions            │ │
│  │  • Templates    │  │  • Dependency versions           │ │
│  │  • Anti-pats    │  │  • Runmode configs               │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Generation Engine                                    │   │
│  │  Combines skills + scanned context → output files     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Skill 1: Component Generation

### What to generate

| Artifact | Location | Format |
|----------|----------|--------|
| Sling Model | `core/src/main/java/{pkg}/models/` | Java class |
| HTL Template | `ui.apps/.../apps/{project}/components/{name}/` | `.html` |
| Dialog | `ui.apps/.../components/{name}/_cq_dialog/.content.xml` | XML |
| Edit Config | `ui.apps/.../components/{name}/_cq_editConfig/.content.xml` | XML |
| Node Definition | `ui.apps/.../components/{name}/.content.xml` | XML |
| Unit Test | `core/src/test/java/{pkg}/models/` | Java class |
| clientlib | `ui.apps/.../components/{name}/clientlib/` | CSS/JS |

### Component .content.xml template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:Component"
    jcr:title="{Component Title}"
    jcr:description="{Description}"
    componentGroup="{Project} - Content"
    sling:resourceSuperType="{parent/resource/type}"/>
```

### Dialog patterns (Touch UI)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
          xmlns:granite="http://www.adobe.com/jcr/granite/1.0"
    jcr:primaryType="nt:unstructured"
    jcr:title="{Component Title}"
    sling:resourceType="cq/gui/components/authoring/dialog">
    <content
        jcr:primaryType="nt:unstructured"
        sling:resourceType="granite/ui/components/coral/foundation/container">
        <items jcr:primaryType="nt:unstructured">
            <tabs
                jcr:primaryType="nt:unstructured"
                sling:resourceType="granite/ui/components/coral/foundation/tabs"
                maximized="{Boolean}true">
                <items jcr:primaryType="nt:unstructured">
                    <properties
                        jcr:primaryType="nt:unstructured"
                        jcr:title="Properties"
                        sling:resourceType="granite/ui/components/coral/foundation/container"
                        margin="{Boolean}true">
                        <items jcr:primaryType="nt:unstructured">
                            <!-- FIELD ITEMS HERE -->
                        </items>
                    </properties>
                </items>
            </tabs>
        </items>
    </content>
</jcr:root>
```

### Dialog field types (AEM 6.5)

| Field type | resourceType | Properties |
|-----------|-------------|-----------|
| Text field | `granite/ui/components/coral/foundation/form/textfield` | `name`, `fieldLabel`, `required` |
| Text area | `granite/ui/components/coral/foundation/form/textarea` | `name`, `fieldLabel`, `rows` |
| Rich text | `cq/gui/components/authoring/dialog/richtext` | `name`, `fieldLabel`, `useFixedInlineToolbar` |
| Checkbox | `granite/ui/components/coral/foundation/form/checkbox` | `name`, `text`, `value` |
| Select / Dropdown | `granite/ui/components/coral/foundation/form/select` | `name`, `fieldLabel` + child `<items>` |
| Path browser | `granite/ui/components/coral/foundation/form/pathfield` | `name`, `fieldLabel`, `rootPath` |
| Image (file upload) | `cq/gui/components/authoring/dialog/fileupload` | `name`, `fileNameParameter`, `fileReferenceParameter` |
| Multifield | `granite/ui/components/coral/foundation/form/multifield` | `name`, `fieldLabel`, `composite` + nested `<field>` |
| Color picker | `granite/ui/components/coral/foundation/form/colorfield` | `name`, `fieldLabel` |
| Date picker | `granite/ui/components/coral/foundation/form/datepicker` | `name`, `fieldLabel`, `type` (date/datetime) |
| Number field | `granite/ui/components/coral/foundation/form/numberfield` | `name`, `fieldLabel`, `min`, `max`, `step` |
| Hidden | `granite/ui/components/coral/foundation/form/hidden` | `name`, `value` |
| Tag field | `cq/gui/components/coral/common/form/tagfield` | `name`, `fieldLabel`, `rootPath` |
| Content Fragment | `dam/cfm/admin/components/authoring/contentfragment` | `name`, `fieldLabel`, `fragmentPath` |

---

## Skill 2: Sling Models

### Pattern (AEM 6.5 / AMS)

```java
package {base.package}.models;

import org.apache.sling.api.resource.Resource;
import org.apache.sling.models.annotations.DefaultInjectionStrategy;
import org.apache.sling.models.annotations.Model;
import org.apache.sling.models.annotations.injectorspecific.ValueMapValue;
import org.apache.sling.models.annotations.injectorspecific.ChildResource;
import org.apache.sling.models.annotations.injectorspecific.OSGiService;
import org.apache.sling.models.annotations.injectorspecific.Self;
import javax.annotation.PostConstruct;

@Model(
    adaptables = Resource.class,
    defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL
)
public class {ComponentName}Model {

    @ValueMapValue
    private String title;

    @ValueMapValue
    private String description;

    @ChildResource
    private Resource image;

    @PostConstruct
    protected void init() {
        // initialization logic
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }
}
```

### Key rules for AMS Sling Models:
- Use `javax.inject` / `javax.annotation` — NOT `jakarta.*`
- `adaptables = Resource.class` for component models
- `adaptables = SlingHttpServletRequest.class` when needing request context (e.g., i18n, selectors)
- Always use `defaultInjectionStrategy = OPTIONAL` unless you explicitly want REQUIRED
- Use `@PostConstruct` for init logic, not constructors
- Getters only — never public fields
- For JSON export: implement `ComponentExporter` and add `@Exporter` annotation (AEM 6.5.10+)

### Injector annotations:

| Annotation | Use for |
|-----------|---------|
| `@ValueMapValue` | JCR properties from component node |
| `@ChildResource` | Child nodes (nested resources) |
| `@OSGiService` | Inject OSGi services |
| `@Self` | Current resource/request |
| `@SlingObject` | Sling API objects (ResourceResolver, etc.) |
| `@ScriptVariable` | HTL scripting variables (currentPage, etc.) |
| `@RequestAttribute` | Request attributes (from HTL `data-sly-use`) |

---

## Skill 3: OSGi Services & Configurations

### Service pattern:

```java
// Interface
package {base.package}.services;

public interface {ServiceName} {
    String doSomething(String input);
}
```

```java
// Implementation
package {base.package}.services.impl;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Modified;
import org.osgi.service.component.annotations.Deactivate;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.metatype.annotations.Designate;
import org.osgi.service.metatype.annotations.ObjectClassDefinition;
import org.osgi.service.metatype.annotations.AttributeDefinition;

@Component(service = {ServiceName}.class, immediate = true)
@Designate(ocd = {ServiceName}Impl.Config.class)
public class {ServiceName}Impl implements {ServiceName} {

    @ObjectClassDefinition(name = "{Service Display Name}")
    @interface Config {
        @AttributeDefinition(name = "Property Name", description = "Description")
        String propertyName() default "default-value";
    }

    private Config config;

    @Reference
    private AnotherService dependency;

    @Activate
    @Modified
    protected void activate(Config config) {
        this.config = config;
    }

    @Override
    public String doSomething(String input) {
        return config.propertyName() + ": " + input;
    }
}
```

### OSGi config location (AMS runmode folders):

```
ui.apps/src/main/content/jcr_root/apps/{project}/
├── config/                           → All instances
│   └── {PID}.xml
├── config.author/                    → Author only
│   └── {PID}.xml
├── config.publish/                   → Publish only
│   └── {PID}.xml
├── config.dev/                       → Dev runmode
│   └── {PID}.xml
├── config.stage/                     → Stage runmode
│   └── {PID}.xml
├── config.prod/                      → Prod runmode
│   └── {PID}.xml
├── config.author.dev/                → Author + Dev combined
│   └── {PID}.xml
└── config.publish.prod/              → Publish + Prod combined
    └── {PID}.xml
```

### Config XML format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="sling:OsgiConfig"
    propertyName="value"
    integerProp="{Long}42"
    booleanProp="{Boolean}true"
    arrayProp="[value1,value2,value3]"/>
```

### Config JSON format (.cfg.json — AEM 6.5.4+):

```json
{
    "propertyName": "value",
    "integerProp": 42,
    "booleanProp": true,
    "arrayProp": ["value1", "value2", "value3"]
}
```

### Common OSGi configs to generate:

| PID | Purpose | Typical runmode |
|-----|---------|----------------|
| `org.apache.sling.commons.log.LogManager.factory.config` | Custom logger | All |
| `com.day.cq.dam.core.impl.servlet.AssetDownloadServlet` | DAM download limits | All |
| `org.apache.sling.jcr.resource.internal.JcrResourceResolverFactoryImpl` | Resource mapping | author/publish |
| `com.day.cq.wcm.core.impl.AuthoringUIModeServiceImpl` | Force Touch UI | author |
| `org.apache.sling.serviceusermapping.impl.ServiceUserMapperImpl.amended-{name}` | Service user | All |
| `com.day.cq.replication.impl.TransportHandler` | Replication transport | author |
| `org.apache.felix.http.sslfilter.SslFilter` | SSL termination | publish |

---

## Skill 4: Dispatcher (Classic AMS)

### Architecture:

```
dispatcher/
├── conf/
│   └── httpd.conf                  → Main Apache config
├── conf.d/
│   ├── available_vhosts/
│   │   ├── 000_default.vhost      → Default vhost
│   │   ├── {project}_author.vhost → Author VHost
│   │   └── {project}_publish.vhost→ Publish VHost
│   ├── enabled_vhosts/            → Symlinks to available_vhosts
│   ├── rewrites/
│   │   └── rewrite.rules          → URL rewrite rules
│   └── variables/
│       └── custom.vars            → Environment variables
└── conf.dispatcher.d/
    ├── available_farms/
    │   ├── 000_default.farm
    │   ├── {project}_author.farm  → Author farm
    │   └── {project}_publish.farm → Publish farm
    ├── enabled_farms/             → Symlinks to available_farms
    ├── cache/
    │   └── rules.any              → Cache rules
    ├── clientheaders/
    │   └── clientheaders.any      → Allowed headers
    ├── filters/
    │   └── filters.any            → Request filter rules
    └── renders/
        └── renders.any            → Backend render instances
```

### VHost template:

```apache
<VirtualHost *:80>
    ServerName publish-dev.{project}.adobecqms.net
    ServerAlias www.{project}.com

    DocumentRoot /mnt/var/www/html

    <Directory /mnt/var/www/html>
        Options FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    <IfModule disp_apache2.c>
        SetHandler dispatcher-handler
        ModMimeUsePathInfo On
    </IfModule>

    # Logging
    LogLevel warn
    ErrorLog ${APACHE_LOG_DIR}/{project}_publish_error.log
    CustomLog ${APACHE_LOG_DIR}/{project}_publish_access.log combined

    # Security headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"

    # Rewrites
    RewriteEngine On
    Include conf.d/rewrites/rewrite.rules

    # Redirect to HTTPS
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>
```

### Farm template:

```
/publishfarm {
    /clientheaders {
        $include "../clientheaders/clientheaders.any"
    }
    /virtualhosts {
        "publish-dev.{project}.adobecqms.net"
        "www.{project}.com"
    }
    /sessionmanagement {
        /directory "/tmp"
        /encode "md5"
        /header "HTTP:authorization"
    }
    /renders {
        $include "../renders/renders.any"
    }
    /filter {
        $include "../filters/filters.any"
    }
    /vanity_urls {
        /url "/libs/granite/dispatcher/content/vanityUrls.html"
        /file "/tmp/vanity_urls"
        /delay 300
    }
    /cache {
        /docroot "/mnt/var/www/html"
        /statfileslevel "2"
        /allowAuthorized "0"
        /rules {
            $include "../cache/rules.any"
        }
        /invalidate {
            /0000 { /glob "*" /type "deny" }
            /0001 { /glob "*.html" /type "allow" }
            /0002 { /glob "/etc/clientlibs/*" /type "allow" }
        }
        /headers {
            "Cache-Control"
            "Content-Disposition"
            "Content-Type"
            "Expires"
            "Last-Modified"
            "X-Content-Type-Options"
        }
        /enableTTL "1"
        /gracePeriod "2"
    }
    /statistics {
        /categories {
            /html { /glob "*.html" }
            /others { /glob "*" }
        }
    }
}
```

### Filter rules (security-first):

```
# Default deny
/0001 { /type "deny" /glob "*" }

# Allow content paths
/0010 { /type "allow" /method "GET" /url "/content/{project}/*" }
/0011 { /type "allow" /method "GET" /url "/content/dam/{project}/*" }

# Allow clientlibs
/0020 { /type "allow" /method "GET" /url "/etc.clientlibs/*" }
/0021 { /type "allow" /method "GET" /url "/etc/designs/{project}/*" }

# Allow static resources
/0030 { /type "allow" /method "GET" /url "/content/dam/*" /extension "(jpg|jpeg|gif|png|svg|ico|webp|pdf)" }

# Allow vanity URL resolution
/0040 { /type "allow" /method "GET" /url "/libs/granite/dispatcher/content/vanityUrls.html" }

# Deny sensitive paths
/0100 { /type "deny" /url "/bin/*" }
/0101 { /type "deny" /url "/crx/*" }
/0102 { /type "deny" /url "/system/*" }
/0103 { /type "deny" /url "/apps/*" }
/0104 { /type "deny" /url "/admin/*" }
/0105 { /type "deny" /url "/libs/cq/core/content/login*" }

# Allow specific bin servlets (whitelist)
/0200 { /type "allow" /method "GET" /url "/bin/{project}/search*" }
```

### Cache rules:

```
# Default deny
/0000 { /glob "*" /type "deny" }

# Cache HTML pages
/0001 { /glob "*.html" /type "allow" }

# Cache clientlibs
/0002 { /glob "/etc.clientlibs/*.css" /type "allow" }
/0003 { /glob "/etc.clientlibs/*.js" /type "allow" }

# Cache static assets
/0004 { /glob "*.gif" /type "allow" }
/0005 { /glob "*.jpg" /type "allow" }
/0006 { /glob "*.png" /type "allow" }
/0007 { /glob "*.svg" /type "allow" }
/0008 { /glob "*.ico" /type "allow" }
/0009 { /glob "*.webp" /type "allow" }

# Cache JSON (API responses)
/0010 { /glob "*.json" /type "allow" }

# Do NOT cache authenticated content
/0100 { /glob "* HTTP:authorization=*" /type "deny" }
```

---

## Skill 5: Replication Agents

### When to generate:
- User asks for content sync/publish configuration
- User mentions "replication", "activate", "publish"
- Setting up author → publish content flow

### Replication agent config XML:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:Page">
    <jcr:content
        jcr:primaryType="nt:unstructured"
        jcr:title="Publish Agent - {Environment}"
        sling:resourceType="cq/replication/components/agent"
        enabled="{Boolean}true"
        transportUri="https://publish-{env}.{project}.adobecqms.net/bin/receive?sling:authRequestLogin=1"
        transportUser="replication-service"
        logLevel="info"
        retryDelay="60000"
        serializationType="durbo"
        triggerReceive="{Boolean}true"
        triggerSpecific="{Boolean}true"/>
</jcr:root>
```

### Reverse replication agent:

```xml
<jcr:content
    jcr:primaryType="nt:unstructured"
    jcr:title="Reverse Replication - {Environment}"
    sling:resourceType="cq/replication/components/agent"
    enabled="{Boolean}true"
    transportUri="https://publish-{env}.{project}.adobecqms.net/bin/receive?sling:authRequestLogin=1"
    transportUser="replication-service"
    logLevel="info"
    serializationType="durbo"
    reverseReplication="{Boolean}true"/>
```

### Flush agent (for Dispatcher):

```xml
<jcr:content
    jcr:primaryType="nt:unstructured"
    jcr:title="Dispatcher Flush - {Environment}"
    sling:resourceType="cq/replication/components/agent"
    enabled="{Boolean}true"
    transportUri="http://dispatcher-{env}:80/dispatcher/invalidate.cache"
    logLevel="info"
    serializationType="flush"
    protocolHTTPMethod="GET"
    triggerReceive="{Boolean}true"
    protocolHTTPHeaders="[CQ-Action:{action},CQ-Handle:{path},CQ-Path:{path}]"/>
```

---

## Skill 6: Workflows

### Custom workflow process step:

```java
package {base.package}.workflows;

import com.adobe.granite.workflow.WorkflowException;
import com.adobe.granite.workflow.WorkflowSession;
import com.adobe.granite.workflow.exec.WorkItem;
import com.adobe.granite.workflow.exec.WorkflowProcess;
import com.adobe.granite.workflow.metadata.MetaDataMap;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component(
    service = WorkflowProcess.class,
    property = {"process.label={Process Display Name}"}
)
public class {ProcessName}Step implements WorkflowProcess {

    private static final Logger LOG = LoggerFactory.getLogger({ProcessName}Step.class);

    @Reference
    private SomeService someService;

    @Override
    public void execute(WorkItem workItem, WorkflowSession workflowSession, MetaDataMap args)
            throws WorkflowException {
        String payloadPath = workItem.getWorkflowData().getPayload().toString();
        LOG.info("Processing workflow step for: {}", payloadPath);

        try {
            // Process logic here
            someService.process(payloadPath);
        } catch (Exception e) {
            LOG.error("Workflow step failed for: {}", payloadPath, e);
            throw new WorkflowException("Processing failed", e);
        }
    }
}
```

### Workflow launcher config:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="nt:unstructured"
    sling:resourceType="cq/workflow/components/launcher"
    enabled="{Boolean}true"
    eventType="1"
    glob="/content/{project}/**"
    nodetype="cq:PageContent"
    condition="jcr:content/cq:lastModified"
    workflow="/var/workflow/models/{workflow-name}"/>
```

---

## Skill 7: Servlets & Filters

### Sling Servlet (by resource type):

```java
package {base.package}.servlets;

import org.apache.sling.api.SlingHttpServletRequest;
import org.apache.sling.api.SlingHttpServletResponse;
import org.apache.sling.api.servlets.HttpConstants;
import org.apache.sling.api.servlets.SlingAllMethodsServlet;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import javax.servlet.Servlet;
import javax.servlet.ServletException;
import java.io.IOException;

@Component(
    service = Servlet.class,
    property = {
        "sling.servlet.methods=" + HttpConstants.METHOD_GET,
        "sling.servlet.resourceTypes={project}/components/{component}",
        "sling.servlet.selectors={selector}",
        "sling.servlet.extensions=json"
    }
)
public class {Name}Servlet extends SlingAllMethodsServlet {

    @Reference
    private SomeService someService;

    @Override
    protected void doGet(SlingHttpServletRequest request, SlingHttpServletResponse response)
            throws ServletException, IOException {
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");

        String result = someService.getData(request.getResource());
        response.getWriter().write(result);
    }
}
```

### Sling Servlet (by path — use sparingly):

```java
@Component(
    service = Servlet.class,
    property = {
        "sling.servlet.methods=" + HttpConstants.METHOD_GET,
        "sling.servlet.paths=/bin/{project}/{name}"
    }
)
public class {Name}PathServlet extends SlingSafeMethodsServlet {
    // ...
}
```

### Sling Filter:

```java
package {base.package}.filters;

import org.apache.sling.api.SlingHttpServletRequest;
import org.apache.sling.api.SlingHttpServletResponse;
import org.apache.sling.servlets.annotations.SlingServletFilter;
import org.apache.sling.servlets.annotations.SlingServletFilterScope;
import org.osgi.service.component.annotations.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.*;
import java.io.IOException;

@Component
@SlingServletFilter(
    scope = SlingServletFilterScope.REQUEST,
    pattern = "/content/{project}/.*",
    order = -700
)
public class {Name}Filter implements Filter {

    private static final Logger LOG = LoggerFactory.getLogger({Name}Filter.class);

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        SlingHttpServletRequest slingRequest = (SlingHttpServletRequest) request;
        SlingHttpServletResponse slingResponse = (SlingHttpServletResponse) response;

        // Pre-processing logic
        LOG.debug("Filter processing: {}", slingRequest.getRequestURI());

        chain.doFilter(request, response);

        // Post-processing logic
    }

    @Override
    public void init(FilterConfig filterConfig) {}

    @Override
    public void destroy() {}
}
```

---

## Skill 8: Schedulers & Event Handlers

### Sling Scheduler (OSGi):

```java
package {base.package}.schedulers;

import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Deactivate;
import org.osgi.service.component.annotations.Modified;
import org.osgi.service.metatype.annotations.AttributeDefinition;
import org.osgi.service.metatype.annotations.Designate;
import org.osgi.service.metatype.annotations.ObjectClassDefinition;
import org.apache.sling.commons.scheduler.ScheduleOptions;
import org.apache.sling.commons.scheduler.Scheduler;
import org.osgi.service.component.annotations.Reference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component(service = Runnable.class, immediate = true)
@Designate(ocd = {Name}Scheduler.Config.class)
public class {Name}Scheduler implements Runnable {

    private static final Logger LOG = LoggerFactory.getLogger({Name}Scheduler.class);

    @ObjectClassDefinition(name = "{Scheduler Display Name}")
    @interface Config {
        @AttributeDefinition(name = "Cron Expression", description = "Cron-job expression")
        String scheduler_expression() default "0 0 2 * * ?"; // 2 AM daily

        @AttributeDefinition(name = "Enabled")
        boolean enabled() default true;

        @AttributeDefinition(name = "Concurrent")
        boolean scheduler_concurrent() default false;
    }

    @Reference
    private Scheduler scheduler;

    private int schedulerJobId;

    @Activate
    @Modified
    protected void activate(Config config) {
        if (config.enabled()) {
            ScheduleOptions options = scheduler.EXPR(config.scheduler_expression());
            options.name(getClass().getName());
            options.canRunConcurrently(config.scheduler_concurrent());
            scheduler.schedule(this, options);
            LOG.info("{Name}Scheduler activated with expression: {}", config.scheduler_expression());
        }
    }

    @Deactivate
    protected void deactivate() {
        scheduler.unschedule(getClass().getName());
    }

    @Override
    public void run() {
        LOG.info("{Name}Scheduler executing...");
        // Scheduled task logic
    }
}
```

### Sling Event Handler:

```java
package {base.package}.listeners;

import org.apache.sling.api.SlingConstants;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.event.Event;
import org.osgi.service.event.EventConstants;
import org.osgi.service.event.EventHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component(
    service = EventHandler.class,
    immediate = true,
    property = {
        EventConstants.EVENT_TOPIC + "=" + SlingConstants.TOPIC_RESOURCE_CHANGED,
        EventConstants.EVENT_FILTER + "=(path=/content/{project}/*)"
    }
)
public class {Name}EventHandler implements EventHandler {

    private static final Logger LOG = LoggerFactory.getLogger({Name}EventHandler.class);

    @Override
    public void handleEvent(Event event) {
        String path = (String) event.getProperty(SlingConstants.PROPERTY_PATH);
        LOG.info("Resource changed: {}", path);
        // Handle event
    }
}
```

### Page / Resource Event Handler (JCR Observation):

```java
package {base.package}.listeners;

import com.day.cq.wcm.api.PageEvent;
import com.day.cq.wcm.api.PageModification;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.event.Event;
import org.osgi.service.event.EventConstants;
import org.osgi.service.event.EventHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component(
    service = EventHandler.class,
    immediate = true,
    property = {
        EventConstants.EVENT_TOPIC + "=" + PageEvent.EVENT_TOPIC
    }
)
public class Page{Name}Listener implements EventHandler {

    private static final Logger LOG = LoggerFactory.getLogger(Page{Name}Listener.class);

    @Override
    public void handleEvent(Event event) {
        PageEvent pageEvent = PageEvent.fromEvent(event);
        if (pageEvent != null) {
            for (PageModification mod : pageEvent.getModifications()) {
                LOG.info("Page {} was {}", mod.getPath(), mod.getType());
            }
        }
    }
}
```

---

## Skill 9: Service Users & Permissions

### Service User Mapper config:

```xml
<!-- PID: org.apache.sling.serviceusermapping.impl.ServiceUserMapperImpl.amended-{project} -->
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="sling:OsgiConfig"
    user.mapping="[{bundle.symbolic.name}:{sub-service}={service-user-name}]"/>
```

### Using service users in code:

```java
@Reference
private ResourceResolverFactory resolverFactory;

private static final Map<String, Object> AUTH_INFO;
static {
    AUTH_INFO = new HashMap<>();
    AUTH_INFO.put(ResourceResolverFactory.SUBSERVICE, "{sub-service-name}");
}

public void doWork() {
    try (ResourceResolver resolver = resolverFactory.getServiceResourceResolver(AUTH_INFO)) {
        // Use resolver — auto-closed
        Resource resource = resolver.getResource("/content/{project}/path");
    } catch (LoginException e) {
        LOG.error("Service user login failed", e);
    }
}
```

### repo-init script (AEM 6.5.8+):

```
# scripts/repo-init/{project}-service-users.txt
create service user {project}-service
set ACL for {project}-service
    allow jcr:read on /content/{project}
    allow jcr:read,rep:write on /content/dam/{project}
    deny jcr:all on /content/{project}/secure
end
```

---

## Skill 10: Clientlibs (Client Libraries)

### Clientlib structure:

```
ui.apps/.../apps/{project}/clientlibs/
├── clientlib-base/
│   ├── .content.xml
│   ├── css/
│   │   └── site.css
│   ├── css.txt
│   ├── js/
│   │   └── site.js
│   └── js.txt
├── clientlib-author/
│   ├── .content.xml
│   ├── css/
│   └── css.txt
└── clientlib-dependencies/
    ├── .content.xml
    └── css.txt
```

### .content.xml:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:ClientLibraryFolder"
    categories="[{project}.base]"
    dependencies="[{project}.dependencies]"
    allowProxy="{Boolean}true"/>
```

### css.txt / js.txt:

```
#base=css
site.css
components/header.css
components/footer.css
```

### Component-specific clientlib:

```xml
<!-- In component folder: .../components/{name}/clientlib/.content.xml -->
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:ClientLibraryFolder"
    categories="[{project}.components.{name}]"
    allowProxy="{Boolean}true"/>
```

---

## Skill 11: Content Fragment Models

### Model definition:

**Output location:** `ui.content/src/main/content/jcr_root/conf/{project}/settings/dam/cfm/models/{model-name}/.content.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:cq="http://www.day.com/jcr/cq/1.0"
    jcr:primaryType="cq:Template"
    jcr:title="{Model Title}"
    jcr:description="{Model Description}"
    ranking="{Long}100">
    <jcr:content
        jcr:primaryType="dam:ContentFragment"
        cq:model="/conf/{project}/settings/dam/cfm/models/{model-name}"
        sling:resourceType="dam/cfm/models/console/components/data/entity/default">
        <model
            jcr:primaryType="nt:unstructured"
            dataTypesConfig="/mnt/overlay/settings/dam/cfm/models/formbuilderconfig"
            name="{model-name}"
            title="{Model Title}">
            <items jcr:primaryType="nt:unstructured">
                <!-- Fields defined here -->
                <title
                    jcr:primaryType="nt:unstructured"
                    fieldLabel="Title"
                    name="title"
                    required="{Boolean}true"
                    metaType="text-single"
                    valueType="string"/>
                <body
                    jcr:primaryType="nt:unstructured"
                    fieldLabel="Body"
                    name="body"
                    metaType="text-multi"
                    valueType="string"
                    cfm-element=""/>
            </items>
        </model>
    </jcr:content>
</jcr:root>
```

---

## Skill 12: Deployment & CI/CD (AMS)

### Maven profiles:

```xml
<!-- In root pom.xml -->
<profiles>
    <profile>
        <id>autoInstallSinglePackage</id>
        <activation>
            <activeByDefault>false</activeByDefault>
        </activation>
        <properties>
            <aem.host>localhost</aem.host>
            <aem.port>4502</aem.port>
            <sling.scheme>http</sling.scheme>
        </properties>
        <build>
            <plugins>
                <plugin>
                    <groupId>com.day.jcr.vault</groupId>
                    <artifactId>content-package-maven-plugin</artifactId>
                    <executions>
                        <execution>
                            <id>install-package</id>
                            <goals><goal>install</goal></goals>
                        </execution>
                    </executions>
                </plugin>
            </plugins>
        </build>
    </profile>
</profiles>
```

### Deploy commands:

```bash
# Local author (default)
mvn clean install -PautoInstallSinglePackage

# AMS Dev Author
mvn clean install -PautoInstallSinglePackage \
  -Daem.host=author-dev.{project}.adobecqms.net \
  -Daem.port=443 \
  -Dsling.scheme=https

# AMS Dev Publish
mvn clean install -PautoInstallSinglePackagePublish \
  -Daem.host=publish-dev.{project}.adobecqms.net \
  -Daem.port=443 \
  -Dsling.scheme=https
```

### Jenkins pipeline template:

```groovy
pipeline {
    agent any

    parameters {
        choice(name: 'ENVIRONMENT', choices: ['dev', 'stage', 'prod'], description: 'Target environment')
        booleanParam(name: 'DEPLOY_AUTHOR', defaultValue: true, description: 'Deploy to Author')
        booleanParam(name: 'DEPLOY_PUBLISH', defaultValue: true, description: 'Deploy to Publish')
    }

    environment {
        AEM_AUTHOR_HOST = "author-${params.ENVIRONMENT}.{project}.adobecqms.net"
        AEM_PUBLISH_HOST = "publish-${params.ENVIRONMENT}.{project}.adobecqms.net"
        AEM_PORT = "443"
        AEM_SCHEME = "https"
        MAVEN_OPTS = "-Xmx2048m"
    }

    stages {
        stage('Build') {
            steps {
                sh 'mvn clean install -DskipTests'
            }
        }

        stage('Unit Tests') {
            steps {
                sh 'mvn test'
            }
            post {
                always {
                    junit '**/target/surefire-reports/*.xml'
                }
            }
        }

        stage('Deploy to Author') {
            when { expression { params.DEPLOY_AUTHOR } }
            steps {
                sh """
                    mvn clean install -PautoInstallSinglePackage \
                      -Daem.host=${AEM_AUTHOR_HOST} \
                      -Daem.port=${AEM_PORT} \
                      -Dsling.scheme=${AEM_SCHEME}
                """
            }
        }

        stage('Deploy to Publish') {
            when { expression { params.DEPLOY_PUBLISH } }
            steps {
                sh """
                    mvn clean install -PautoInstallSinglePackagePublish \
                      -Daem.host=${AEM_PUBLISH_HOST} \
                      -Daem.port=${AEM_PORT} \
                      -Dsling.scheme=${AEM_SCHEME}
                """
            }
        }

        stage('Verify Bundles') {
            steps {
                sh """
                    curl -s -u ${AEM_USER}:${AEM_PASS} \
                      "${AEM_SCHEME}://${AEM_AUTHOR_HOST}/system/console/bundles.json" \
                      | jq -e '[.data[] | select(.state != "Active" and (.symbolicName | contains("{project}")))] | if length > 0 then error else "All bundles active" end'
                """
            }
        }

        stage('Flush Dispatcher') {
            steps {
                sh """
                    curl -H "CQ-Action: Activate" \
                         -H "CQ-Handle: /content/{project}" \
                         -H "Content-Type: application/octet-stream" \
                         "http://dispatcher-${params.ENVIRONMENT}:80/dispatcher/invalidate.cache"
                """
            }
        }
    }

    post {
        failure {
            emailext subject: "AEM Deploy Failed - ${params.ENVIRONMENT}",
                     body: "Build ${env.BUILD_NUMBER} failed for ${params.ENVIRONMENT}",
                     to: "{team-email}"
        }
    }
}
```

### GitLab CI template:

```yaml
stages:
  - build
  - test
  - deploy-dev
  - deploy-stage
  - deploy-prod

variables:
  MAVEN_OPTS: "-Xmx2048m"
  AEM_PORT: "443"
  AEM_SCHEME: "https"

build:
  stage: build
  script:
    - mvn clean install -DskipTests
  artifacts:
    paths:
      - all/target/*.zip

test:
  stage: test
  script:
    - mvn test
  artifacts:
    reports:
      junit: "**/target/surefire-reports/TEST-*.xml"

.deploy_template: &deploy_definition
  script:
    - |
      mvn clean install -PautoInstallSinglePackage \
        -Daem.host=${AEM_AUTHOR_HOST} \
        -Daem.port=${AEM_PORT} \
        -Dsling.scheme=${AEM_SCHEME}
    - |
      mvn clean install -PautoInstallSinglePackagePublish \
        -Daem.host=${AEM_PUBLISH_HOST} \
        -Daem.port=${AEM_PORT} \
        -Dsling.scheme=${AEM_SCHEME}

deploy-dev:
  stage: deploy-dev
  <<: *deploy_definition
  variables:
    AEM_AUTHOR_HOST: "author-dev.{project}.adobecqms.net"
    AEM_PUBLISH_HOST: "publish-dev.{project}.adobecqms.net"
  only:
    - develop

deploy-stage:
  stage: deploy-stage
  <<: *deploy_definition
  variables:
    AEM_AUTHOR_HOST: "author-stage.{project}.adobecqms.net"
    AEM_PUBLISH_HOST: "publish-stage.{project}.adobecqms.net"
  only:
    - main
  when: manual

deploy-prod:
  stage: deploy-prod
  <<: *deploy_definition
  variables:
    AEM_AUTHOR_HOST: "author-prod.{project}.adobecqms.net"
    AEM_PUBLISH_HOST: "publish-prod.{project}.adobecqms.net"
  only:
    - main
  when: manual
  environment:
    name: production
```

---

## Skill 13: Oak Index Definitions

### Custom Oak index (AEM AMS):

**Output location:** `ui.apps/src/main/content/jcr_root/_oak_index/`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:oak="http://jackrabbit.apache.org/oak/ns/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="oak:QueryIndexDefinition"
    type="lucene"
    compatVersion="{Long}2"
    async="async"
    evaluatePathRestrictions="{Boolean}true"
    includedPaths="[/content/{project}]"
    queryPaths="[/content/{project}]"
    reindex="{Boolean}false"
    reindexCount="{Long}1">
    <indexRules jcr:primaryType="nt:unstructured">
        <nt:unstructured jcr:primaryType="nt:unstructured">
            <properties jcr:primaryType="nt:unstructured">
                <title
                    jcr:primaryType="nt:unstructured"
                    name="jcr:content/jcr:title"
                    propertyIndex="{Boolean}true"
                    analyzed="{Boolean}true"
                    nodeScopeIndex="{Boolean}true"/>
                <cqTags
                    jcr:primaryType="nt:unstructured"
                    name="jcr:content/cq:tags"
                    propertyIndex="{Boolean}true"
                    isRegexp="{Boolean}false"/>
            </properties>
        </nt:unstructured>
    </indexRules>
</jcr:root>
```

> ⚠️ **Important for AMS:** After deploying a new index, you may need to trigger a reindex by setting `reindex=true` via CRX/DE or curl. This is a manual step (not automatic like AEMaaCS).

---

## Skill 14: Unit Tests (AEM 6.5)

### Dependencies (pom.xml):

```xml
<dependency>
    <groupId>io.wcm</groupId>
    <artifactId>io.wcm.testing.aem-mock.junit5</artifactId>
    <version>5.3.0</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-core</artifactId>
    <version>5.8.0</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-junit-jupiter</artifactId>
    <version>5.8.0</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>com.adobe.aem</groupId>
    <artifactId>uber-jar</artifactId>
    <version>6.5.0</version>
    <classifier>apis</classifier>
    <scope>provided</scope>
</dependency>
```

### Sling Model test:

```java
package {base.package}.models;

import io.wcm.testing.mock.aem.junit5.AemContext;
import io.wcm.testing.mock.aem.junit5.AemContextExtension;
import org.apache.sling.api.resource.Resource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(AemContextExtension.class)
class {ComponentName}ModelTest {

    private final AemContext context = new AemContext();

    private {ComponentName}Model model;

    @BeforeEach
    void setUp() {
        context.addModelsForClasses({ComponentName}Model.class);
        context.load().json("/models/{component-name}.json", "/content/test");
        Resource resource = context.resourceResolver().getResource("/content/test/{component-name}");
        model = resource.adaptTo({ComponentName}Model.class);
    }

    @Test
    void testGetTitle() {
        assertNotNull(model);
        assertEquals("Expected Title", model.getTitle());
    }

    @Test
    void testGetDescription() {
        assertEquals("Expected description text", model.getDescription());
    }

    @Test
    void testNullValues() {
        // Test with empty resource
        context.create().resource("/content/test/empty");
        Resource empty = context.resourceResolver().getResource("/content/test/empty");
        {ComponentName}Model emptyModel = empty.adaptTo({ComponentName}Model.class);
        assertNotNull(emptyModel);
        assertNull(emptyModel.getTitle());
    }
}
```

### Test content JSON (`/src/test/resources/models/{component-name}.json`):

```json
{
    "{component-name}": {
        "jcr:primaryType": "nt:unstructured",
        "sling:resourceType": "{project}/components/{component-name}",
        "title": "Expected Title",
        "description": "Expected description text"
    }
}
```

### OSGi Service test:

```java
package {base.package}.services.impl;

import io.wcm.testing.mock.aem.junit5.AemContext;
import io.wcm.testing.mock.aem.junit5.AemContextExtension;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith({AemContextExtension.class, MockitoExtension.class})
class {ServiceName}ImplTest {

    private final AemContext context = new AemContext();

    private {ServiceName}Impl service;

    @BeforeEach
    void setUp() {
        // Register OSGi service with config
        service = context.registerInjectActivateService(
            new {ServiceName}Impl(),
            "propertyName", "test-value"
        );
    }

    @Test
    void testDoSomething() {
        String result = service.doSomething("input");
        assertEquals("test-value: input", result);
    }
}
```

---

## Skill 15: Security Hardening

### Common security configs for AMS:

**Referrer Filter:**
```xml
<!-- PID: org.apache.sling.security.impl.ReferrerFilter -->
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="sling:OsgiConfig"
    allow.empty="{Boolean}false"
    allow.hosts="[author-dev.{project}.adobecqms.net,publish-dev.{project}.adobecqms.net]"
    allow.hosts.regexp="[]"
    filter.methods="[POST,PUT,DELETE]"/>
```

**CSRF Filter:**
```xml
<!-- PID: com.adobe.granite.csrf.impl.CSRFFilter -->
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="sling:OsgiConfig"
    filter.excluded.paths="[/libs/granite/csrf/token.json]"/>
```

**Content Disposition Filter:**
```xml
<!-- PID: org.apache.sling.security.impl.ContentDispositionFilter -->
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="sling:OsgiConfig"
    sling.content.disposition.paths="[/content/dam/{project}:application/pdf,/content/dam/{project}:application/zip]"
    sling.content.disposition.all.paths="{Boolean}false"/>
```

**Closed User Groups (CUG):**
```xml
<!-- On content node requiring authentication -->
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:rep="internal"
    jcr:primaryType="nt:unstructured"
    rep:principalNames="[{project}-members]"
    cq:cugEnabled="{Boolean}true"
    cq:cugLoginPage="/content/{project}/login"/>
```

---

## Validation Strategy (No MCP)

Since AEM AMS does not use MCP for live instance validation, the agent validates using:

1. **Static Analysis** — Check generated code against `resources/ams/patterns.md`
2. **Maven Build** — Run `mvn clean install` to verify compilation
3. **Unit Tests** — Run `mvn test` to verify logic
4. **Bundle Verification (post-deploy)** — Provide curl commands to check OSGi console:

```bash
# Check bundle status
curl -s -u admin:admin \
  "https://author-dev.{project}.adobecqms.net/system/console/bundles.json" \
  | jq '.data[] | select(.symbolicName | contains("{project}")) | {name: .name, state: .state}'

# Check component status
curl -s -u admin:admin \
  "https://author-dev.{project}.adobecqms.net/system/console/components.json" \
  | jq '.data[] | select(.name | contains("{base.package}")) | {name: .name, state: .state}'

# Check OSGi config applied
curl -s -u admin:admin \
  "https://author-dev.{project}.adobecqms.net/system/console/configMgr/{full.PID}" \
  | jq .
```

4. **Dispatcher Validation** — Provide test commands:

```bash
# Test dispatcher config syntax
apachectl configtest

# Test filter rules (does URL pass?)
curl -sI "https://publish-dev.{project}.adobecqms.net/content/{project}/en.html" \
  | head -5

# Test cache hit
curl -sI "https://publish-dev.{project}.adobecqms.net/content/{project}/en.html" \
  | grep "X-Dispatcher"
```
