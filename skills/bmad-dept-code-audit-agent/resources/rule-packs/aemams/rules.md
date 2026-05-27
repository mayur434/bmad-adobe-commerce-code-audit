# AEM Managed Services (AEM AMS) Rules

---

## Architecture Rules

---

### AEMAMS-ARCH-001: Maven Multi-Module Project Structure

- **Severity**: High
- **Description**: AEM AMS projects must follow the standard Maven multi-module layout (`core`, `ui.apps`, `ui.content`, `ui.config`, `dispatcher`, `all`). Flat or non-standard structures break deployment pipeline assumptions and prevent proper package ordering.

#### Detect — Files to Scan
```
pom.xml
**/pom.xml
```

#### Detect — Bad Pattern
- Single-module project packaging both Java code and JCR content
- Missing `all` aggregator module that embeds all sub-packages
- `ui.apps` and `ui.content` content merged into one package
- Java sources inside content modules (non-`core` modules)

#### Detect — Good Pattern
- `<modules>` in root `pom.xml` listing `core`, `ui.apps`, `ui.content`, `ui.config`, `all`, `dispatcher`
- `core` module packaging as `bundle`
- `ui.apps`/`ui.content` packaging as `content-package`
- `all` module with `<packageType>container</packageType>` embedding all sub-packages

#### Bad Example
```xml
<!-- Single flat pom.xml — no sub-modules -->
<groupId>com.mysite</groupId>
<artifactId>mysite</artifactId>
<packaging>content-package</packaging>
<!-- Java AND JCR content mixed in one module -->
```

#### Good Example
```xml
<!-- root pom.xml -->
<modules>
    <module>core</module>
    <module>ui.apps</module>
    <module>ui.content</module>
    <module>ui.config</module>
    <module>all</module>
    <module>dispatcher</module>
</modules>
```

#### False Positives
- Legacy single-module projects being incrementally migrated (document migration plan)
- Proof-of-concept or sample projects not intended for production

#### Related Rules
- `AEMAMS-ARCH-002` (content package filter — correct module split requires correct filters)
- `AEMAMS-ARCH-003` (OSGi bundle embedding)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-65/developing/devtools/ht-projects-maven.html

---

### AEMAMS-ARCH-002: Content Package Filter Overlap

- **Severity**: High
- **Description**: Overlapping JCR filter roots between `ui.apps` and `ui.content` packages cause unpredictable installation order behaviour. The Package Manager installs packages independently; filter overlap means one package can overwrite content from another.

#### Detect — Files to Scan
```
ui.apps/src/main/content/META-INF/vault/filter.xml
ui.content/src/main/content/META-INF/vault/filter.xml
**/META-INF/vault/filter.xml
```

#### Detect — Bad Pattern
- Same `/content/mysite` root in both `ui.apps/filter.xml` and `ui.content/filter.xml`
- `/apps` paths appearing in `ui.content/filter.xml`
- `/content` paths appearing in `ui.apps/filter.xml`
- Multiple packages with `<filter root="/conf/mysite">` without exclusive ownership

#### Detect — Good Pattern
- `ui.apps/filter.xml` covers only `/apps/mysite`, `/etc/clientlibs/mysite`
- `ui.content/filter.xml` covers only `/content/mysite`, `/conf/mysite`
- No path appears as a filter root in more than one package

#### Bad Example
```xml
<!-- ui.apps/META-INF/vault/filter.xml — WRONG -->
<workspaceFilter version="1.0">
    <filter root="/apps/mysite"/>
    <filter root="/content/mysite"/>  <!-- should be in ui.content only -->
</workspaceFilter>
```

#### Good Example
```xml
<!-- ui.apps/META-INF/vault/filter.xml -->
<workspaceFilter version="1.0">
    <filter root="/apps/mysite"/>
    <filter root="/etc/clientlibs/mysite"/>
</workspaceFilter>

<!-- ui.content/META-INF/vault/filter.xml -->
<workspaceFilter version="1.0">
    <filter root="/content/mysite"/>
    <filter root="/conf/mysite"/>
</workspaceFilter>
```

#### False Positives
- Intentional shared root with `<include>`/`<exclude>` patterns that partition the tree without overlap

#### Related Rules
- `AEMAMS-ARCH-001` (module structure — filter ownership follows module ownership)

---

### AEMAMS-ARCH-003: OSGi Bundle Not Embedded in All Package

- **Severity**: High
- **Description**: OSGi bundles must be embedded in the `all` container package to guarantee installation order. Bundles deployed outside the `all` package can arrive before their dependent content packages, causing `LoginException` and unresolved service references at startup.

#### Detect — Files to Scan
```
all/pom.xml
**/pom.xml
```

#### Detect — Bad Pattern
- `core` bundle listed as a Maven dependency of `ui.apps` instead of `all`
- `filevault-package-maven-plugin` `<embeddeds>` absent from `all/pom.xml`
- Bundle JAR copied manually to `/apps/mysite/install/` in `ui.apps`
- Multiple OSGi bundles embedded in separate content packages without `all` aggregation

#### Detect — Good Pattern
```xml
<!-- all/pom.xml -->
<plugin>
    <groupId>org.apache.jackrabbit</groupId>
    <artifactId>filevault-package-maven-plugin</artifactId>
    <configuration>
        <embeddeds>
            <embedded>
                <groupId>com.mysite</groupId>
                <artifactId>mysite.core</artifactId>
                <target>/apps/mysite/install</target>
            </embedded>
        </embeddeds>
    </configuration>
</plugin>
```

#### Bad Example
```xml
<!-- ui.apps/pom.xml — bundle embedded in wrong module -->
<embeddeds>
    <embedded>
        <groupId>com.mysite</groupId>
        <artifactId>mysite.core</artifactId>
        <target>/apps/mysite/install</target>
    </embedded>
</embeddeds>
```

#### False Positives
- Third-party OSGi bundles installed via separate Adobe-managed packages (documented dependency)

#### Related Rules
- `AEMAMS-ARCH-001` (multi-module structure)

---

### AEMAMS-ARCH-004: Deep /libs Overlay

- **Severity**: High
- **Description**: Overlaying AEM's `/libs` path is fragile and breaks on AEM Service Pack upgrades. AMS environments receive regular Service Pack updates; deep overlays of internal implementation nodes cause upgrade failures or silent regressions.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/overlays/**
ui.apps/src/main/content/jcr_root/libs/**
```

#### Detect — Bad Pattern
- Any file directly under `jcr_root/libs/` (direct modification instead of overlay)
- Overlay depth > 3 levels below `/libs/cq/`, `/libs/dam/`, `/libs/granite/`
- Overlays of `.jsp` or `.js` files in `/libs/foundation/`
- Overlaying OSGi configuration nodes under `/libs/`

#### Detect — Good Pattern
- Overlays limited to documented Adobe extension points
- `sling:resourceSuperType` used for component inheritance instead of overlay
- Sling Resource Merger (`sling:hideResource`, `sling:orderBefore`) for selective customisation

#### Bad Example
```
ui.apps/src/main/content/jcr_root/apps/dam/gui/coral/components/admin/
    contentrenderer/row/row.jsp  ← deep internal overlay, breaks on SP upgrade
```

#### Good Example
```xml
<jcr:root
    jcr:primaryType="cq:Component"
    sling:resourceSuperType="core/wcm/components/image/v3/image"
    componentGroup="My Site - Content"/>
```

#### False Positives
- Overlays of documented Adobe extension points (e.g., `/libs/settings/` customisations)
- Overlays explicitly listed as supported in Adobe's documentation for the AEM version in use

#### Related Rules
- `AEMAMS-ARCH-005` (Classic UI components often require deep overlays — migrate instead)

---

### AEMAMS-ARCH-005: Classic UI Components Still in Use

- **Severity**: High
- **Description**: Classic UI (ExtJS / CoralUI 2 / `/libs/foundation/`) components are unsupported from AEM 6.5 SP onward and removed in AEM as a Cloud Service. AMS projects should be fully on Touch UI to allow a future cloud migration path.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/.content.xml
ui.apps/src/main/content/jcr_root/apps/**/_cq_editConfig/.content.xml
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**
```

#### Detect — Bad Pattern
- `jcr:primaryType="cq:Dialog"` (Classic dialog) instead of `cq:dialog` (Touch UI)
- `xtype` properties in `.content.xml` nodes
- `sling:resourceType` pointing to `/libs/foundation/components/`
- `_cq_editConfig` with ExtJS widget references

#### Detect — Good Pattern
- `cq:dialog` (lowercase) with `sling:resourceType="granite/ui/components/coral/foundation/..."`
- `cq:design_dialog` for design mode configuration
- Core WCM Components as base via `sling:resourceSuperType`

#### Bad Example
```xml
<!-- Classic UI dialog — must be replaced -->
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
    jcr:primaryType="cq:Dialog"
    title="Image"
    xtype="dialog">
    <items jcr:primaryType="cq:WidgetCollection">
        <image xtype="html5smartimage" name="./image"/>
    </items>
</jcr:root>
```

#### Good Example
```xml
<!-- Touch UI dialog (Granite UI / Coral 3) -->
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="nt:unstructured"
    sling:resourceType="cq/gui/components/authoring/dialog">
    <content jcr:primaryType="nt:unstructured"
        sling:resourceType="granite/ui/components/coral/foundation/container">
        <items jcr:primaryType="nt:unstructured">
            <fileReference jcr:primaryType="nt:unstructured"
                sling:resourceType="granite/ui/components/coral/foundation/form/textfield"
                fieldLabel="Image Path"
                name="./fileReference"/>
        </items>
    </content>
</jcr:root>
```

#### False Positives
- Read-only admin overlays that only hide Classic UI components from the component browser (not usage)

#### Related Rules
- `AEMAMS-ARCH-004` (deep overlays often accompany Classic UI)
- `AEMAMS-SLING-004` (Felix SCR annotations often co-occur with Classic UI era code)

---

### AEMAMS-ARCH-006: Missing Service User Mapping

- **Severity**: Critical
- **Description**: On AEM 6.x/AMS, `ResourceResolverFactory.getServiceResourceResolver()` requires a `org.apache.sling.serviceusermapping.impl.ServiceUserMapperImpl.amended` OSGi configuration mapping the bundle's subservice name to a system user. Without it the call throws `LoginException` in production (admin fallback is disabled in hardened instances).

#### Detect — Files to Scan
```
ui.config/src/main/content/jcr_root/apps/**/config/**/*.config
ui.config/src/main/content/jcr_root/apps/**/config/**/*.cfg.json
ui.apps/src/main/content/jcr_root/apps/**/config/**/*.config
```

#### Detect — Bad Pattern
- `getServiceResourceResolver` calls in Java with a subservice name that has no corresponding `ServiceUserMapperImpl.amended` config
- `ResourceResolverFactory.SUBSERVICE` value not matching any configured mapping
- No `ServiceUserMapperImpl` config file at all while service resolvers are used

#### Detect — Good Pattern
```
org.apache.sling.serviceusermapping.impl.ServiceUserMapperImpl.amended-mysite.config
```

#### Bad Example
```java
// Java code references "mysite-reader" subservice...
Map<String, Object> auth = Collections.singletonMap(
    ResourceResolverFactory.SUBSERVICE, "mysite-reader");
resolver = factory.getServiceResourceResolver(auth); // LoginException — no mapping exists!
```

#### Good Example
```
# org.apache.sling.serviceusermapping.impl.ServiceUserMapperImpl.amended-mysite.config
user.mapping=["com.mysite.core:mysite-reader\=mysite-service-user"]
```

```java
Map<String, Object> auth = Collections.singletonMap(
    ResourceResolverFactory.SUBSERVICE, "mysite-reader");
try (ResourceResolver resolver = factory.getServiceResourceResolver(auth)) {
    // Works — mapping exists and service user has required permissions
}
```

#### False Positives
- Bundles that only use the request-scoped resolver (`request.getResourceResolver()`) and never call `getServiceResourceResolver`

#### Related Rules
- `AEMAMS-SLING-001` (resource resolver leak)
- `AEMAMS-SEC-004` (service user permissions)

---

## Sling / OSGi Rules

---

### AEMAMS-SLING-001: Resource Resolver Leak

- **Severity**: Critical
- **Description**: Resource resolvers obtained from `ResourceResolverFactory` hold a JCR session. If not closed on every code path (including exceptions), they leak memory and JCR connections, leading to `javax.jcr.RepositoryException: Too many open sessions` crashes.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
bundle/src/main/java/**/*.java
```

#### Detect — Bad Pattern (regex)
```regex
resourceResolverFactory\s*\.\s*getServiceResourceResolver\s*\((?!.*try\s*\()
getServiceResourceResolver.*(?!finally|try-with)
ResourceResolver\s+\w+\s*=\s*.*getServiceResourceResolver(?!.*try\s*\()
```

#### Detect — Good Pattern
- `try (ResourceResolver resolver = ...)` (try-with-resources, preferred)
- `finally { if (resolver != null && resolver.isLive()) resolver.close(); }`

#### Bad Example
```java
ResourceResolver resolver = resolverFactory.getServiceResourceResolver(authMap);
Resource res = resolver.getResource("/content/mysite");
doWork(res);
resolver.close(); // NOT SAFE — skipped if doWork() throws
```

#### Good Example
```java
try (ResourceResolver resolver = resolverFactory.getServiceResourceResolver(authMap)) {
    Resource res = resolver.getResource("/content/mysite");
    doWork(res);
} catch (LoginException e) {
    log.error("Cannot obtain service resolver", e);
}
```

#### False Positives
- Request-scoped resolver from `request.getResourceResolver()` — managed by Sling, do NOT close it
- Resolver stored in a class implementing `Closeable` with correct lifecycle management

#### Related Rules
- `AEMAMS-SLING-002` (JCR session leak — same pattern at lower API level)
- `AEMAMS-ARCH-006` (service user mapping — resolver will throw without it)

---

### AEMAMS-SLING-002: JCR Session Leak

- **Severity**: Critical
- **Description**: `Repository.login()` and `resolver.adaptTo(Session.class)` return sessions that must be explicitly logged out. On AMS, connection pool exhaustion from leaked sessions requires an instance restart.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
bundle/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
repository\s*\.\s*login\s*\((?!.*finally.*logout)
adaptTo\s*\(\s*Session\.class\s*\)(?!.*finally.*logout)
new\s+SimpleCredentials\s*\(\s*["']admin["']
```

#### Detect — Good Pattern
- Session used inside `try { ... } finally { session.logout(); }`
- Avoiding direct Session use entirely — use ResourceResolver API instead

#### Bad Example
```java
Session session = repository.login(new SimpleCredentials("admin", "admin".toCharArray()));
Node node = session.getNode("/content/mysite");
session.save();
session.logout(); // Skipped on exception — leaks session
```

#### Good Example
```java
Session session = null;
try {
    session = repository.login(new SimpleCredentials("admin", "admin".toCharArray()));
    Node node = session.getNode("/content/mysite");
    session.save();
} finally {
    if (session != null && session.isLive()) {
        session.logout();
    }
}
```

#### False Positives
- Test harness admin sessions cleaned up in `@After` / `@AfterEach`
- Session adapted from a request-scoped resolver (managed by Sling)

#### Related Rules
- `AEMAMS-SLING-001` (resource resolver leak)
- `AEMAMS-SEC-001` (hardcoded admin credentials)

---

### AEMAMS-SLING-003: Admin Session Usage

- **Severity**: Critical
- **Description**: Using `ResourceResolverFactory.getAdministrativeResourceResolver()` or `Repository.loginAdministrative()` is deprecated since AEM 6.0 and disabled by default on hardened AMS instances. It grants full repository access and bypasses ACL checks.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
bundle/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
getAdministrativeResourceResolver\s*\(
loginAdministrative\s*\(
ResourceResolverFactory\.SUBSERVICE.*admin
new\s+SimpleCredentials\s*\(\s*["']admin["']\s*,\s*["']admin["']
```

#### Detect — Good Pattern
- `getServiceResourceResolver(authMap)` with a named subservice
- Corresponding `ServiceUserMapperImpl.amended` config mapping subservice to a dedicated service user

#### Bad Example
```java
// DEPRECATED + disabled on hardened AMS
ResourceResolver resolver = resolverFactory.getAdministrativeResourceResolver(null);
```

```java
// HARDCODED admin credentials — critical security violation
Session session = repository.login(new SimpleCredentials("admin", "admin".toCharArray()));
```

#### Good Example
```java
Map<String, Object> authMap = Collections.singletonMap(
    ResourceResolverFactory.SUBSERVICE, "mysite-writer");
try (ResourceResolver resolver = resolverFactory.getServiceResourceResolver(authMap)) {
    // scoped service user — only has permissions for mysite paths
}
```

#### False Positives
- `loginAdministrative` in test bundles running inside the AEM test framework (not production code)

#### Related Rules
- `AEMAMS-ARCH-006` (service user mapping)
- `AEMAMS-SEC-001` (hardcoded credentials)

---

### AEMAMS-SLING-004: Deprecated Felix SCR Annotations

- **Severity**: Medium
- **Description**: `org.apache.felix.scr.annotations.*` are deprecated since AEM 6.2 and not supported with bnd-based build tooling. Use standard OSGi DS annotations (`org.osgi.service.component.annotations.*`).

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
bundle/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
import\s+org\.apache\.felix\.scr\.annotations\.\w+;
@org\.apache\.felix\.scr\.annotations\.(Component|Service|Reference|Property|Activate|Deactivate)
```

#### Detect — Good Pattern
```regex
import\s+org\.osgi\.service\.component\.annotations\.\w+;
@Component|@Activate|@Deactivate|@Modified|@Reference
```

#### Bad Example
```java
import org.apache.felix.scr.annotations.Component;
import org.apache.felix.scr.annotations.Service;
import org.apache.felix.scr.annotations.Reference;

@Component
@Service
public class MyServiceImpl implements MyService {
    @Reference
    private ResourceResolverFactory resolverFactory;
}
```

#### Good Example
```java
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(service = MyService.class)
public class MyServiceImpl implements MyService {
    @Reference
    private ResourceResolverFactory resolverFactory;
}
```

#### False Positives
- Third-party bundles that still ship Felix SCR annotations (not your code to change)
- Auto-generated code from legacy archetypes (requires archetype upgrade)

#### Related Rules
- `AEMAMS-SLING-005` (deprecated SlingServlet annotation)

---

### AEMAMS-SLING-005: Deprecated @SlingServlet Annotation

- **Severity**: Medium
- **Description**: The `@SlingServlet` annotation from `org.apache.sling.servlets.annotations` is deprecated. Use `@Component(service = Servlet.class)` with `@SlingServletPaths` or `@SlingServletResourceTypes`.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
bundle/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
@SlingServlet\s*\(
import\s+org\.apache\.sling\.servlets\.annotations\.SlingServlet
```

#### Detect — Good Pattern
```regex
@Component\s*\(\s*service\s*=\s*.*Servlet\.class
@SlingServletResourceTypes|@SlingServletPaths
```

#### Bad Example
```java
@SlingServlet(paths = "/bin/mysite/api", methods = {"GET", "POST"})
public class ApiServlet extends SlingSafeMethodsServlet { }
```

#### Good Example
```java
@Component(service = Servlet.class)
@SlingServletPaths("/bin/mysite/api")
public class ApiServlet extends SlingAllMethodsServlet { }
```

#### False Positives
- None — this annotation is always deprecated

#### Related Rules
- `AEMAMS-SLING-004` (Felix SCR annotations)

---

### AEMAMS-SLING-006: WCMUsePojo Instead of Sling Models

- **Severity**: Medium
- **Description**: `WCMUsePojo` (the `com.adobe.cq.sightly.WCMUsePojo` Use-API) is a legacy approach for HTL backend logic. Sling Models are the current standard, offer better testability, IDE support, and null-safety via injection strategies.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
extends\s+WCMUsePojo
import\s+com\.adobe\.cq\.sightly\.WCMUsePojo
```

#### Detect — Good Pattern
```regex
@Model\s*\(
import\s+org\.apache\.sling\.models\.annotations\.Model
```

#### Bad Example
```java
import com.adobe.cq.sightly.WCMUsePojo;

public class HeroModel extends WCMUsePojo {
    private String title;

    @Override
    public void activate() throws Exception {
        title = getProperties().get("jcr:title", String.class);
    }

    public String getTitle() { return title; }
}
```

#### Good Example
```java
@Model(
    adaptables = SlingHttpServletRequest.class,
    defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL
)
public class HeroModel {
    @ValueMapValue(name = "jcr:title")
    private String title;

    public String getTitle() { return title; }
}
```

#### False Positives
- Existing WCMUsePojo classes awaiting scheduled refactor (document the backlog item)

---

### AEMAMS-SLING-007: Synchronous Sling Event Handling for Heavy Work

- **Severity**: High
- **Description**: OSGi `EventHandler` services that perform heavy work (content traversal, external HTTP calls, large writes) in `handleEvent()` run synchronously on the Sling event bus thread. This starves other event consumers and can deadlock the event queue.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
implements\s+EventHandler
void\s+handleEvent\s*\(Event\s+event\).*\{[^}]*(?:getServiceResourceResolver|HttpClient|session\.save|queryBuilder\.createQuery)
```

#### Detect — Good Pattern
- Enqueue a Sling Job from `handleEvent()` and do the real work in a `JobConsumer`
- Use `@Reference(target="(event.topics=...)")` Sling Job topics

#### Bad Example
```java
@Component(service = EventHandler.class,
    property = { EventConstants.EVENT_TOPIC + "=com/day/cq/replication" })
public class ReplicationEventHandler implements EventHandler {
    @Override
    public void handleEvent(Event event) {
        // EXPENSIVE: repository traversal + external API — blocks event bus
        List<String> paths = findAffectedPaths(event);
        externalCacheService.purge(paths);  // HTTP calls in event thread
    }
}
```

#### Good Example
```java
@Component(service = EventHandler.class,
    property = { EventConstants.EVENT_TOPIC + "=com/day/cq/replication" })
public class ReplicationEventHandler implements EventHandler {
    @Reference
    private JobManager jobManager;

    @Override
    public void handleEvent(Event event) {
        Map<String, Object> props = new HashMap<>();
        props.put("path", event.getProperty("path"));
        jobManager.addJob("mysite/cache/purge", props); // Offload immediately
    }
}
```

#### False Positives
- Event handlers that only log or update a simple in-memory counter (no I/O)

#### Related Rules
- `AEMAMS-PERF-001` (async processing)

---

## Performance Rules

---

### AEMAMS-PERF-001: Unbounded Query Results

- **Severity**: High
- **Description**: JCR queries without explicit limits can traverse millions of nodes. On AMS, this triggers `org.apache.jackrabbit.oak.query.QueryEngineImpl` traversal warnings and can OOM the JVM heap with unbounded result sets.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
ui.apps/src/main/content/jcr_root/**/*.json
```

#### Detect — Bad Pattern
```regex
createQuery\s*\((?!.*setLimit|.*p\.limit|.*LIMIT)
queryBuilder\.createQuery(?!.*p\.limit)
SELECT.*FROM.*\[(?!.*LIMIT)
//element\s*\(.*\)(?!.*\[@)
```

#### Detect — Good Pattern
- `query.setLimit(100)` always present
- `p.limit` and `p.offset` in QueryBuilder maps
- `LIMIT` clause in JCR-SQL2
- `p.guessTotal=true` for pagination without full count

#### Bad Example
```java
Map<String, String> map = new HashMap<>();
map.put("path", "/content/dam");
map.put("type", "dam:Asset");
// No p.limit — loads ALL assets into memory
Query q = queryBuilder.createQuery(PredicateGroup.create(map), session);
List<Hit> hits = q.getResult().getHits();
```

#### Good Example
```java
map.put("p.limit", "50");
map.put("p.offset", String.valueOf(offset));
map.put("p.guessTotal", "true");
```

#### False Positives
- Admin-triggered maintenance scripts outside request context with documented full-traversal intent
- Queries with path + property predicates that structurally cannot exceed ~50 results

#### Related Rules
- `AEMAMS-PERF-002` (missing Oak index — no index means traversal even with limits)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-65/developing/bestpractices/troubleshooting-slow-queries.html

---

### AEMAMS-PERF-002: Missing or Incorrect Oak Index

- **Severity**: High
- **Description**: Queries on properties without a backing Oak index cause full repository traversal. On AMS (Jackrabbit Oak), this surfaces as `*WARN* org.apache.jackrabbit.oak.query.QueryEngineImpl Traversed X nodes` and degrades all concurrent requests.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/_oak_index/**/.content.xml
ui.apps/src/main/content/jcr_root/oak:index/**/.content.xml
```

#### Detect — Bad Pattern
- Custom Oak index with `compatVersion=1` (deprecated in Oak 1.6+)
- Index type `ordered` (removed in AEM 6.3+)
- Missing `evaluatePathRestrictions="{Boolean}true"` when queries use path restrictions
- No custom index defined despite `property` predicates on non-indexed properties

#### Detect — Good Pattern
```xml
jcr:primaryType="oak:QueryIndexDefinition"
type="lucene"
compatVersion="{Long}2"
async="[async]"
evaluatePathRestrictions="{Boolean}true"
includedPaths="[/content/mysite]"
```

#### Bad Example
```xml
<mysite-content jcr:primaryType="oak:QueryIndexDefinition"
    type="lucene"
    compatVersion="{Long}1">   <!-- deprecated -->
    <!-- Missing async — synchronous indexing blocks writes -->
    <!-- Missing includedPaths — indexes entire repository -->
</mysite-content>
```

#### Good Example
```xml
<mysite-content jcr:primaryType="oak:QueryIndexDefinition"
    type="lucene"
    compatVersion="{Long}2"
    async="[async]"
    evaluatePathRestrictions="{Boolean}true"
    includedPaths="[/content/mysite]">
    <indexRules jcr:primaryType="nt:unstructured">
        <cq:Page jcr:primaryType="nt:unstructured">
            <properties jcr:primaryType="nt:unstructured">
                <status name="jcr:content/status" propertyIndex="{Boolean}true"/>
            </properties>
        </cq:Page>
    </indexRules>
</mysite-content>
```

#### False Positives
- Indexes managed by the AEM product itself under `/oak:index` (read-only, do not modify)

#### Related Rules
- `AEMAMS-PERF-001` (unbounded queries)

---

### AEMAMS-PERF-003: Dispatcher Cache Invalidation Anti-patterns

- **Severity**: High
- **Description**: Incorrect `cache.invalidate` or replication flush agent configuration causes either stale cache (users see old content) or cache thrashing (every request hits AEM). AMS Dispatcher cache effectiveness is critical for performance.

#### Detect — Files to Scan
```
dispatcher/src/conf.dispatcher.d/cache/**/*.any
dispatcher/src/conf.dispatcher.d/renders/**/*.any
```

#### Detect — Bad Pattern
- `statfilelevel` set to `0` (invalidates entire cache on any content change)
- No `statfileslevel` configured at all (defaults to 0)
- `/invalidate` rules allowing `.*` patterns (too broad)
- Missing `grace` period configuration (thundering herd on expiry)

#### Detect — Good Pattern
```
/statfileslevel "3"
/invalidate {
    /0000 { /type "allow" /glob "*.html" }
    /0001 { /type "allow" /glob "*.json" }
}
/grace "20"
```

#### Bad Example
```
/cache {
    /statfileslevel "0"   ← entire cache purged on every publish
    /invalidate {
        /0000 { /type "allow" /glob "*" }  ← too broad
    }
}
```

#### Good Example
```
/cache {
    /statfileslevel "3"
    /invalidate {
        /0000 { /type "deny"  /glob "*" }
        /0001 { /type "allow" /glob "*.html" }
        /0002 { /type "allow" /glob "*.json" }
        /0003 { /type "allow" /glob "*.css"  }
    }
    /grace "20"
    /enableTTL "1"
}
```

#### False Positives
- Author dispatcher (caching is typically disabled on author — `/cache/docroot` pointing to empty dir)

#### Related Rules
- `AEMAMS-PERF-004` (replication queue backlog — large queues cause delayed cache invalidation)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-dispatcher/using/configuring/dispatcher-configuration.html

---

### AEMAMS-PERF-004: Replication Queue Backlog

- **Severity**: Medium
- **Description**: Replication agents configured with incorrect retry settings or pointing to unavailable publish instances cause queue backlog. A backed-up replication queue blocks content authors and delays cache invalidation.

#### Detect — Files to Scan
```
ui.content/src/main/content/jcr_root/etc/replication/agents.author/**/.content.xml
ui.config/src/main/content/jcr_root/apps/**/config/**/replication**
```

#### Detect — Bad Pattern
- `retryDelay` set to very low values (< 30000 ms) causing rapid retry storms
- `transportUri` using `localhost` (hardcoded — breaks in multi-author cluster)
- Missing `logLevel` property (makes queue backlog invisible in logs)
- `noVersioning=true` on agents that handle critical content

#### Detect — Good Pattern
- Transport URI using environment-specific OSGi config variable
- `retryDelay` ≥ 60000 ms
- `logLevel=info` or higher
- `queueSeparate` per content type for large sites

#### Bad Example
```xml
<!-- agents.author/publish/.content.xml — hardcoded and aggressive -->
<jcr:root
    transportUri="http://localhost:4503/bin/receive?sling:authRequestLogin=1"
    retryDelay="{Long}1000"   <!-- retries every 1 second — causes storm -->
    logLevel="error"/>         <!-- queue silently backs up -->
```

#### Good Example
```xml
<jcr:root
    transportUri="${env.PUBLISH_URL}/bin/receive?sling:authRequestLogin=1"
    retryDelay="{Long}60000"
    logLevel="info"
    noVersioning="{Boolean}false"/>
```

#### False Positives
- Replication agents intentionally disabled in development environments

---

### AEMAMS-PERF-005: Synchronous Workflow Execution in Request Thread

- **Severity**: High
- **Description**: Launching AEM workflows synchronously within a request thread (e.g., via `WorkflowSession.startWorkflow()`) ties up Sling request threads for the workflow's duration. Use the asynchronous Workflow API or Sling Jobs for request-initiated processing.

#### Detect — Files to Scan
```
core/src/main/java/**/*Servlet*.java
core/src/main/java/**/*Handler*.java
```

#### Detect — Bad Pattern
```regex
workflowSession\s*\.\s*startWorkflow\s*\(
WorkflowSession.*startWorkflow
```

#### Detect — Good Pattern
- Submit to Sling Job queue; have a job consumer start the workflow
- Use `WorkflowService.startWorkflow()` from a dedicated async thread or Sling Job

#### Bad Example
```java
protected void doPost(SlingHttpServletRequest request, SlingHttpServletResponse response) {
    WorkflowSession wfSession = request.getResourceResolver().adaptTo(WorkflowSession.class);
    WorkflowModel model = wfSession.getModel("/var/workflow/models/dam/update_asset");
    WorkflowData data = wfSession.newWorkflowData("JCR_PATH", assetPath);
    wfSession.startWorkflow(model, data); // Blocks until workflow starts — can take seconds
}
```

#### Good Example
```java
protected void doPost(SlingHttpServletRequest request, SlingHttpServletResponse response) {
    Map<String, Object> props = new HashMap<>();
    props.put("assetPath", assetPath);
    props.put("workflowModel", "/var/workflow/models/dam/update_asset");
    jobManager.addJob("mysite/workflow/trigger", props);
    response.setStatus(HttpServletResponse.SC_ACCEPTED);
}
```

#### False Positives
- Workflows triggered from admin tools with known low concurrency
- Transient workflows with short execution time (< 500 ms)

#### Related Rules
- `AEMAMS-SLING-007` (event handler blocking)

---

### AEMAMS-PERF-006: Large Sling Model @PostConstruct

- **Severity**: Medium
- **Description**: Sling Models with expensive `@PostConstruct` (tree traversal, external calls, query execution) re-execute on every adaptation. Without request-level caching, the same cost is paid when HTL includes adapt the model multiple times per request.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
- `@PostConstruct` containing `queryBuilder.createQuery`, `HttpClient` calls, or recursive resource traversal
- Same model adapted via `data-sly-use` in multiple HTL templates on one page

#### Detect — Good Pattern
- Lazy initialisation in getters (`if (field == null) { field = compute(); }`)
- Request attribute cache: `request.getAttribute(CACHE_KEY)` checked before computation

#### Bad Example
```java
@Model(adaptables = SlingHttpServletRequest.class)
public class NavigationModel {
    @PostConstruct
    protected void init() {
        // Expensive on every adaptation — no caching
        this.items = buildTree(rootPage, 5);
    }
}
```

#### Good Example
```java
@Model(adaptables = SlingHttpServletRequest.class)
public class NavigationModel {
    private static final String CACHE_KEY = "nav-model-items";

    @SlingObject
    private SlingHttpServletRequest request;

    @SuppressWarnings("unchecked")
    public List<NavItem> getItems() {
        List<NavItem> cached = (List<NavItem>) request.getAttribute(CACHE_KEY);
        if (cached == null) {
            cached = buildTree(rootPage, 5);
            request.setAttribute(CACHE_KEY, cached);
        }
        return cached;
    }
}
```

#### False Positives
- `@PostConstruct` doing only simple property reads with no I/O

#### Related Rules
- `AEMAMS-SLING-006` (WCMUsePojo — same pattern in older API)

---

### AEMAMS-PERF-007: Excessive Client Library Size

- **Severity**: Medium
- **Description**: Client libraries exceeding 100 KB (uncompressed JS) or bundling unused code degrade page load time. On AMS, CDN offload is not guaranteed and Dispatcher-level compression may be the only optimisation layer, making raw asset size critical for end-user performance.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**
ui.frontend/src/**
```

#### Detect — Bad Pattern
- Single clientlib JS file > 100 KB
- jQuery or Moment.js included when AEM's Granite already provides them via `dependencies`
- Full library imports (`import _ from 'lodash'`) instead of named cherry-picks (`import debounce from 'lodash/debounce'`)
- Multiple clientlib categories with identical `dependencies` entries (duplicated delivery)
- `js.txt` listing 30+ individual component files (no bundling)

#### Detect — Good Pattern
- `ui.frontend` webpack / Parcel build producing tree-shaken, minified output
- Shared libraries declared in `dependencies` (served once by AEM HTML Library Manager) not `embed`
- Code split by page type: base bundle + per-component optional categories
- `js.txt` referencing the webpack output bundle, not raw source files

#### Bad Example
```
# js.txt — raw sources, no bundling, no minification
jquery-3.6.0.js          ← already provided by Granite
lodash.full.js            ← 70KB, mostly unused
moment-with-locales.js    ← 170KB, rarely needed
app.js
components/header.js
components/footer.js
... 40 more component files ...
```

#### Good Example
```
# js.txt — single webpack output
#base
mysite.bundle.min.js

# Component categories loaded on demand:
# mysite.carousel  → carousel/js.txt → carousel.bundle.min.js
# mysite.form      → form/js.txt     → form.bundle.min.js
```

```xml
<!-- Declare Granite jQuery as a dependency — not embedded -->
<jcr:root jcr:primaryType="cq:ClientLibraryFolder"
    allowProxy="{Boolean}true"
    categories="[mysite.base]"
    dependencies="[granite.jquery]"/>
```

#### False Positives
- Admin/authoring clientlibs loaded only in edit mode (not served to end users)
- Minified third-party bundles where the minified size is already within budget

#### Related Rules
- `AEMAMS-PERF-008` (missing allowProxy — must be fixed alongside size issues)
- `AEMAMS-PERF-011` (category proliferation — common companion to oversized bundles)

---

### AEMAMS-PERF-008: Missing `allowProxy` on Client Libraries

- **Severity**: High
- **Description**: Client libraries under `/apps` must declare `allowProxy="{Boolean}true"` to be served via the `/etc.clientlibs` proxy path. AMS Dispatcher configurations typically deny direct access to `/apps`; without `allowProxy`, clientlibs return 403/404 in production while working locally in CRX.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/.content.xml
ui.apps/src/main/content/jcr_root/apps/**/clientlib*/**/.content.xml
```

#### Detect — Bad Pattern
```regex
jcr:primaryType\s*=\s*["']cq:ClientLibraryFolder["'](?![\s\S]{0,200}allowProxy)
```
- `.content.xml` with `jcr:primaryType="cq:ClientLibraryFolder"` missing `allowProxy="{Boolean}true"`

#### Detect — Good Pattern
- Every `cq:ClientLibraryFolder` under `/apps` has `allowProxy="{Boolean}true"`
- Dispatcher filter allows `/etc.clientlibs/*` while denying `/apps/*`

#### Bad Example
```xml
<!-- Will serve on author (no Dispatcher) but 403 on publish (Dispatcher blocks /apps) -->
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:ClientLibraryFolder"
    categories="[mysite.base]"/>
```

#### Good Example
```xml
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:ClientLibraryFolder"
    allowProxy="{Boolean}true"
    categories="[mysite.base]"/>
```

#### False Positives
- Clientlibs under `/etc/clientlibs/` (no proxy needed — already on a Dispatcher-safe path)
- Author-only clientlibs for custom authoring UI widgets (never proxied to publish Dispatcher)

#### Related Rules
- `AEMAMS-PERF-007` (clientlib size — review both during clientlib audit)
- `AEMAMS-SEC-002` (Dispatcher filters — `/etc.clientlibs/*` must be explicitly allowed)

---

### AEMAMS-PERF-009: Render-Blocking Client Library Loading

- **Severity**: Medium
- **Description**: JavaScript clientlibs included in the `<head>` without `defer` or `async` block HTML parsing and delay First Contentful Paint. On AMS, where Dispatcher serves assets without a CDN push cache warming, render-blocking resources are especially harmful for mobile users and slow connections.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/page/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/components/structure/**/*.html
ui.frontend/src/**/*.html
```

#### Detect — Bad Pattern
```regex
data-sly-call.*clientlib\.js.*categories.*(?!loading\s*=\s*['"]defer|async['"])
```
- `data-sly-call="${clientlib.js @ categories='...'}"` inside `<head>` without `loading='defer'`
- `<script src="...">` without `defer` or `async` in the page `<head>` HTL
- `clientlib.all` called in `<head>` loading both CSS and JS synchronously

#### Detect — Good Pattern
- CSS clientlibs in `<head>`; JS clientlibs loaded with `loading='defer'` or placed before `</body>`
- `com.adobe.granite.ui.clientlibs.impl.HtmlLibraryManagerImpl` configured with `minify=true` and `gzip=true`
- `<link rel="preload" as="script">` for critical JS bundles combined with `defer` attribute

#### Bad Example
```html
<!-- headlibs.html — synchronous JS blocks HTML parsing -->
<head>
    <sly data-sly-call="${clientlib.css @ categories='mysite.all'}"/>
    <sly data-sly-call="${clientlib.js  @ categories='mysite.all'}"/>
</head>
```

#### Good Example
```html
<!-- CSS in <head>, JS deferred before </body> -->
<head>
    <sly data-sly-call="${clientlib.css @ categories='mysite.all'}"/>
</head>
<body>
    <!-- page content renders immediately -->
    <sly data-sly-call="${clientlib.js @ categories='mysite.all', loading='defer'}"/>
</body>
```

#### False Positives
- Analytics/tag manager scripts contractually requiring synchronous `<head>` placement (document the exception)
- Polyfill loader scripts that must run before any other script

#### Related Rules
- `AEMAMS-PERF-007` (clientlib size — large bundles amplify render-blocking cost)
- `AEMAMS-PERF-010` (inline scripts — compound render-blocking problem)

---

### AEMAMS-PERF-010: Inline Scripts and Styles in HTL Components

- **Severity**: Medium
- **Description**: `<style>` blocks and executable `<script>` blocks embedded directly in HTL templates are not browser-cached, inflate HTML payload on every request, and require `unsafe-inline` in Content Security Policy (CSP). On AMS with Dispatcher caching, dynamic inline styles also invalidate HTML cache entries unnecessarily.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/*.htl
```

#### Detect — Bad Pattern
```regex
<style[\s>](?!.*data-sly-test.*false)
<script(?!\s+src=)(?!.*type\s*=\s*["']application/ld\+json["'])[\s>]
style\s*=\s*["'][^"']*\$\{
```

#### Detect — Good Pattern
- Component-specific CSS compiled into a scoped clientlib category loaded only when the component is used
- Dynamic values passed via `data-*` attributes; clientlib JS reads and applies them
- `application/ld+json` is the only acceptable inline `<script>` type

#### Bad Example
```html
<!-- hero.html — inline style with authored value: not cacheable, forces CSP unsafe-inline -->
<style>
    .hero { background-color: ${properties.bgColor}; }
</style>

<!-- Inline JS config object: same problems -->
<script>
    window.pageConfig = {
        locale: '${currentPage.language}',
        env:    '${wcmMode.edit ? "edit" : "publish"}'
    };
</script>
```

#### Good Example
```html
<!-- Pass authored values as data attributes; no inline block needed -->
<section class="hero"
         data-bg-color="${properties.bgColor @ context='attribute'}"
         data-locale="${currentPage.language}">
</section>
<!-- clientlib JS reads data-bg-color and sets style at runtime -->

<!-- Structured data only: acceptable inline script -->
<script type="application/ld+json">${component.structuredData @ context='unsafe'}</script>
```

#### False Positives
- `application/ld+json` structured data (not executable JavaScript)
- `<style>` blocks in HTL used exclusively in email templates (no CSP or Dispatcher caching applies)

#### Related Rules
- `AEMAMS-PERF-009` (render-blocking — inline scripts compound blocking)
- `AEMAMS-SEC-003` (XSS — `context='unsafe'` required for inline HTML)

---

### AEMAMS-PERF-011: Client Library Category Proliferation

- **Severity**: Medium
- **Description**: Loading more than ~8 distinct clientlib categories on every page creates multiple HTTP requests that cannot be multiplexed in HTTP/1.1 connections (still common in AMS environments behind older Dispatcher or CDN configs). It also increases HTML Library Manager compilation time and complicates cache invalidation.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/.content.xml
```

#### Detect — Bad Pattern
- More than 8 `cq:ClientLibraryFolder` nodes under `/apps/mysite/clientlibs/`, each with a unique category, all embedded unconditionally in the page template
- Page template `customheaderlibs.html` / `customfooterlibs.html` referencing more than 8 separate categories
- Every component declaring its own unique category loaded globally (not on-demand)

#### Detect — Good Pattern
- `mysite.base` — all page-invariant CSS/JS compiled into a single bundle
- Per-component categories (`mysite.carousel`) declared in the component's own `.content.xml` and activated via AEM template policies (loaded only on pages using the component)
- `dependencies` used for shared AEM platform libraries (Granite, CoralUI) — never `embed`

#### Bad Example
```
# customheaderlibs.html loads all 10 categories unconditionally on every page:
mysite.reset, mysite.typography, mysite.grid, mysite.header,
mysite.footer, mysite.nav, mysite.hero, mysite.teaser,
mysite.search, mysite.utility
→ 10 separate CSS and JS requests per page
```

#### Good Example
```
# Page template loads only the consolidated base
mysite.base                ← one CSS + one JS request per page

# Carousel component's .content.xml:
#   categories="[mysite.carousel]"
# Template editor adds mysite.carousel to page policy only for pages with carousels
```

#### False Positives
- Intentionally distinct page-type bundles (homepage bundle vs article bundle vs product bundle) — this is correct code-splitting, not proliferation
- Authoring clientlibs categorised separately from publish clientlibs (edit-mode only, never served through Dispatcher)

#### Related Rules
- `AEMAMS-PERF-007` (clientlib size — proliferation and large bundles compound each other)
- `AEMAMS-PERF-009` (render-blocking — more categories = more blocking requests in HTTP/1.1)

---

## Security Rules

---

### AEMAMS-SEC-001: Hardcoded Credentials

- **Severity**: Critical
- **Description**: Credentials, API keys, tokens, and secrets must not appear in source code or committed OSGi configurations. AMS projects use CRXDE-stored OSGi configs or environment-specific `.cfg.json` files to inject secrets at deploy time.

#### Detect — Files to Scan
```
**/*.java
**/*.cfg.json
**/*.config
**/*.xml
**/*.properties
**/*.yaml
!**/test/**
```

#### Detect — Bad Pattern
```regex
(password|passwd|secret|api[_-]?key|token|auth)\s*[=:]\s*["'][^"']{8,}["']
admin\s*[,/]\s*admin
Bearer\s+[A-Za-z0-9\-._~+/]+=*
-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----
AKIA[0-9A-Z]{16}
```

#### Detect — Good Pattern
- `System.getenv("API_KEY")` for runtime injection
- OSGi config with `$[env:VAR_NAME]` (AEM 6.5.8+ / Cloud compatibility layer)
- CRXDE-stored OSGi configuration not committed to source control

#### Bad Example
```java
private static final String API_KEY = "sk-1234567890abcdef1234567890abcdef";
post.setHeader("Authorization", "Bearer eyJhbGciOiJSUzI1Ni...");
```

```json
{
    "password": "MySuperSecret123!"
}
```

#### Good Example
```java
@Activate
protected void activate(Config config) {
    this.apiKey = config.api_key();
}
```

```json
// org.mysite.api.Config.cfg.json — value injected from environment
{
    "api.key": "$[env:MYSITE_API_KEY]"
}
```

#### False Positives
- Test fixtures with clearly fake credentials (`test`, `changeme`, `YOUR_KEY_HERE`)
- Public keys — only private keys and symmetric secrets are violations
- Maven property placeholders (`${project.version}`)

#### Related Rules
- `AEMAMS-SLING-003` (admin session — `admin/admin` in session login)
- `AEMAMS-SEC-002` (dispatcher — exposed admin compounds credential risk)

---

### AEMAMS-SEC-002: Missing Dispatcher Security Filter Rules

- **Severity**: High
- **Description**: AMS Dispatcher must explicitly deny access to AEM admin endpoints, CRXDE, system consoles, and internal APIs. A misconfigured Dispatcher is the primary attack surface for AMS installations exposed to the internet.

#### Detect — Files to Scan
```
dispatcher/src/conf.dispatcher.d/filters/**/*.any
dispatcher/src/conf.d/**/*.conf
```

#### Detect — Bad Pattern
- No deny rules for `/crx`, `/system/console`, `/bin/crxde`, `/libs/granite/security`
- Top-level `/0001 { /type "allow" /glob "*" }` with no subsequent denies
- Missing deny for `*.infinity.json`, `*.tidy.json`, `*.query.json`
- `.json` selector allowed on `/content` paths without restriction

#### Detect — Good Pattern
```
/0001 { /type "deny"  /url "*" }
/0010 { /type "allow" /url "/content/*" }
/0100 { /type "deny"  /url "/crx/*" }
/0101 { /type "deny"  /url "/system/*" }
/0102 { /type "deny"  /url "*.infinity.json" }
```

#### Bad Example
```
# Dangerously permissive — no deny rules at all
/0001 { /type "allow" /glob "*" }
```

#### Good Example
```
# Default deny, explicit allow
/0001 { /type "deny"  /url "*" }

# Public content
/0010 { /type "allow" /url "/content/mysite/*" }
/0011 { /type "allow" /url "/etc.clientlibs/*" }
/0012 { /type "allow" /url "/libs/granite/csrf/token.json" method="GET" }

# Explicit sensitive-path denies (defense in depth)
/0100 { /type "deny" /url "/crx/*" }
/0101 { /type "deny" /url "/system/*" }
/0102 { /type "deny" /url "/bin/crxde*" }
/0103 { /type "deny" /url "*.infinity.json" }
/0104 { /type "deny" /url "*.tidy.json" }
/0105 { /type "deny" /url "*.query.json" }
/0106 { /type "deny" /url "*.sysview.xml" }
```

#### False Positives
- Author-tier Dispatcher where admin endpoints are intentionally accessible to authenticated users
- Custom `/bin/` endpoints that are legitimately public (must be explicitly allowed by exact path)

#### Related Rules
- `AEMAMS-SEC-001` (hardcoded credentials compound Dispatcher misconfiguration risk)
- `AEMAMS-SEC-003` (XSS — Dispatcher CSP headers are a complementary defence)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-dispatcher/using/getting-started/dispatcher-install.html

---

### AEMAMS-SEC-003: XSS in HTL / Sightly

- **Severity**: High
- **Description**: HTL display contexts control output encoding. `context='unsafe'` or `context='html'` with user-controllable data enables Cross-Site Scripting. The default context (`text`) is safe; explicit unsafe overrides must be justified.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/*.htl
```

#### Detect — Bad Pattern
```regex
\$\{.*@\s*context\s*=\s*'unsafe'\s*\}
\$\{.*@\s*context\s*=\s*'html'\s*\}.*(?:request|param|query|header)
\$\{request\.(parameter|requestURL|queryString)
```

#### Detect — Good Pattern
- Default context: `${properties.title}` — auto text-escaped
- `${properties.link @ context='uri'}` for authored link URLs
- `${properties.richtext @ context='html'}` only for RTE-sanitised fields

#### Bad Example
```html
<!-- Direct XSS -->
<div>${properties.userBio @ context='unsafe'}</div>

<!-- Reflected XSS via request parameter -->
<h1>${request.requestParameterMap['q'][0].string @ context='html'}</h1>
```

#### Good Example
```html
<!-- Auto text-escaped -->
<div>${properties.userBio}</div>

<!-- Safe link rendering -->
<a href="${properties.ctaLink @ context='uri'}">${properties.ctaText}</a>
```

#### False Positives
- `context='html'` on fields always written by the RTE (which sanitises on save)
- `context='unsafe'` in authoring-only UI components (lower risk but still bad practice)

#### Related Rules
- `AEMAMS-SEC-002` (Dispatcher can add CSP headers as additional XSS defence)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-htl/content/specification.html

---

### AEMAMS-SEC-004: Overly Broad Service User Permissions

- **Severity**: High
- **Description**: Service users must follow least-privilege. Granting `jcr:all` on `/` or `/content` gives complete repository write access; if the associated bundle is compromised, an attacker can read/write all content and user data.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/home/users/system/**/.content.xml
ui.content/src/main/content/jcr_root/home/users/system/**/.content.xml
ui.config/src/main/content/jcr_root/apps/**/config/**/org.apache.sling.serviceusermapping*
```

#### Detect — Bad Pattern
```regex
allow\s+jcr:all\s+on\s+/(?!content/specific)
allow\s+.*\s+on\s+/\s*$
allow\s+rep:write\s+on\s+/content\s*$
```

#### Detect — Good Pattern
- Permissions scoped to specific site subtree: `allow jcr:read on /content/mysite/en`
- Write access only to paths the bundle actually modifies
- Explicit deny on sensitive sub-paths within an allowed tree

#### Bad Example
```xml
<!-- _rep_policy.xml — dangerously broad -->
<jcr:root xmlns:rep="internal"
    jcr:primaryType="rep:ACL">
    <allow
        jcr:primaryType="rep:GrantACE"
        rep:principalName="mysite-service"
        rep:privileges="{Name}[jcr:all]"
        rep:nodePath="/"/>
</jcr:root>
```

#### Good Example
```xml
<allow
    jcr:primaryType="rep:GrantACE"
    rep:principalName="mysite-service"
    rep:privileges="{Name}[jcr:read]"
    rep:nodePath="/content/mysite"/>
<allow
    jcr:primaryType="rep:GrantACE"
    rep:principalName="mysite-service"
    rep:privileges="{Name}[jcr:read,rep:write]"
    rep:nodePath="/content/mysite/generated"/>
```

#### False Positives
- Migration scripts with intentionally broad permissions — must be scoped to `config.author.dev` or removed post-migration

#### Related Rules
- `AEMAMS-ARCH-006` (service user mapping)
- `AEMAMS-SLING-003` (admin session — alternative to proper service user)

---

### AEMAMS-SEC-005: CSRF Protection Disabled or Bypassed

- **Severity**: High
- **Description**: AEM's built-in CSRF protection (`com.adobe.granite.csrf`) must not be disabled. POST servlets registered on `/bin/` paths must either validate the CSRF token or require authentication. Disabling CSRF allows forged cross-site requests to modify content.

#### Detect — Files to Scan
```
ui.config/src/main/content/jcr_root/apps/**/config/**/*csrf*
ui.apps/src/main/content/jcr_root/apps/**/*.java
core/src/main/java/**/*Servlet*.java
```

#### Detect — Bad Pattern
```regex
csrf\.disabled\s*=\s*true
excludedPaths.*\/bin\/
@SlingServletPaths.*\/bin\/.*(?!.*csrf|.*token)
```

#### Detect — Good Pattern
- POST servlets at `/bin/` validate `_charset_` + CSRF token from `AdobeGraniteCsrfImpl`
- Client-side HTL forms include `${csrf.token}` hidden field
- Whitelist only specific authenticated endpoints in the CSRF exclusion list

#### Bad Example
```json
// com.adobe.granite.csrf.impl.CSRFFilter.cfg.json
{
    "csrf.disabled": true    // Disables ALL CSRF protection globally
}
```

```html
<!-- Form missing CSRF token -->
<form method="POST" action="/bin/mysite/submit">
    <input type="text" name="email"/>
    <button type="submit">Submit</button>
</form>
```

#### Good Example
```html
<!-- Include CSRF token via Granite CSRF provider -->
<form method="POST" action="/bin/mysite/submit">
    <input type="hidden" name="${csrf.tokenName}" value="${csrf.token}"/>
    <input type="text" name="email"/>
    <button type="submit">Submit</button>
</form>
```

#### False Positives
- API endpoints that require an `Authorization: Bearer` header (stateless auth bypasses need for CSRF tokens)
- Endpoints called exclusively by server-to-server integrations (not browser-initiated)

#### Related Rules
- `AEMAMS-SEC-002` (Dispatcher — CSRF token endpoint must be allowed through)

---

## AMS-Specific Rules

---

### AEMAMS-AMS-001: Runmode-Specific OSGi Configuration Missing

- **Severity**: High
- **Description**: AMS supports author/publish/dev/stage/prod runmodes. Configurations not separated by runmode use the same values on author and publish, exposing author-only settings (e.g., replication transport passwords) on publish and vice versa.

#### Detect — Files to Scan
```
ui.config/src/main/content/jcr_root/apps/**/config*/**
ui.apps/src/main/content/jcr_root/apps/**/config*/**
```

#### Detect — Bad Pattern
- Single `config/` directory for configs that differ between author and publish (e.g., replication agent URIs, DAM update workflow toggles)
- Non-standard runmode folders: `config.local`, `config.integration`, `config.qa` (silently ignored by AEM)
- Transport credentials present in `config/` (all environments) instead of `config.author/`

#### Detect — Good Pattern
- `config/` for truly environment-agnostic settings
- `config.author/` and `config.publish/` for role-specific settings
- `config.author.dev/` for dev-only author overrides (debug logging, etc.)

#### Bad Example
```
apps/mysite/config/
    com.day.cq.replication.impl.ReplicationContentFactory.cfg.json
    # same replication config on both author and publish — wrong
```

#### Good Example
```
apps/mysite/config/
    org.apache.sling.commons.log.LogManager.factory.config-mysite.cfg.json

apps/mysite/config.author/
    com.day.cq.replication.impl.TransportHandlerFactory.cfg.json

apps/mysite/config.publish/
    com.day.cq.wcm.foundation.impl.HTLScriptEngineFactoryImpl.cfg.json

apps/mysite/config.author.dev/
    org.apache.sling.commons.log.LogManager.factory.config-debug.cfg.json
```

#### False Positives
- Configs proven identical across all runmodes (e.g., bundle symbolic names, package identifiers)

#### Related Rules
- `AEMAMS-SEC-001` (hardcoded credentials — author-only credentials leaking into publish config)

---

### AEMAMS-AMS-002: Replication Agent Transport Credentials in Source Control

- **Severity**: Critical
- **Description**: Replication agent `.content.xml` files stored in source control must not contain `transportPassword` in plaintext. AMS environments should store transport credentials in CRXDE at deploy time or via pipeline secret injection.

#### Detect — Files to Scan
```
ui.content/src/main/content/jcr_root/etc/replication/agents.author/**/.content.xml
ui.content/src/main/content/jcr_root/etc/replication/agents.publish/**/.content.xml
```

#### Detect — Bad Pattern
```regex
transportPassword\s*=\s*["'][^"']{3,}["']
transportUser\s*=\s*["']admin["']
```

#### Detect — Good Pattern
- `transportPassword` absent from source control (set via CRX Package Manager post-deploy script or pipeline)
- `transportUser` set to a dedicated replication service account, not `admin`
- Password placeholder `{encrypt}...` (AEM encrypted value) acceptable if the encryption key is managed separately

#### Bad Example
```xml
<!-- agents.author/publish/.content.xml — password in source control -->
<jcr:root
    transportUri="http://publish:4503/bin/receive"
    transportUser="admin"
    transportPassword="admin123"/>
```

#### Good Example
```xml
<!-- Credentials omitted — set via post-deploy script or AMS provisioning -->
<jcr:root
    transportUri="http://publish:4503/bin/receive"
    transportUser="replication-agent"
    <!-- transportPassword set by deploy pipeline -->
    />
```

#### False Positives
- `{encrypt}...` values where the symmetric key is managed by AMS (encrypted at rest)

#### Related Rules
- `AEMAMS-SEC-001` (hardcoded credentials)
- `AEMAMS-PERF-004` (replication queue configuration)

---

### AEMAMS-AMS-003: DAM Update Asset Workflow Customisation Risk

- **Severity**: Medium
- **Description**: Modifying the out-of-the-box `DAM Update Asset` workflow (`/var/workflow/models/dam/update_asset`) directly breaks AEM Service Pack updates which reset this model. Custom asset processing steps must be added via a separate custom workflow launcher or a sub-workflow call.

#### Detect — Files to Scan
```
ui.content/src/main/content/jcr_root/var/workflow/models/dam/update_asset/**
ui.apps/src/main/content/jcr_root/var/workflow/models/dam/update_asset/**
```

#### Detect — Bad Pattern
- Any content package filter covering `/var/workflow/models/dam/update_asset`
- Modified `update_asset` workflow nodes in `ui.content`

#### Detect — Good Pattern
- Custom workflow launcher pointing to a separate custom workflow model
- Post-processing profile via `com.day.cq.dam.core.process.CreateAssetFromFolderStructure` sub-process calls
- AEM Assets processing profiles (AEM 6.4+) for rendition generation

#### Bad Example
```xml
<!-- ui.content/filter.xml — DO NOT own the OOTB workflow -->
<filter root="/var/workflow/models/dam/update_asset"/>
```

#### Good Example
```xml
<!-- own only your custom workflow -->
<filter root="/var/workflow/models/mysite/custom-asset-processor"/>
```

#### False Positives
- Content packages deploying only the workflow launcher for custom models (not the model itself)

---

### AEMAMS-AMS-004: Maintenance Task Configuration

- **Severity**: Medium
- **Description**: AMS instances require properly configured AEM Maintenance Tasks (revision cleanup, datastore GC, workflow purge, audit log purge). Missing or incorrect maintenance window configuration causes unbounded repository growth and eventual disk exhaustion.

#### Detect — Files to Scan
```
ui.config/src/main/content/jcr_root/apps/**/config/**/MaintenanceTaskScheduler*
ui.content/src/main/content/jcr_root/var/granite/maintenance/**
```

#### Detect — Bad Pattern
- No `com.adobe.granite.maintenance.impl.MaintenanceTaskScheduler` config present
- Revision cleanup (`RevisionGarbageCollectionTask`) disabled or window set to never
- Workflow purge task absent when project uses custom workflows
- Datastore GC absent when binary files are stored in FileDataStore

#### Detect — Good Pattern
```json
// com.adobe.granite.maintenance.impl.MaintenanceTaskScheduler.cfg.json
{
    "granite.maintenance.tasks": [
        "com.adobe.granite.maintenance.impl.RevisionGarbageCollectionTask",
        "com.adobe.granite.maintenance.impl.VersionPurgeTask",
        "com.adobe.granite.workflow.purge.impl.WorkflowPurgeTask",
        "com.adobe.granite.maintenance.impl.AuditLogMaintenanceTask"
    ],
    "granite.maintenance.windows": [
        "0 2 * * 7 ? *"
    ]
}
```

#### Bad Example
```json
// No maintenance config — repository grows unbounded
// No RevisionGarbageCollectionTask — segment store fills disk
```

#### False Positives
- Author instances where maintenance is managed by Adobe Operations via AMS contracts
- Instances using MongoDB (TarMK revision cleanup does not apply)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-65/administering/operations/operations-dashboard.html

---

### AEMAMS-AMS-005: Missing Sling Health Check Integration

- **Severity**: Medium
- **Description**: AMS load balancer and monitoring rely on Sling Health Checks (accessible at `/system/health`). Servlets or services that can fail silently must expose health checks so the AMS platform can detect degraded instances and route traffic away.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
ui.config/src/main/content/jcr_root/apps/**/config/**/*HealthCheck*
```

#### Detect — Bad Pattern
- External service dependencies (databases, APIs) with no corresponding `HealthCheck` OSGi component
- No `com.adobe.granite.omnisearch.api.suggestion.PreferencesBasedSuggester` or custom `HealthCheck` when the project has critical external integrations
- Health check endpoint blocked by Dispatcher filters (so the load balancer cannot reach it)

#### Detect — Good Pattern
```java
@Component(service = HealthCheck.class,
    property = {
        HealthCheck.NAME + "=My External API",
        HealthCheck.TAGS + "=integrations",
        HealthCheck.MBEAN_NAME + "=myExternalApiHealthCheck"
    })
public class ExternalApiHealthCheck implements HealthCheck {
    @Override
    public Result execute() {
        try {
            externalApi.ping();
            return new Result(Result.Status.OK, "External API reachable");
        } catch (Exception e) {
            return new Result(Result.Status.CRITICAL, "External API unreachable", e);
        }
    }
}
```

#### False Positives
- Services with no external dependencies (pure in-process logic needs no health check)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-65/administering/operations/operations-dashboard.html#health-reports

---

### AEMAMS-AMS-006: Log Level Left at DEBUG in Production Config

- **Severity**: Medium
- **Description**: DEBUG or TRACE log levels committed in production runmode configs (`config/` or `config.publish/`) produce excessive log volume. On AMS, runaway logging fills disk, triggers alerts, and can cause log shipper back-pressure that impacts application threads.

#### Detect — Files to Scan
```
ui.config/src/main/content/jcr_root/apps/**/config/**/*LogManager*
ui.apps/src/main/content/jcr_root/apps/**/config/**/*LogManager*
```

#### Detect — Bad Pattern
```regex
"org\.apache\.sling\.commons\.log\.level"\s*:\s*"(DEBUG|TRACE|ALL)"
```
in files under `config/` or `config.publish/` (non-dev runmode paths)

#### Detect — Good Pattern
- `DEBUG`/`TRACE` only in `config.author.dev/` or `config.dev/` runmode folders
- Production runmodes use `WARN` or `ERROR` for all packages; `INFO` for custom packages

#### Bad Example
```json
// apps/mysite/config/org.apache.sling.commons.log.LogManager.factory.config-mysite.cfg.json
{
    "org.apache.sling.commons.log.level": "DEBUG",   // DEBUG in ALL environments
    "org.apache.sling.commons.log.names": ["com.mysite"]
}
```

#### Good Example
```json
// apps/mysite/config/org.apache.sling.commons.log.LogManager.factory.config-mysite.cfg.json
{
    "org.apache.sling.commons.log.level": "INFO",
    "org.apache.sling.commons.log.names": ["com.mysite"]
}

// apps/mysite/config.author.dev/org.apache.sling.commons.log.LogManager.factory.config-mysite-debug.cfg.json
{
    "org.apache.sling.commons.log.level": "DEBUG",
    "org.apache.sling.commons.log.names": ["com.mysite"]
}
```

#### False Positives
- Temporary DEBUG config deployed to stage for a specific investigation (must be removed post-investigation)

#### Related Rules
- `AEMAMS-AMS-001` (runmode separation)

---

## Frontend Framework Rules (ui.frontend SPA)

---

### AEMAMS-FE-001: Frontend Framework Detection & Audit Scope

- **Severity**: Info
- **Description**: When `ui.frontend` contains React, Angular, or Vue (detected from `package.json` dependencies), the audit engine activates framework-specific rules covering component patterns, state management, bundle optimization, accessibility, and security. All findings are tagged with `ui.frontend` module.

#### Detect — Files to Scan
```
ui.frontend/package.json
```

#### Detect — Frameworks
- `react` / `react-dom` → React rules activated
- `@angular/core` → Angular rules activated
- `vue` → Vue rules activated
- None of the above → Generic vanilla JS/TS rules only

---

### AEMAMS-FE-002: Heavy Library Dependency

- **Severity**: Medium
- **Description**: Large libraries (moment.js, lodash full, jQuery, underscore) in `ui.frontend` dependencies bloat the final bundle that is compiled into AEM client libraries. On AMS without guaranteed CDN, raw asset size is critical.

#### Detect — Files to Scan
```
ui.frontend/package.json
```

#### Detect — Bad Pattern
- `moment` in dependencies (330KB+)
- `lodash` (not `lodash-es`) in dependencies (70KB+)
- `jquery` in a React/Angular/Vue project
- `underscore` when native ES6+ methods suffice

#### Detect — Good Pattern
- `date-fns` or `dayjs` instead of `moment`
- `lodash-es` or individual imports (`lodash/debounce`)
- No jQuery in SPA projects

#### Bad Example
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "moment": "^2.29.4",
    "lodash": "^4.17.21",
    "jquery": "^3.7.0"
  }
}
```

#### Good Example
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "date-fns": "^3.0.0",
    "lodash-es": "^4.17.21"
  }
}
```

---

### AEMAMS-FE-003: Missing Frontend Test Framework

- **Severity**: High
- **Description**: AEM `ui.frontend` projects with SPA frameworks must have unit and component testing. Frontend code without tests has high regression risk, especially when bundled output is deployed as AEM clientlibs.

#### Detect — Files to Scan
```
ui.frontend/package.json
```

#### Detect — Bad Pattern
- No `jest`, `vitest`, `karma`, `@testing-library/*`, `@vue/test-utils` in dependencies
- No test script in `package.json`

#### Detect — Good Pattern
- Jest or Vitest with testing-library installed
- Test script configured: `"test": "jest --coverage"`
- Coverage threshold configured

---

### AEMAMS-FE-004: React — Missing Key in List Rendering

- **Severity**: High
- **Description**: React list rendering (`.map()`) without `key` prop causes reconciliation errors. React cannot efficiently track list items, leading to incorrect DOM updates and component state leakage.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.{tsx,jsx}
```

#### Detect — Bad Pattern
```regex
\.map\s*\(\s*\(?[^)]*\)?\s*=>\s*[(<](?![\s\S]{0,200}key=)
```

#### Bad Example
```tsx
{items.map(item => (
  <li>{item.name}</li>  {/* Missing key prop */}
))}
```

#### Good Example
```tsx
{items.map(item => (
  <li key={item.id}>{item.name}</li>
))}
```

---

### AEMAMS-FE-005: React — useEffect Without Dependency Array

- **Severity**: High
- **Description**: `useEffect` without a dependency array runs on every render, causing performance issues and potential infinite loops (especially with state updates inside the effect).

#### Detect — Files to Scan
```
ui.frontend/src/**/*.{tsx,jsx,ts,js}
```

#### Detect — Bad Pattern
```regex
useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;
```
(useEffect call with no second argument — no `[]` before closing paren)

#### Bad Example
```tsx
useEffect(() => {
  fetchData();  // Runs on EVERY render — infinite loop if fetchData sets state
});
```

#### Good Example
```tsx
useEffect(() => {
  fetchData();
}, []); // Runs once on mount

useEffect(() => {
  fetchData(userId);
}, [userId]); // Runs when userId changes
```

---

### AEMAMS-FE-006: React — dangerouslySetInnerHTML Without Sanitization

- **Severity**: Critical
- **Description**: Using `dangerouslySetInnerHTML` without sanitization (DOMPurify) is a Cross-Site Scripting (XSS) vulnerability. User-controlled content rendered as raw HTML can execute malicious scripts.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.{tsx,jsx}
```

#### Detect — Bad Pattern
```regex
dangerouslySetInnerHTML\s*=\s*\{(?![\s\S]{0,100}(sanitize|DOMPurify|purify))
```

#### Bad Example
```tsx
<div dangerouslySetInnerHTML={{ __html: userComment }} />
```

#### Good Example
```tsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userComment) }} />
```

---

### AEMAMS-FE-007: Angular — Observable Without Unsubscribe

- **Severity**: High
- **Description**: Angular observables that are `.subscribe()`d without cleanup (`takeUntil`, `unsubscribe` in `ngOnDestroy`, or `async` pipe) leak memory. Each subscription lives beyond component destruction.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.ts
```

#### Detect — Bad Pattern
- `.subscribe()` without `takeUntil(destroy$)` pattern
- Component with subscriptions but no `OnDestroy` implementation
- No `unsubscribe` in component lifecycle

#### Bad Example
```typescript
@Component({ ... })
export class UserComponent {
  ngOnInit() {
    this.http.get('/api/users').subscribe(users => this.users = users);
    // Never unsubscribed — leaks on every component creation/destruction
  }
}
```

#### Good Example
```typescript
@Component({ ... })
export class UserComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  ngOnInit() {
    this.http.get('/api/users')
      .pipe(takeUntil(this.destroy$))
      .subscribe(users => this.users = users);
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
```

---

### AEMAMS-FE-008: Angular — *ngFor Without trackBy

- **Severity**: High
- **Description**: `*ngFor` without `trackBy` causes Angular to destroy and recreate the entire DOM list on every change detection cycle. With large lists this causes visible flicker and poor performance.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.html
```

#### Detect — Bad Pattern
```regex
\*ngFor\s*=\s*"[^"]*"(?![\s\S]{0,50}trackBy)
```

#### Bad Example
```html
<li *ngFor="let item of items">{{ item.name }}</li>
```

#### Good Example
```html
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>
```

---

### AEMAMS-FE-009: Vue — v-for Without :key

- **Severity**: High
- **Description**: Vue's `v-for` directive without `:key` binding prevents Vue's virtual DOM from efficiently tracking list changes. Without `:key`, Vue uses a "patch in place" strategy that fails with stateful child components.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.vue
```

#### Detect — Bad Pattern
```regex
v-for\s*=\s*"[^"]*"(?![\s\S]{0,50}:key|v-bind:key)
```

#### Bad Example
```html
<div v-for="item in items">{{ item.name }}</div>
```

#### Good Example
```html
<div v-for="item in items" :key="item.id">{{ item.name }}</div>
```

---

### AEMAMS-FE-010: Vue — v-html Without Sanitization (XSS)

- **Severity**: Critical
- **Description**: `v-html` renders raw HTML directly into the DOM. If the value contains user-controlled data, attackers can inject malicious scripts. Equivalent to `innerHTML` assignment.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.vue
```

#### Detect — Bad Pattern
```regex
v-html\s*=\s*"(?!.*sanitize|.*DOMPurify)
```

#### Bad Example
```html
<div v-html="userComment"></div>
```

#### Good Example
```html
<div v-html="sanitizedComment"></div>
<!-- In setup: sanitizedComment = DOMPurify.sanitize(raw) -->
```

---

### AEMAMS-FE-011: Direct DOM Manipulation in SPA Framework

- **Severity**: Medium
- **Description**: Using `document.getElementById`, `document.querySelector`, or `.innerHTML=` inside React/Angular/Vue components bypasses the framework's virtual DOM / change detection. This causes rendering inconsistencies and memory leaks.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.{ts,tsx,js,jsx,vue}
```

#### Detect — Bad Pattern
```regex
document\.(getElementById|querySelector|getElementsBy|createElement)|\.innerHTML\s*=
```

#### Detect — Good Pattern
- React: `useRef()` for DOM access
- Angular: `@ViewChild` or `Renderer2`
- Vue: `ref="myElement"` template refs

---

### AEMAMS-FE-012: Hardcoded Environment URLs in Frontend

- **Severity**: High
- **Description**: Hardcoded URLs with environment identifiers (localhost, dev, stage, prod) in frontend source code break across AEM environments. The compiled clientlib output contains the hardcoded URL, which is wrong in all other environments.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.{ts,tsx,js,jsx,vue}
```

#### Detect — Bad Pattern
```regex
(https?:\/\/|\/\/)(localhost|127\.0\.0\.1|[a-z]+\.(dev|stage|prod|internal)\.)
```

#### Detect — Good Pattern
- `process.env.REACT_APP_API_URL` (React)
- `environment.apiUrl` (Angular)
- `import.meta.env.VITE_API_URL` (Vite/Vue)
- Runtime config read from AEM page properties or data attributes

---

### AEMAMS-FE-013: Secrets in Frontend Code

- **Severity**: Critical
- **Description**: API keys, tokens, passwords, or secrets in frontend source code are exposed to all users via browser DevTools. All client-side code is public; secrets must be kept on the server side.

#### Detect — Files to Scan
```
ui.frontend/src/**/*.{ts,tsx,js,jsx,vue}
!ui.frontend/src/**/*.{spec,test}.*
```

#### Detect — Bad Pattern
```regex
(api[_-]?key|secret|token|password|auth)\s*[:=]\s*['"][^'"]{8,}['"]
```

#### Detect — Good Pattern
- Proxy API calls through AEM servlet/backend
- Use `.env` files (not committed) with build-time replacement
- Server-side environment variables only