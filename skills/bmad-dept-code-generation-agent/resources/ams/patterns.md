# AEM AMS — Code Generation Patterns

## Key Differences from AEMaaCS

| Aspect | AEMaaCS | AEM AMS |
|--------|---------|---------|
| Java version | 11 (moving to 17) | 8 or 11 (depending on AEM version) |
| AEM version | Latest (rolling) | 6.5.x (fixed, service packs) |
| OSGi config location | `ui.config/` with env runmodes | `/apps/{project}/config.*` folders |
| Custom runmodes | Not allowed (only author/publish + env) | Allowed (custom runmodes) |
| Dispatcher | SDK-based (immutable) | Classic Apache httpd.conf + dispatcher.any |
| Deployment | Cloud Manager pipeline | Package Manager / Maven / CI scripts |
| Replication | Sling Distribution (automatic) | Replication agents (manual config) |
| Oak Index | Via `ui.apps/` (async) | Via `/oak:index` (may need reindex) |
| Repository structure | Enforced by Cloud Manager validators | Flexible (fewer constraints) |

---

## Project Structure (AEM AMS)

```
├── core/                        → Java source
│   └── src/main/java/{base.package}/
├── ui.apps/                     → Component definitions + OSGi configs
│   └── src/main/content/jcr_root/
│       ├── apps/{project}/
│       │   ├── components/
│       │   ├── config/              → Default OSGi configs
│       │   ├── config.author/       → Author-only configs
│       │   ├── config.publish/      → Publish-only configs
│       │   ├── config.dev/          → Dev runmode configs
│       │   ├── config.stage/        → Stage runmode configs
│       │   ├── config.prod/         → Prod runmode configs
│       │   └── install/             → Bundles to embed
│       └── etc/
│           └── designs/{project}/   → Legacy designs (if used)
├── ui.content/                  → Content (templates, policies, pages)
│   └── src/main/content/jcr_root/
│       ├── conf/{project}/
│       └── content/{project}/
├── ui.frontend/                 → Frontend build (CSS/JS)
├── dispatcher/                  → Classic Dispatcher config
│   ├── conf/
│   │   └── httpd.conf
│   ├── conf.d/
│   │   ├── available_vhosts/
│   │   └── enabled_vhosts/
│   └── conf.dispatcher.d/
│       ├── available_farms/
│       ├── enabled_farms/
│       ├── cache/
│       ├── clientheaders/
│       ├── filters/
│       └── renders/
└── all/                         → All-in-one package (embeds everything)
```

---

## Sling Models (AEM AMS)

Same pattern as AEMaaCS but note:
- Use `javax.inject` annotations (not `jakarta.*`)
- Ensure `@Model` has `adaptables = Resource.class` or `SlingHttpServletRequest.class`
- AEM 6.5 supports `defaultInjectionStrategy = OPTIONAL`
- Use `com.adobe.cq.export.json` for JSON export (if on AEM 6.5.10+)

```java
package {base.package}.models;

import org.apache.sling.api.resource.Resource;
import org.apache.sling.models.annotations.DefaultInjectionStrategy;
import org.apache.sling.models.annotations.Model;
import org.apache.sling.models.annotations.injectorspecific.ValueMapValue;
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

---

## OSGi Configuration (AEM AMS)

### Location differences:

- **Default:** `/apps/{project}/config/`
- **Author only:** `/apps/{project}/config.author/`
- **Publish only:** `/apps/{project}/config.publish/`
- **Dev environment:** `/apps/{project}/config.dev/`
- **Custom runmode:** `/apps/{project}/config.{runmode}/`
- **Combined:** `/apps/{project}/config.author.dev/`

### Config file format:

**XML format** (`.xml`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="sling:OsgiConfig"
    property.name="value"
    property.integer="{Long}42"
    property.boolean="{Boolean}true"
    property.array="[value1,value2]"/>
```

**Config format** (`.cfg.json`) — AEM 6.5.4+:
```json
{
    "property.name": "value",
    "property.integer": 42,
    "property.boolean": true,
    "property.array": ["value1", "value2"]
}
```

---

## Dispatcher (AEM AMS — Classic)

### Key differences from AEMaaCS Dispatcher SDK:

| AEMaaCS SDK | AEM AMS Classic |
|-------------|----------------|
| Immutable configs (validated on deploy) | Mutable (can be changed on server) |
| `${DOCROOT}` variable | Explicit `/mnt/var/www/html` or similar |
| `statfileslevel` mandatory | Optional |
| No `.htaccess` | `.htaccess` allowed |
| `enableTTL "1"` standard | TTL via `mod_expires` / `Header set` |

### httpd.conf pattern:

```apache
<VirtualHost *:80>
    ServerName author-dev.myproject.adobecqms.net
    DocumentRoot /mnt/var/www/author

    <Directory /mnt/var/www/author>
        Options FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    <IfModule disp_apache2.c>
        SetHandler dispatcher-handler
    </IfModule>

    # Custom rewrite rules
    RewriteEngine On
    RewriteRule ^/$ /content/{project}/en.html [R=301,L]
</VirtualHost>
```

### dispatcher.any pattern:

```
/farms {
  /publishfarm {
    /clientheaders {
      "*"
    }
    /virtualhosts {
      "publish-dev.myproject.adobecqms.net"
    }
    /renders {
      /rend01 {
        /hostname "localhost"
        /port "4503"
      }
    }
    /filter {
      /0001 { /type "deny"  /glob "*" }
      /0010 { /type "allow" /method "GET" /url "/content/{project}/*" }
      /0020 { /type "allow" /method "GET" /url "/etc.clientlibs/*" }
      /0030 { /type "allow" /method "GET" /url "/content/dam/{project}/*" }
    }
    /cache {
      /docroot "/mnt/var/www/publish"
      /rules {
        /0000 { /glob "*" /type "deny" }
        /0001 { /glob "*.html" /type "allow" }
        /0002 { /glob "*.css" /type "allow" }
        /0003 { /glob "*.js" /type "allow" }
        /0004 { /glob "*.json" /type "allow" }
      }
      /invalidate {
        /0000 { /glob "*" /type "deny" }
        /0001 { /glob "*.html" /type "allow" }
      }
      /statfileslevel "2"
    }
  }
}
```

---

## Replication (AEM AMS)

AMS uses replication agents (not Sling Distribution):

### Replication Agent Config:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:Page">
    <jcr:content
        jcr:primaryType="nt:unstructured"
        jcr:title="Publish Agent"
        sling:resourceType="cq/replication/components/agent"
        enabled="{Boolean}true"
        transportUri="https://publish-dev.myproject.adobecqms.net/bin/receive?sling:authRequestLogin=1"
        transportUser="replication-user"
        logLevel="info"
        retryDelay="60000"
        serializationType="durbo"/>
</jcr:content>
```

---

## Unit Tests (AEM AMS)

Same AEM Mocks framework, but ensure dependency versions match AEM 6.5:

```xml
<!-- pom.xml test dependencies for AEM 6.5 -->
<dependency>
    <groupId>io.wcm</groupId>
    <artifactId>io.wcm.testing.aem-mock.junit5</artifactId>
    <version>5.3.0</version>
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

---

## Naming Conventions (AEM AMS)

Same as AEMaaCS:
- Components: kebab-case (`hero-banner`, `product-teaser`)
- Java classes: PascalCase (`HeroBannerModel`, `ProductService`)
- OSGi PIDs: FQCN (`com.mysite.core.services.impl.MyServiceImpl`)
- Content paths: lowercase with hyphens

---

## What's NOT Available in AEM AMS

- Cloud Manager pipelines → use Jenkins/GitLab CI
- Adobe remote MCP → not available
- `ui.config/` module → use runmode folders under `/apps/{project}/config.*`
- Immutable dispatcher validation → dispatcher changes are manual
- Rapid Development Environments (RDE) → not available
- Experience Governance → not available

> **For complete code generation patterns, see `resources/ams/skills.md`** — the comprehensive LLM skills reference covering all 15 generation skills for AEM AMS.
