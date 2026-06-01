# AEM as a Cloud Service (AEMaaCS) Rules

---

## Architecture Rules

---

### AEMCS-ARCH-001: Mutable vs Immutable Content Separation

- **Severity**: Critical
- **Description**: Content in `ui.apps` must be immutable (code/templates/components). Mutable content (pages, tags, config values editable at runtime) belongs in `ui.content` or `ui.config`. Cloud Service enforces this at deployment; violations cause deployment failures.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/**
```

#### Detect — Bad Pattern
- Files under `ui.apps/src/main/content/jcr_root/content/`
- Files under `ui.apps/src/main/content/jcr_root/conf/` that aren't template definitions
- `.content.xml` with `jcr:primaryType="cq:Page"` inside `ui.apps`
- Tags definitions in `ui.apps/src/main/content/jcr_root/content/cq:tags/`

#### Detect — Good Pattern
- `ui.apps` contains only `/apps/`, `/libs/` overlays, and component definitions
- Mutable content lives in `ui.content/src/main/content/jcr_root/content/`
- Config values in `ui.config/src/main/content/jcr_root/apps/.../config/`

#### Bad Example
```xml
<!-- ui.apps/src/main/content/jcr_root/content/mysite/en/.content.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
    xmlns:cq="http://www.day.com/jcr/cq/1.0"
    jcr:primaryType="cq:Page">
    <jcr:content
        jcr:title="English"
        sling:resourceType="mysite/components/page"/>
</jcr:root>
```

#### Good Example
```xml
<!-- ui.content/src/main/content/jcr_root/content/mysite/en/.content.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
    xmlns:cq="http://www.day.com/jcr/cq/1.0"
    jcr:primaryType="cq:Page">
    <jcr:content
        jcr:title="English"
        sling:resourceType="mysite/components/page"/>
</jcr:root>
```

#### False Positives
- `/apps/mysite/components/` content in `ui.apps` is correct (component definitions are immutable)
- `/apps/mysite/i18n/` in `ui.apps` is acceptable (translation keys are code)
- Template structure nodes under `/conf/` that define the template type (not instances)

#### Related Rules
- `AEMCS-CLOUD-002` (install hooks — often used to work around this issue incorrectly)
- `AEMCS-ARCH-003` (custom runmodes — related config management concern)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/developing/aem-project-content-package-structure.html

---

### AEMCS-ARCH-002: No Classic UI Components

- **Severity**: High
- **Description**: Classic UI (CQ5 era) components using ExtJS, CoralUI 2, or `/libs/foundation/` are unsupported in Cloud Service. The Touch UI is mandatory. Projects migrating from AEM 6.x commonly carry these forward.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/.content.xml
ui.apps/src/main/content/jcr_root/apps/**/_cq_editConfig/.content.xml
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**
```

#### Detect — Bad Pattern
- `.content.xml` containing `cq:isContainer="true"` with `jcr:primaryType="cq:Widget"`
- `_cq_editConfig` with `xtype` properties (ExtJS)
- `sling:resourceType` pointing to `/libs/foundation/components/`
- References to `cq/gui/components/authoring/clientlibs/editor/js/EditorFrame.js`
- Dialog definitions using `cq:Dialog` (Classic) instead of `cq:dialog` (Touch UI `nt:unstructured`)

#### Detect — Good Pattern
- Components using `cq:dialog` (lowercase) with `sling:resourceType="granite/ui/components/..."`
- Edit configs using Touch UI `cq:listeners` and `cq:EditConfig` graniteUI-based
- Client libraries with `categories` targeting touch UI (`cq.authoring.editor`)

#### Bad Example
```xml
<!-- Classic UI dialog -->
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
    jcr:primaryType="cq:Dialog"
    title="My Component"
    xtype="dialog">
    <items jcr:primaryType="cq:WidgetCollection">
        <tab1 jcr:primaryType="cq:Panel" title="Properties">
            <items jcr:primaryType="cq:WidgetCollection">
                <title xtype="textfield" fieldLabel="Title" name="./jcr:title"/>
            </items>
        </tab1>
    </items>
</jcr:root>
```

#### Good Example
```xml
<!-- Touch UI dialog (Granite UI) -->
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    xmlns:granite="http://www.adobe.com/jcr/granite/1.0"
    jcr:primaryType="nt:unstructured"
    sling:resourceType="cq/gui/components/authoring/dialog">
    <content jcr:primaryType="nt:unstructured"
        sling:resourceType="granite/ui/components/coral/foundation/container">
        <items jcr:primaryType="nt:unstructured">
            <title jcr:primaryType="nt:unstructured"
                sling:resourceType="granite/ui/components/coral/foundation/form/textfield"
                fieldLabel="Title"
                name="./jcr:title"/>
        </items>
    </content>
</jcr:root>
```

#### False Positives
- Overlay of `/libs/foundation/` purely to disable/hide a component in template policies (not usage)
- Comments referencing Classic UI for migration tracking purposes

#### Related Rules
- `AEMCS-CLOUD-003` (Oak index issues — old index definitions from 6.x often accompany Classic UI)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/developing/ui-structure.html

---

### AEMCS-ARCH-003: No Custom Runmode Configs

- **Severity**: High
- **Description**: Cloud Service supports only: `author`, `publish`, `dev`, `stage`, `prod`, and combinations like `config.author.dev`. Custom runmodes (e.g., `config.integration`, `config.local`) are silently ignored, causing configs to not load.

#### Detect — Files to Scan
```
ui.config/src/main/content/jcr_root/apps/**/config*/**
ui.apps/src/main/content/jcr_root/apps/**/config*/**
```

#### Detect — Bad Pattern
- Directories named `config.<custom>` where `<custom>` is not in `[author, publish, dev, stage, prod]`
- Common violations: `config.local`, `config.integration`, `config.uat`, `config.perf`
- Compound runmodes with custom values: `config.publish.custom`

#### Detect — Good Pattern
- `config/` (all environments)
- `config.author/`, `config.publish/`
- `config.author.dev/`, `config.publish.prod/`
- `config.dev/`, `config.stage/`, `config.prod/`

#### Bad Example
```
apps/mysite/config.local/           ← IGNORED in Cloud Service
apps/mysite/config.integration/     ← IGNORED in Cloud Service
apps/mysite/config.publish.uat/     ← IGNORED in Cloud Service
```

#### Good Example
```
apps/mysite/config/                      ← All environments
apps/mysite/config.author/               ← Author only
apps/mysite/config.publish/              ← Publish only
apps/mysite/config.author.dev/           ← Author + Dev
apps/mysite/config.publish.stage/        ← Publish + Stage
```

#### False Positives
- Test configurations in `src/test/` (not deployed)
- Docker/local-only configs clearly documented as not deployed to Cloud

#### Related Rules
- `AEMCS-SEC-001` (hardcoded credentials — often caused by missing env-specific config strategy)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/using-cloud-manager/environment-variables.html

---

### AEMCS-ARCH-004: Forbidden /libs Overlay Depth

- **Severity**: High
- **Description**: Overlaying internal AEM APIs below `/libs` deeper than 1 level is fragile and breaks on SDK upgrades. Cloud Service updates `/libs` frequently without notice.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/overlays/**
ui.apps/src/main/content/jcr_root/libs/**
```

#### Detect — Bad Pattern
- Any file under `jcr_root/libs/` (direct libs modification)
- Overlays of internal implementation classes (non-public API paths)
- Overlays of deeply nested `/libs/cq/`, `/libs/dam/`, `/libs/granite/` internals

#### Detect — Good Pattern
- Overlays limited to documented public APIs / extension points
- Use of `sling:resourceSuperType` for component inheritance instead of overlay
- Using Sling Resource Merger for selective property override

#### Bad Example
```
ui.apps/src/main/content/jcr_root/libs/dam/gui/coral/components/admin/contentrenderer/row/row.jsp
```

#### Good Example
```xml
<!-- Extending via sling:resourceSuperType instead of overlaying -->
<jcr:root
    jcr:primaryType="cq:Component"
    sling:resourceSuperType="core/wcm/components/image/v3/image"
    componentGroup="My Site"/>
```

#### False Positives
- Overlays explicitly documented as supported extension points by Adobe
- Overlays of `/libs/settings/` for supported customizations

#### Related Rules
- `AEMCS-ARCH-002` (Classic UI often requires deep overlays)

---

### AEMCS-ARCH-005: Missing Repoinit Configuration

- **Severity**: Medium
- **Description**: Service users, ACLs, and paths required by the application must be provisioned via repoinit scripts, not content packages. Cloud Service requires declarative provisioning.

#### Detect — Files to Scan
```
ui.config/src/main/content/jcr_root/apps/**/config/**/*.cfg.json
ui.apps/src/main/content/jcr_root/apps/**/config/**/*.config
```

#### Detect — Bad Pattern
- Service user nodes defined in content packages (`rep:SystemUser` in `.content.xml`)
- ACL entries defined in `_rep_policy.xml` within `ui.apps`
- Missing `org.apache.sling.jcr.repoinit.RepositoryInitializer` configs when service users exist in code

#### Detect — Good Pattern
```json
{
  "scripts": [
    "create service user mysite-service",
    "set ACL for mysite-service",
    "  allow jcr:read on /content/mysite",
    "end"
  ]
}
```

#### Bad Example
```xml
<!-- DO NOT define service users in content packages -->
<!-- ui.apps/src/main/content/jcr_root/home/users/system/mysite/.content.xml -->
<jcr:root jcr:primaryType="rep:SystemUser"/>
```

#### Good Example
```json
// org.apache.sling.jcr.repoinit.RepositoryInitializer-mysite.cfg.json
{
  "scripts": [
    "create service user mysite-service with path system/mysite",
    "create path (sling:Folder) /content/mysite",
    "set ACL for mysite-service",
    "  allow jcr:read,rep:write on /content/mysite",
    "  allow jcr:read on /content/dam/mysite",
    "end"
  ]
}
```

#### False Positives
- Test content packages containing user fixtures for integration tests
- Legacy content preserved only for reference/documentation

#### Related Rules
- `AEMCS-SEC-004` (service users without minimal permissions)
- `AEMCS-SLING-001` (resource resolver maps need matching service user)

---

## Sling/OSGi Rules

---

### AEMCS-SLING-001: Resource Resolver Leak

- **Severity**: Critical
- **Description**: Resource resolvers obtained from `ResourceResolverFactory` hold a JCR session. If not closed, they leak memory and database connections, eventually crashing the instance. This is the #1 source of AEM instance instability.

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
- `try (ResourceResolver resolver = ...)` (try-with-resources)
- `finally { if (resolver != null) resolver.close(); }`

#### Bad Example
```java
@Component(service = Servlet.class)
@SlingServletPaths("/bin/mysite/process")
public class ProcessServlet extends SlingSafeMethodsServlet {

    @Reference
    private ResourceResolverFactory resolverFactory;

    @Override
    protected void doGet(SlingHttpServletRequest request, SlingHttpServletResponse response) {
        Map<String, Object> authMap = Collections.singletonMap(
            ResourceResolverFactory.SUBSERVICE, "mysite-service");

        // BUG: resolver never closed if exception thrown after this line
        ResourceResolver resolver = resolverFactory.getServiceResourceResolver(authMap);

        Resource resource = resolver.getResource("/content/mysite/data");
        // ... process resource ...

        resolver.close(); // NOT SAFE — won't execute if exception thrown above
    }
}
```

#### Good Example
```java
@Component(service = Servlet.class)
@SlingServletPaths("/bin/mysite/process")
public class ProcessServlet extends SlingSafeMethodsServlet {

    @Reference
    private ResourceResolverFactory resolverFactory;

    @Override
    protected void doGet(SlingHttpServletRequest request, SlingHttpServletResponse response) {
        Map<String, Object> authMap = Collections.singletonMap(
            ResourceResolverFactory.SUBSERVICE, "mysite-service");

        try (ResourceResolver resolver = resolverFactory.getServiceResourceResolver(authMap)) {
            Resource resource = resolver.getResource("/content/mysite/data");
            // ... process resource ...
            // resolver auto-closed even if exception thrown
        } catch (LoginException e) {
            log.error("Failed to obtain service resolver", e);
        }
    }
}
```

#### False Positives
- Request-based resolver (`request.getResourceResolver()`) — this is managed by Sling, do NOT close it
- Resolver stored in a class implementing `Closeable`/`AutoCloseable` with proper lifecycle management
- Test code using mock resolvers

#### Related Rules
- `AEMCS-SLING-003` (JCR Session leak — same pattern, lower level API)
- `AEMCS-ARCH-005` (repoinit — service user must exist for resolver to work)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-learn/foundation/development/understand-sling-model-exporter.html

---

### AEMCS-SLING-002: Deprecated SlingServlet Annotation

- **Severity**: Medium
- **Description**: The `@SlingServlet` annotation from `org.apache.sling.servlets.annotations` is deprecated since AEM 6.5+. Must use standard OSGi DS `@Component` with the new Sling annotations.

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
@SlingServletResourceTypes|@SlingServletPaths|@SlingServletName
```

#### Bad Example
```java
import org.apache.sling.servlets.annotations.SlingServlet;

@SlingServlet(
    paths = "/bin/mysite/data",
    methods = "GET"
)
public class DataServlet extends SlingSafeMethodsServlet {
    // ...
}
```

#### Good Example
```java
import org.osgi.service.component.annotations.Component;
import org.apache.sling.servlets.annotations.SlingServletPaths;

@Component(service = Servlet.class)
@SlingServletPaths("/bin/mysite/data")
public class DataServlet extends SlingSafeMethodsServlet {
    // ...
}
```

#### False Positives
- None — this annotation is always deprecated regardless of context

#### Related Rules
- `AEMCS-SLING-004` (Felix SCR annotations — even older deprecated pattern)

---

### AEMCS-SLING-003: JCR Session Leak

- **Severity**: Critical
- **Description**: Direct JCR Session access creates sessions that must be explicitly logged out. Unlike ResourceResolver, sessions obtained via `repository.login()` or adapted from resolvers have no auto-close. Leaked sessions exhaust the connection pool.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
bundle/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
repository\s*\.\s*login\s*\((?!.*finally.*logout)
adaptTo\s*\(\s*Session\.class\s*\)(?!.*finally.*logout)
Session\s+\w+\s*=.*(?!try\s*\()
```

#### Detect — Good Pattern
- Session used within try-finally with `session.logout()` in finally
- Avoiding direct Session use entirely (using ResourceResolver API)

#### Bad Example
```java
public void processContent() throws RepositoryException {
    Session session = repository.login(new SimpleCredentials("admin", "admin".toCharArray()));
    Node node = session.getNode("/content/mysite/data");
    // ... process ...
    session.save();
    session.logout(); // UNSAFE — skipped if exception thrown before this line
}
```

#### Good Example
```java
public void processContent() throws RepositoryException {
    Session session = null;
    try {
        session = repository.login(new SimpleCredentials("admin", "admin".toCharArray()));
        Node node = session.getNode("/content/mysite/data");
        // ... process ...
        session.save();
    } finally {
        if (session != null && session.isLive()) {
            session.logout();
        }
    }
}

// BETTER: Avoid JCR Session entirely — use ResourceResolver API
public void processContentModern(ResourceResolverFactory factory) throws LoginException {
    try (ResourceResolver resolver = factory.getServiceResourceResolver(authMap)) {
        Resource resource = resolver.getResource("/content/mysite/data");
        ModifiableValueMap props = resource.adaptTo(ModifiableValueMap.class);
        props.put("processed", true);
        resolver.commit();
    }
}
```

#### False Positives
- Admin session in test harness with `@After` cleanup
- Session adapted from request resource resolver (managed by Sling)

#### Related Rules
- `AEMCS-SLING-001` (resource resolver leak — higher level equivalent)
- `AEMCS-SEC-001` (hardcoded credentials — `admin/admin` in session login)

---

### AEMCS-SLING-004: Deprecated Felix SCR Annotations

- **Severity**: Medium
- **Description**: Apache Felix SCR annotations (`org.apache.felix.scr.annotations.*`) are deprecated since AEM 6.2. Use standard OSGi Declarative Services (DS) annotations from `org.osgi.service.component.annotations`.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
bundle/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
import\s+org\.apache\.felix\.scr\.annotations\.\w+;
@Service|@Property|@Reference\s*\(\s*referenceInterface|@Activate.*protected void activate\(ComponentContext
```

#### Detect — Good Pattern
```regex
import\s+org\.osgi\.service\.component\.annotations\.\w+;
@Component|@Activate|@Deactivate|@Reference
```

#### Bad Example
```java
import org.apache.felix.scr.annotations.Component;
import org.apache.felix.scr.annotations.Service;
import org.apache.felix.scr.annotations.Reference;
import org.apache.felix.scr.annotations.Property;

@Component
@Service
public class MyServiceImpl implements MyService {
    @Reference
    private ResourceResolverFactory resolverFactory;

    @Property(name = "service.ranking", intValue = 100)
    private static final String PROP_RANKING = "service.ranking";
}
```

#### Good Example
```java
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(
    service = MyService.class,
    property = {
        "service.ranking:Integer=100"
    }
)
public class MyServiceImpl implements MyService {
    @Reference
    private ResourceResolverFactory resolverFactory;
}
```

#### False Positives
- Third-party dependencies that still use Felix annotations (not your code to fix)
- Generated code from older archetypes (needs archetype update, not manual fix)

#### Related Rules
- `AEMCS-SLING-002` (deprecated SlingServlet annotation)

---

### AEMCS-SLING-005: Missing Sling Model Adaptable Validation

- **Severity**: Medium
- **Description**: Sling Models should declare specific adaptables and validate injections. Using `@Model(adaptables = Resource.class)` when `SlingHttpServletRequest.class` is needed (or vice versa) causes null injections at runtime.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
- `@Model(adaptables = Resource.class)` with `@ScriptVariable`, `@RequestAttribute`, or request-scoped injections
- `@Model(adaptables = SlingHttpServletRequest.class)` used in contexts where only Resource is available
- Missing `defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL` without null checks

#### Detect — Good Pattern
- Adaptable matches the actual usage context
- `@Optional` on nullable fields or `OPTIONAL` strategy with null guards

#### Bad Example
```java
@Model(adaptables = Resource.class)  // BUG: ScriptVariable needs Request
public class HeaderModel {
    @ScriptVariable  // This requires SlingHttpServletRequest adaptable!
    private Page currentPage;

    @Inject
    private String title;  // Will NPE if property missing — no OPTIONAL strategy
}
```

#### Good Example
```java
@Model(
    adaptables = SlingHttpServletRequest.class,
    defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL
)
public class HeaderModel {
    @ScriptVariable
    private Page currentPage;

    @ValueMapValue
    private String title;  // Safe — OPTIONAL strategy means null instead of exception

    public String getDisplayTitle() {
        return title != null ? title : currentPage.getTitle();
    }
}
```

#### False Positives
- Models only using `@ValueMapValue` / `@ChildResource` with `Resource.class` adaptable (correct)
- Models with `@PostConstruct` that handle null gracefully

#### Related Rules
- `AEMCS-PERF-003` (Sling Model caching)

---

## Performance Rules

---

### AEMCS-PERF-001: Missing Async Processing for Heavy Operations

- **Severity**: High
- **Description**: Synchronous execution of long-running tasks (external API calls, file processing, bulk operations) in request threads blocks Sling's thread pool. With Cloud Service's auto-scaling but limited thread pools, this degrades all users.

#### Detect — Files to Scan
```
core/src/main/java/**/*Servlet*.java
core/src/main/java/**/*Filter*.java
core/src/main/java/**/*Workflow*.java
```

#### Detect — Bad Pattern
- HTTP client calls (`HttpClient`, `URL.openConnection`, `RestTemplate`) inside `doGet`/`doPost`
- `Thread.sleep()` in request-handling code
- Large loops processing 100+ items synchronously in servlet context
- `session.save()` on large change sets (1000+ nodes) in request thread

#### Detect — Good Pattern
- `JobManager.addJob()` for background processing
- `@Async` event handlers
- Sling Jobs with topic-based routing
- Workflow steps for long-running operations

#### Bad Example
```java
@Override
protected void doPost(SlingHttpServletRequest request, SlingHttpServletResponse response) {
    String[] paths = request.getParameterValues("path");

    // BAD: Processing 500 assets synchronously in request thread
    for (String path : paths) {
        Resource asset = request.getResourceResolver().getResource(path);
        // External API call per asset — 200ms each × 500 = 100 seconds blocking
        externalService.processAsset(asset.getPath());
        Thread.sleep(100); // Rate limiting in request thread!
    }

    response.getWriter().write("Done");
}
```

#### Good Example
```java
@Override
protected void doPost(SlingHttpServletRequest request, SlingHttpServletResponse response) {
    String[] paths = request.getParameterValues("path");

    // Submit async job
    Map<String, Object> props = new HashMap<>();
    props.put("paths", paths);
    props.put("userId", request.getResourceResolver().getUserID());

    Job job = jobManager.addJob("mysite/asset/process", props);

    response.setStatus(HttpServletResponse.SC_ACCEPTED);
    response.getWriter().write("{\"jobId\":\"" + job.getId() + "\"}");
}

// Separate job consumer class
@Component(
    service = JobConsumer.class,
    property = { JobConsumer.PROPERTY_TOPICS + "=mysite/asset/process" }
)
public class AssetProcessJobConsumer implements JobConsumer {
    @Override
    public JobResult process(Job job) {
        String[] paths = (String[]) job.getProperty("paths");
        for (String path : paths) {
            externalService.processAsset(path);
        }
        return JobResult.OK;
    }
}
```

#### False Positives
- Single quick API call (< 500ms) that's acceptable inline
- Operations behind admin-only endpoints with known low concurrency
- Workflow process steps (already async by nature)

#### Related Rules
- `AEMCS-PERF-002` (unbounded queries — often combined with sync processing)

---

### AEMCS-PERF-002: Unbounded Query Results

- **Severity**: High
- **Description**: Queries without limits in AEM can return millions of results, causing OOM errors and index traversal warnings. Cloud Service has strict traversal limits (100K nodes) and will kill queries exceeding them.

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
//element\s*\(.*\)(?!.*\[@.*\])  # XPath without predicates
```

#### Detect — Good Pattern
- `query.setLimit(offset, limit)` always present
- `p.limit` parameter in QueryBuilder maps
- `LIMIT` clause in JCR-SQL2 queries
- `guessTotal=true` for pagination

#### Bad Example
```java
// No limit — could return 1M+ results
Map<String, String> queryMap = new HashMap<>();
queryMap.put("path", "/content/dam");
queryMap.put("type", "dam:Asset");
queryMap.put("property", "jcr:content/metadata/dc:format");
queryMap.put("property.value", "image/jpeg");

Query query = queryBuilder.createQuery(PredicateGroup.create(queryMap), session);
SearchResult result = query.getResult();
List<Hit> hits = result.getHits(); // Loads ALL jpeg assets in DAM into memory
```

#### Good Example
```java
Map<String, String> queryMap = new HashMap<>();
queryMap.put("path", "/content/dam/mysite");
queryMap.put("type", "dam:Asset");
queryMap.put("property", "jcr:content/metadata/dc:format");
queryMap.put("property.value", "image/jpeg");
queryMap.put("p.limit", "100");          // Explicit limit
queryMap.put("p.offset", "0");           // Pagination support
queryMap.put("p.guessTotal", "true");    // Efficient total count

Query query = queryBuilder.createQuery(PredicateGroup.create(queryMap), session);
SearchResult result = query.getResult();
```

#### False Positives
- Queries with very specific path + property predicates that can't exceed ~100 results by nature
- Migration/maintenance scripts running outside request context with intentional full traversal
- Queries using `p.limit=-1` with documented justification and monitoring

#### Related Rules
- `AEMCS-PERF-001` (heavy operations — unbounded queries often part of sync processing)
- `AEMCS-CLOUD-003` (Oak index — missing index causes traversal even with limits)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/operations/query-and-indexing-best-practices.html

---

### AEMCS-PERF-003: Missing Sling Model Caching

- **Severity**: Medium
- **Description**: Sling Models with expensive `@PostConstruct` logic execute on every adaptation. Without caching, the same computation repeats per request when the model is adapted multiple times (e.g., from HTL include + data-sly-use).

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
- `@PostConstruct` with external service calls, complex calculations, or tree traversals
- Same model adapted in multiple HTL files without request-level caching
- Recursive `Resource` tree walking in `@PostConstruct`

#### Detect — Good Pattern
- Lazy initialization (compute on first `getter` call, cache in field)
- Request-scoped caching via `SlingBindings` or request attributes
- `@Self @Via` delegation for composition without re-computation

#### Bad Example
```java
@Model(adaptables = SlingHttpServletRequest.class)
public class NavigationModel {
    @PostConstruct
    protected void init() {
        // EXPENSIVE: Traverses entire content tree on every adaptation
        this.navItems = buildNavigationTree(rootPage, 4);
        // Calls external search service
        this.popularPages = searchService.getPopularPages(sitePath);
    }
}
```

#### Good Example
```java
@Model(adaptables = SlingHttpServletRequest.class)
public class NavigationModel {
    private List<NavItem> navItems;

    @SlingObject
    private SlingHttpServletRequest request;

    public List<NavItem> getNavItems() {
        if (navItems == null) {
            // Check request-level cache first
            navItems = (List<NavItem>) request.getAttribute("nav-items-cache");
            if (navItems == null) {
                navItems = buildNavigationTree(rootPage, 4);
                request.setAttribute("nav-items-cache", navItems);
            }
        }
        return navItems;
    }
}
```

#### False Positives
- Models with cheap `@PostConstruct` (simple property reads, no external calls)
- Models used exactly once per request (no duplicate adaptation)

#### Related Rules
- `AEMCS-SLING-005` (Sling Model adaptable validation)

---

### AEMCS-PERF-004: Excessive Client Library Size

- **Severity**: Medium
- **Description**: Client libraries exceeding 100KB (uncompressed JS) or including unused code degrade page load. Cloud Service CDN helps but large payloads still impact Time-to-Interactive.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**
ui.frontend/src/**
```

#### Detect — Bad Pattern
- Single clientlib JS file > 100KB
- jQuery included when not necessary (modern AEM uses vanilla JS / Coral UI)
- Full library imports (`import _ from 'lodash'`) instead of cherry-picking
- Multiple clientlibs with overlapping dependencies (duplicated code)

#### Detect — Good Pattern
- Code splitting by component/page type
- Tree-shaking via webpack/vite in `ui.frontend`
- `async`/`defer` loading for non-critical clientlibs
- `js.txt` / `css.txt` with minimal required files

#### Bad Example
```
# js.txt — loading everything
jquery.min.js
lodash.full.js
moment-with-locales.js
app.js
components/header.js
components/footer.js
components/carousel.js
...50 more component files...
```

#### Good Example
```
# js.txt — minimal core
app.js

# Additional clientlibs per category loaded conditionally
# clientlib-header (category: mysite.header) — loaded only on pages with header
# clientlib-carousel (category: mysite.carousel) — loaded via data-sly-use on carousel component
```

#### False Positives
- Admin/authoring clientlibs (loaded only in edit mode, not impacting end users)
- Build-tool generated bundles that are already tree-shaken (check if minified size is reasonable)

---

### AEMCS-PERF-005: Missing `allowProxy` on Client Libraries

- **Severity**: High
- **Description**: Client libraries under `/apps` must declare `allowProxy="{Boolean}true"` to be served through the `/etc.clientlibs` Dispatcher-safe proxy path. Cloud Service's Dispatcher blocks all direct `/apps` requests; without `allowProxy`, clientlibs return 404 in production even though they load fine on the local SDK.

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
- Every `cq:ClientLibraryFolder` node under `/apps` has `allowProxy="{Boolean}true"`
- Page templates reference clientlibs via `/etc.clientlibs/` URLs (not `/apps/`)

#### Bad Example
```xml
<!-- ui.apps/.../clientlibs/mysite/.content.xml — will 404 in production -->
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:ClientLibraryFolder"
    categories="[mysite.base]"
    dependencies="[granite.jquery]"/>
```

#### Good Example
```xml
<!-- allowProxy routes requests through /etc.clientlibs/ — safe through Dispatcher -->
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:ClientLibraryFolder"
    allowProxy="{Boolean}true"
    categories="[mysite.base]"
    dependencies="[granite.jquery]"/>
```

#### False Positives
- Clientlibs under `/etc/clientlibs/` (not under `/apps` — no proxy needed)
- Authoring-only clientlibs loaded in edit context inside the AEM UI (not served through Dispatcher to end users)

#### Related Rules
- `AEMCS-PERF-004` (clientlib size — pair with allowProxy check when reviewing clientlibs)
- `AEMCS-SEC-002` (Dispatcher rules — `/etc.clientlibs/*` allow rule must be present)

---

### AEMCS-PERF-006: Render-Blocking Client Library Loading

- **Severity**: Medium
- **Description**: JavaScript clientlibs included in the `<head>` without `defer` or `async` block HTML parsing and delay First Contentful Paint (FCP). Cloud Service measures Core Web Vitals; render-blocking resources directly lower Lighthouse scores and affect CDN caching strategy signals.

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
- `<script src="...">` (non-module, no defer/async) in page component head HTL
- `clientlib.all` loaded in `<head>` without a deferred loading strategy

#### Detect — Good Pattern
- JS clientlibs loaded with `loading='defer'` or placed immediately before `</body>`
- Critical CSS inlined only for above-the-fold styles; remaining CSS loaded asynchronously
- `<link rel="preload">` for key resources combined with deferred full load

#### Bad Example
```html
<!-- page/customheaderlibs.html — render-blocking JS in <head> -->
<head>
    <sly data-sly-call="${clientlib.css @ categories='mysite.all'}"/>
    <sly data-sly-call="${clientlib.js  @ categories='mysite.all'}"/>
    <!-- JS blocks parsing of everything after it -->
</head>
```

#### Good Example
```html
<!-- CSS in <head> (render-critical), JS deferred -->
<head>
    <sly data-sly-call="${clientlib.css @ categories='mysite.all'}"/>
</head>
<body>
    <!-- page content -->
    <sly data-sly-call="${clientlib.js @ categories='mysite.all', loading='defer'}"/>
</body>
```

#### False Positives
- Small inline scripts that set global config vars before DOM parse (must be genuinely tiny and justified)
- Third-party tag manager snippets that contractually require synchronous `<head>` loading

#### Related Rules
- `AEMCS-PERF-004` (clientlib size — large bundles make render-blocking worse)
- `AEMCS-PERF-007` (inline scripts — related anti-pattern)

---

### AEMCS-PERF-007: Inline Scripts and Styles in HTL Components

- **Severity**: Medium
- **Description**: `<style>` blocks and `<script>` blocks embedded directly in HTL component markup are not cached by the CDN or browser, inflate per-request HTML payload, and require `unsafe-inline` in Content Security Policy (CSP) — a significant XSS risk. Cloud Service CDN caches HTML aggressively; inline dynamic styles break cache efficacy.

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
- Component-specific styles compiled into a category clientlib loaded only on pages using that component
- Dynamic values passed via `data-*` attributes; clientlib JS reads them
- Structured data (`application/ld+json`) is the only acceptable inline `<script>` type

#### Bad Example
```html
<!-- hero.html — inline style with dynamic value, not CDN-cacheable -->
<style>
    .hero-${properties.variantClass} {
        background-image: url('${properties.bgImage @ context="uri"}');
    }
</style>

<!-- Inline config script — forces CSP unsafe-inline -->
<script>
    window.siteConfig = { theme: '${properties.theme}', locale: '${currentPage.language}' };
</script>
```

#### Good Example
```html
<!-- Pass dynamic values via data attributes; no inline scripts/styles needed -->
<div class="hero hero--${properties.variantClass @ context='attribute'}"
     data-bg="${properties.bgImage @ context='uri'}"
     data-theme="${properties.theme @ context='attribute'}"
     data-locale="${currentPage.language}">
    <!-- clientlib JS reads data-* and applies styles -->
</div>

<!-- Structured data is the only valid inline script -->
<script type="application/ld+json">${component.jsonLd @ context='unsafe'}</script>
```

#### False Positives
- `application/ld+json` structured data scripts (search engine metadata, not executable)
- AEM component development overlays in `/libs` that are read-only

#### Related Rules
- `AEMCS-PERF-006` (render-blocking loading — inline scripts compound the problem)
- `AEMCS-SEC-003` (XSS — `context='unsafe'` required for inline HTML violates CSP)

---

### AEMCS-PERF-008: Client Library Category Proliferation

- **Severity**: Medium
- **Description**: Defining more than ~8 distinct clientlib categories all loaded on every page creates unnecessary HTTP round-trips (significant pre-HTTP/2) and inflates cache key complexity. The pattern also makes dependency auditing harder and commonly leads to duplicate library code across categories.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/.content.xml
ui.frontend/src/**
```

#### Detect — Bad Pattern
- More than 8 `cq:ClientLibraryFolder` nodes each with a unique category, all embedded unconditionally in the page template head
- `data-sly-call="${clientlib.css @ categories=['c1','c2','c3','c4','c5','c6','c7','c8','c9']}"` — 9+ explicit categories per page
- Each component has its own category loaded globally instead of conditionally

#### Detect — Good Pattern
- `mysite.base` — single bundle with all code required on every page
- Component-specific categories (`mysite.carousel`, `mysite.form`) loaded only by the component's HTL via `data-sly-use` or template policy clientlibs
- `ui.frontend` webpack build consolidates entry points into ≤ 3 output bundles per page type

#### Bad Example
```
# Page template loads ALL of these unconditionally — 9 separate requests
mysite.header, mysite.footer, mysite.nav, mysite.hero,
mysite.teaser, mysite.carousel, mysite.form, mysite.search, mysite.utility
```

#### Good Example
```
# Page template loads only the base bundle
mysite.base          ← compiled from ui.frontend webpack, all shared code

# Each component's .content.xml declares its own category:
#   carousel/.content.xml  → categories="[mysite.carousel]"
# AEM policy editor adds mysite.carousel to pages that use carousel — on demand only
```

#### False Positives
- Sites with genuinely distinct page types (home, article, product) each loading a type-specific bundle — per-page-type bundles are correct code splitting, not proliferation

#### Related Rules
- `AEMCS-PERF-004` (clientlib size — proliferation and large size often co-occur)
- `AEMCS-PERF-006` (render-blocking — more categories = more blocking requests)

---

## Security Rules

---

### AEMCS-SEC-001: Hardcoded Credentials

- **Severity**: Critical
- **Description**: Credentials, API keys, tokens, and secrets must never appear in source code. Cloud Service provides Cloud Manager environment variables and Adobe I/O credential vault for runtime secrets.

#### Detect — Files to Scan
```
**/*.java
**/*.cfg.json
**/*.config
**/*.xml
**/*.properties
**/*.yaml
**/*.json
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
- `System.getenv("API_KEY")` or OSGi config with `$[env:VAR_NAME]`
- `@SecretVariable` or Cloud Manager secret references
- `$[env:SECRET_KEY;default=]` in OSGi configs

#### Bad Example
```java
private static final String API_KEY = "sk-1234567890abcdef1234567890abcdef";
private static final String DB_PASSWORD = "P@ssw0rd!2024";

HttpPost post = new HttpPost(endpoint);
post.setHeader("Authorization", "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...");
```

```json
// org.apache.sling.commons.crypto.internal.FilePasswordProvider.cfg.json
{
  "passwords": ["mysecretpassword123"]
}
```

#### Good Example
```java
@Activate
protected void activate(Config config) {
    this.apiKey = config.api_key(); // Injected from OSGi config
}

// OSGi config using Cloud Manager env var
// org.mysite.service.ApiConfig.cfg.json
{
  "api.key": "$[env:MYSITE_API_KEY]",
  "api.secret": "$[secret:MYSITE_API_SECRET]"
}
```

#### False Positives
- Test fixtures with clearly fake credentials (`test`, `password123` in test code)
- Documented placeholder values (`YOUR_API_KEY_HERE`, `changeme`)
- Public keys (not secrets — only private keys are violations)
- Maven property references (`${project.version}`) that look like template vars

#### Related Rules
- `AEMCS-ARCH-003` (custom runmodes — often used to separate secrets per environment incorrectly)
- `AEMCS-SEC-002` (dispatcher — exposed admin may compound credential issues)

---

### AEMCS-SEC-002: Missing Dispatcher Security Rules

- **Severity**: High
- **Description**: The Dispatcher must block access to sensitive AEM endpoints. Cloud Service dispatcher is the first defense layer. Missing deny rules expose admin consoles, debugging endpoints, and internal APIs.

#### Detect — Files to Scan
```
dispatcher/src/conf.dispatcher.d/filters/**/*.any
dispatcher/src/conf.d/**/*.conf
dispatcher/src/conf.dispatcher.d/**/*.any
```

#### Detect — Bad Pattern
- No deny rules for `/crx`, `/system/console`, `/bin/crxde`, `/libs/granite/security`
- `/glob "*"` allow without subsequent specific denies
- Missing CSRF filter configuration
- Allowing `.json`, `.xml` selectors on content paths without restriction

#### Detect — Good Pattern
```
/0001 { /type "deny" /url "/crx/*" }
/0002 { /type "deny" /url "/system/*" }
/0003 { /type "deny" /url "/bin/crxde*" }
/0004 { /type "deny" /url "/apps/*/config/*" }
/0005 { /type "deny" /url "*.infinity.json" }
/0006 { /type "deny" /url "*.tidy.json" }
/0007 { /type "deny" /url "*.sysview.xml" }
/0008 { /type "deny" /url "*.docview.xml" }
```

#### Bad Example
```
# filters.any — too permissive
/0001 { /type "allow" /glob "*" }
# Missing all deny rules for sensitive endpoints!
```

#### Good Example
```
# filters.any — defense in depth
/0001 { /type "deny"  /url "*" }

# Allow only content paths
/0010 { /type "allow" /url "/content/*" }
/0011 { /type "allow" /url "/etc.clientlibs/*" }
/0012 { /type "allow" /url "/libs/granite/csrf/token.json" method="GET" }

# Explicit deny for sensitive paths (defense-in-depth even with deny-all default)
/0100 { /type "deny" /url "/crx/*" }
/0101 { /type "deny" /url "/system/*" }
/0102 { /type "deny" /url "/admin/*" }
/0103 { /type "deny" /url "/bin/*" }
/0104 { /type "deny" /url "*.infinity.json" }
/0105 { /type "deny" /url "*.tidy.*" }
/0106 { /type "deny" /url "*.query.json" }
```

#### False Positives
- Author dispatcher (some admin endpoints are intentionally accessible to authenticated users)
- Custom `/bin/` servlets that are legitimately public (should still be explicitly allowed by path, not wildcard)

#### Related Rules
- `AEMCS-SEC-001` (hardcoded credentials compound dispatcher misconfiguration risk)
- `AEMCS-SEC-003` (XSS — dispatcher is one layer, output encoding is another)

---

### AEMCS-SEC-003: XSS in HTL/Sightly

- **Severity**: High
- **Description**: HTL's display contexts control output encoding. Using `context='unsafe'` or `context='html'` with user-controllable content enables Cross-Site Scripting (XSS). The default context is `text` (safe), but explicit unsafe contexts override this.

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
data-sly-attribute.*=.*\$\{.*@\s*context\s*=\s*'uri'\s*\}.*(?:request|param)
```

#### Detect — Good Pattern
- Default context (no explicit context = `text`, auto-escaped)
- `${properties.title}` (auto text context)
- `${properties.link @ context='uri'}` for known-safe authored URLs
- `data-sly-attribute.href="${link @ context='uri'}"` for authored links

#### Bad Example
```html
<!-- XSS: User content rendered without encoding -->
<div>${properties.description @ context='unsafe'}</div>

<!-- XSS: Request parameter reflected directly -->
<h1>${request.requestParameterMap['q'][0].string @ context='html'}</h1>

<!-- XSS: JavaScript context with user data -->
<script>var name = '${properties.authorName @ context='scriptString'}';</script>
```

#### Good Example
```html
<!-- Safe: Default text context auto-encodes HTML entities -->
<div>${properties.description}</div>

<!-- Safe: Explicit safe contexts -->
<a href="${properties.linkURL @ context='uri'}">
    ${properties.linkText @ context='text'}
</a>

<!-- Safe: Rich text from RTE with allowlisted HTML (still sanitized by RTE storage) -->
<div data-sly-resource="${'content' @ resourceType='core/wcm/components/text/v2/text'}"></div>
```

#### False Positives
- `context='html'` used with content from the Rich Text Editor (RTE already sanitizes on save)
- `context='unsafe'` in a component only used by admins (still bad practice but lower risk)
- Template fragments where the context is safe by design (e.g., reading from a safe tag property)

#### Related Rules
- `AEMCS-SEC-002` (dispatcher can add CSP headers as additional XSS defense)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-htl/content/specification.html

---

### AEMCS-SEC-004: Insufficient Service User Permissions

- **Severity**: High
- **Description**: Service users should follow least-privilege principle. Overly broad permissions (e.g., `jcr:all` on `/`) create privilege escalation risks if the code is exploited.

#### Detect — Files to Scan
```
ui.config/src/main/content/jcr_root/apps/**/config/**/org.apache.sling.jcr.repoinit.RepositoryInitializer*.cfg.json
ui.config/src/main/content/jcr_root/apps/**/config/**/*.config
```

#### Detect — Bad Pattern
```regex
allow\s+jcr:all\s+on\s+/(?!content/specific-site)
allow\s+.*\s+on\s+/\s*$
allow\s+rep:write\s+on\s+/content\s*$
```

#### Detect — Good Pattern
- Permissions scoped to specific subtree: `allow jcr:read on /content/mysite/en`
- Minimal required privileges: `jcr:read` not `jcr:all`
- Deny rules for sensitive subtrees even within allowed paths

#### Bad Example
```json
{
  "scripts": [
    "create service user mysite-service",
    "set ACL for mysite-service",
    "  allow jcr:all on /",
    "end"
  ]
}
```

#### Good Example
```json
{
  "scripts": [
    "create service user mysite-service with path system/mysite",
    "set ACL for mysite-service",
    "  allow jcr:read on /content/mysite",
    "  allow jcr:read,rep:write on /content/mysite/data",
    "  allow jcr:read on /content/dam/mysite",
    "  deny jcr:all on /content/mysite/data/sensitive",
    "end"
  ]
}
```

#### False Positives
- Migration scripts with intentionally broad permissions (should be one-time use with removal)
- Test/dev-only configurations (check if scoped to `config.author.dev`)

#### Related Rules
- `AEMCS-ARCH-005` (repoinit — proper service user provisioning)
- `AEMCS-SLING-001` (resource resolver — using the service user)

---

## Cloud Readiness Rules

---

### AEMCS-CLOUD-001: Local Filesystem Access

- **Severity**: Critical
- **Description**: AEM Cloud Service runs on ephemeral containers with a read-only filesystem. Local file I/O (`new File()`, `FileWriter`, etc.) will fail at runtime. Only `/tmp` is writable but is cleared on restart and not shared across instances.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
bundle/src/main/java/**/*.java
!**/test/**
```

#### Detect — Bad Pattern
```regex
new\s+File\s*\(\s*["'/](?!/tmp)
new\s+FileOutputStream\s*\(
new\s+FileWriter\s*\(
new\s+FileInputStream\s*\(\s*["'/](?!/tmp)
Files\.(write|newOutputStream|createFile)\s*\(\s*Paths\.get\s*\(\s*["'/](?!/tmp)
```

#### Detect — Good Pattern
- `resourceResolver.getResource("/content/dam/...")` for reading assets
- `assetManager.createAsset(...)` for writing binary content
- `/tmp` usage with explicit cleanup and no persistence assumption
- External storage (Azure Blob, S3 via Cloud Manager)

#### Bad Example
```java
// FAILS in Cloud Service — filesystem is read-only
File configFile = new File("/opt/aem/config/custom.properties");
Properties props = new Properties();
props.load(new FileInputStream(configFile));

// FAILS — can't write to local filesystem
File exportFile = new File("/var/data/export.csv");
try (FileWriter writer = new FileWriter(exportFile)) {
    writer.write(csvContent);
}
```

#### Good Example
```java
// Read config from OSGi configuration
@Activate
protected void activate(Config config) {
    this.maxRetries = config.max_retries();
}

// Write binary content to DAM
try (ResourceResolver resolver = factory.getServiceResourceResolver(authMap)) {
    AssetManager assetManager = resolver.adaptTo(AssetManager.class);
    assetManager.createAsset(
        "/content/dam/mysite/exports/report.csv",
        new ByteArrayInputStream(csvContent.getBytes()),
        "text/csv", true);
}

// Temporary processing (OK but volatile)
Path tempFile = Files.createTempFile("process-", ".tmp");
try {
    // process...
} finally {
    Files.deleteIfExists(tempFile);
}
```

#### False Positives
- `/tmp` usage with proper cleanup (acceptable for temporary processing)
- `File` references in test code
- File path construction for logging/display purposes (not actual I/O)

#### Related Rules
- `AEMCS-CLOUD-002` (install hooks — another deployment-time filesystem concern)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-learn/cloud-service/migration/moving-to-aem-as-a-cloud-service.html

---

### AEMCS-CLOUD-002: Custom Install Hooks

- **Severity**: High
- **Description**: Vault install hooks are restricted in Cloud Service due to the immutable deployment model. Custom install hooks in content packages are silently skipped, causing missing post-install setup.

#### Detect — Files to Scan
```
**/META-INF/vault/properties.xml
**/META-INF/vault/filter.xml
**/META-INF/vault/hooks/**
```

#### Detect — Bad Pattern
- `META-INF/vault/hooks/` directory with Java classes
- `properties.xml` with `installhook.*` properties
- `filter.xml` with cleanup/import modes depending on hooks

#### Detect — Good Pattern
- Repoinit scripts for path/ACL setup
- Sling Content Distribution for content sync
- Cloud Manager pipeline hooks for pre/post-deploy actions

#### Bad Example
```xml
<!-- properties.xml -->
<entry key="installhook.mysite.class">com.mysite.hooks.ContentMigrationHook</entry>
```

#### Good Example
```json
// Repoinit replaces install hooks for ACL/path setup
// org.apache.sling.jcr.repoinit.RepositoryInitializer-mysite.cfg.json
{
  "scripts": [
    "create path (sling:Folder) /content/mysite/generated",
    "set ACL for mysite-service",
    "  allow jcr:all on /content/mysite/generated",
    "end"
  ]
}
```

#### False Positives
- Install hooks in packages not deployed to Cloud Service (on-premise only packages)
- Test content packages with hooks for local setup

---

### AEMCS-CLOUD-003: Oak Index Definition Issues

- **Severity**: High
- **Description**: Custom Oak indexes in Cloud Service must use `compatVersion=2`, async indexing, and follow strict naming/placement conventions. Incorrect index definitions cause deployment failures or silent query performance degradation.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/_oak_index/**/.content.xml
ui.apps/src/main/content/jcr_root/oak:index/**/.content.xml
```

#### Detect — Bad Pattern
- Missing `compatVersion` property or `compatVersion=1`
- Missing `async` property (defaults to sync — not allowed in Cloud)
- Index type `type="ordered"` (deprecated)
- Index defined outside `_oak_index` convention
- Missing `includedPaths` / `queryPaths` (too broad)

#### Detect — Good Pattern
```xml
compatVersion="{Long}2"
async="[async, nrt]"
type="lucene"
includedPaths="[/content/mysite]"
```

#### Bad Example
```xml
<oak:index jcr:primaryType="nt:unstructured">
    <mysite-content
        jcr:primaryType="oak:QueryIndexDefinition"
        type="lucene"
        compatVersion="{Long}1"
        evaluatePathRestrictions="{Boolean}true">
        <!-- Missing async property — will fail in Cloud Service -->
        <!-- Missing includedPaths — indexes everything -->
        <indexRules jcr:primaryType="nt:unstructured">
            <nt:base jcr:primaryType="nt:unstructured">
                <properties jcr:primaryType="nt:unstructured">
                    <title name="jcr:content/jcr:title" propertyIndex="{Boolean}true"/>
                </properties>
            </nt:base>
        </indexRules>
    </mysite-content>
</oak:index>
```

#### Good Example
```xml
<_oak_index jcr:primaryType="nt:unstructured">
    <mysite-content
        jcr:primaryType="oak:QueryIndexDefinition"
        type="lucene"
        compatVersion="{Long}2"
        async="[async, nrt]"
        evaluatePathRestrictions="{Boolean}true"
        includedPaths="[/content/mysite]"
        queryPaths="[/content/mysite]"
        tags="[visualSimilaritySearch]">
        <indexRules jcr:primaryType="nt:unstructured">
            <dam:Asset jcr:primaryType="nt:unstructured">
                <properties jcr:primaryType="nt:unstructured">
                    <title
                        name="jcr:content/metadata/dc:title"
                        propertyIndex="{Boolean}true"
                        analyzed="{Boolean}true"/>
                </properties>
            </dam:Asset>
        </indexRules>
    </mysite-content>
</_oak_index>
```

#### False Positives
- Index definitions managed by Cloud Manager's blue-green deployment (auto-migrated)
- Indexes generated by `aem-sdk-api` archetype (usually correct)

#### Related Rules
- `AEMCS-PERF-002` (unbounded queries — proper indexes mitigate this)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/operations/indexing.html

---

### AEMCS-CLOUD-004: Scheduled Tasks Without Leader Election

- **Severity**: High
- **Description**: Cloud Service runs multiple instances. Scheduled tasks (Sling Scheduler) run on ALL instances unless restricted with `scheduler.runOn=LEADER`. Duplicate execution causes data corruption and duplicate external calls.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
ui.config/src/main/content/jcr_root/apps/**/config/**/*scheduler*
ui.config/src/main/content/jcr_root/apps/**/config/**/*Scheduler*
```

#### Detect — Bad Pattern
```regex
@Scheduled|scheduler\.expression|scheduler\.period(?!.*scheduler\.runOn)
@Component.*property.*scheduler\.(expression|period)(?!.*LEADER|SINGLE)
```

#### Detect — Good Pattern
- `scheduler.runOn = "LEADER"` in component properties
- `scheduler.runOn = "SINGLE"` for cluster-wide singleton
- Using Sling Jobs instead (auto-distributed, single execution)

#### Bad Example
```java
@Component(
    service = Runnable.class,
    property = {
        "scheduler.expression=0 0 * * * ?",  // Every hour
        "scheduler.concurrent:Boolean=false"
        // MISSING: scheduler.runOn=LEADER — runs on ALL instances!
    }
)
public class DataSyncTask implements Runnable {

---

## Code Quality Rules

---

### AEMCS-CQ-001: Using printStackTrace() Instead of Logger

- **Severity**: High
- **Description**: Using `e.printStackTrace()` writes to System.err which isn't captured by AEM's log aggregation. Use SLF4J Logger instead for Cloud Service log monitoring via Cloud Manager.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
\.printStackTrace\s*\(
```

#### Detect — Good Pattern
- `LOG.error("Error message", e);`
- `log.error("Something failed for resource {}", path, e);`

#### Bad Example
```java
try {
    resource.adaptTo(Node.class).getProperty("title");
} catch (Exception e) {
    e.printStackTrace();  // Lost in Cloud Service — not in log aggregation
}
```

#### Good Example
```java
private static final Logger LOG = LoggerFactory.getLogger(MyClass.class);

try {
    resource.adaptTo(Node.class).getProperty("title");
} catch (RepositoryException e) {
    LOG.error("Failed to read title from {}", resource.getPath(), e);
}
```

#### False Positives
- Test classes using `printStackTrace()` for debugging (acceptable in tests)

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/developing/logging.html

---

### AEMCS-CQ-002: System.out.println in Production Code

- **Severity**: High
- **Description**: `System.out.println` bypasses AEM's logging framework. In Cloud Service, stdout is not reliably aggregated. Use SLF4J Logger for all output.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
System\.(out|err)\.(println|print|printf)\s*\(
```

#### Detect — Good Pattern
- `LOG.info("message");`
- `LOG.debug("value: {}", value);`

#### Bad Example
```java
public void activate() {
    System.out.println("Service activated");  // Not in Cloud Manager logs
}
```

#### Good Example
```java
private static final Logger LOG = LoggerFactory.getLogger(MyService.class);

public void activate() {
    LOG.info("Service activated");
}
```

#### False Positives
- Test classes using System.out for test output

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/developing/logging.html

---

### AEMCS-CQ-003: Empty Catch Block (Error Silently Ignored)

- **Severity**: Critical
- **Description**: Empty catch blocks swallow exceptions silently. Errors become invisible, making debugging impossible in Cloud Service where you can't attach a debugger.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
catch\s*\([^)]+\)\s*\{\s*\}
```

#### Detect — Good Pattern
- `catch (Exception e) { LOG.error("msg", e); }`
- `catch (Exception e) { /* intentionally ignored - fallback below */ }`

#### Bad Example
```java
try {
    session.save();
} catch (RepositoryException e) {
}  // Silent failure — data loss with no evidence
```

#### Good Example
```java
try {
    session.save();
} catch (RepositoryException e) {
    LOG.error("Failed to save session for path {}", path, e);
    throw new ServiceException("Save failed", e);
}
```

#### False Positives
- Catch blocks with intentional comments explaining why they're empty

---

### AEMCS-CQ-004: Catching Generic Exception

- **Severity**: Medium
- **Description**: Catching `Exception` or `Throwable` masks the specific error type. Catch specific exceptions (RepositoryException, LoginException, etc.) to handle each case properly.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
catch\s*\(\s*(Exception|Throwable|RuntimeException)\s+\w+\s*\)
```

#### Detect — Good Pattern
- `catch (RepositoryException e)`
- `catch (LoginException | PersistenceException e)`

#### Bad Example
```java
try {
    resolver.getResource(path).adaptTo(Page.class);
} catch (Exception e) {  // Catches NPE, ClassCast, everything
    LOG.error("Error", e);
}
```

#### Good Example
```java
try {
    Resource resource = resolver.getResource(path);
    if (resource != null) {
        Page page = resource.adaptTo(Page.class);
    }
} catch (SlingException e) {
    LOG.error("Sling error for path {}", path, e);
}
```

#### False Positives
- Servlet `doGet`/`doPost` methods that must catch Exception at the boundary
- Test classes with broad catches
- Classes with explicit comment explaining the broad catch

---

### AEMCS-CQ-005: WCMUsePojo (Deprecated — Use Sling Models)

- **Severity**: High
- **Description**: `WCMUsePojo` is the legacy Java Use-API for HTL. It lacks proper dependency injection, is harder to unit test, and ties code to the request lifecycle. Use Sling Models with `@Model` annotation instead.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
extends\s+WCMUsePojo
```

#### Detect — Good Pattern
- `@Model(adaptables = Resource.class)`
- `@Model(adaptables = SlingHttpServletRequest.class)`

#### Bad Example
```java
public class HeroComponent extends WCMUsePojo {
    private String title;
    @Override
    public void activate() throws Exception {
        title = getProperties().get("jcr:title", String.class);
    }
}
```

#### Good Example
```java
@Model(adaptables = Resource.class, defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL)
public class HeroComponent {
    @ValueMapValue
    private String title;
}
```

#### References
- https://experienceleague.adobe.com/docs/experience-manager-htl/using/java-use-api.html

---

### AEMCS-CQ-006: Deprecated Felix SCR Annotations

- **Severity**: High
- **Description**: Apache Felix SCR annotations (`@Component`, `@Service`, `@Property`, `@Reference` from `org.apache.felix.scr.annotations`) are deprecated. Use standard OSGi DS annotations from `org.osgi.service.component.annotations`.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
import\s+org\.apache\.felix\.scr\.annotations\.\w+
```

#### Detect — Good Pattern
- `import org.osgi.service.component.annotations.Component;`
- `import org.osgi.service.component.annotations.Reference;`

#### Bad Example
```java
import org.apache.felix.scr.annotations.Component;
import org.apache.felix.scr.annotations.Service;
import org.apache.felix.scr.annotations.Reference;

@Component
@Service
public class MyServiceImpl implements MyService {
```

#### Good Example
```java
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(service = MyService.class)
public class MyServiceImpl implements MyService {
```

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/osgi.html

---

### AEMCS-CQ-007: Deprecated @SlingServlet Annotation

- **Severity**: High
- **Description**: `@SlingServlet` annotation from `org.apache.sling.servlets.annotations` is deprecated. Use OSGi DS `@Component` with `sling.servlet.*` properties instead.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
@SlingServlet\s*\(
```

#### Detect — Good Pattern
- `@Component(service = Servlet.class, property = { "sling.servlet.paths=/bin/myservlet" })`

#### Bad Example
```java
@SlingServlet(paths = "/bin/myservlet", methods = "GET")
public class MyServlet extends SlingSafeMethodsServlet {
```

#### Good Example
```java
@Component(service = Servlet.class, property = {
    "sling.servlet.paths=/bin/myservlet",
    "sling.servlet.methods=GET"
})
public class MyServlet extends SlingSafeMethodsServlet {
```

---

### AEMCS-CQ-008: Hardcoded Content Path

- **Severity**: Medium
- **Description**: Hardcoded JCR paths like `/content/mysite/en` break multi-site/multi-language setups and make code non-reusable. Use relative paths, resource resolver mapping, or externalizer instead.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
"/content/[a-z][a-z0-9-]+/[a-z]{2}(/|")
```

#### Detect — Good Pattern
- `currentPage.getPath()`
- `resourceResolver.map(path)`
- Reading path from OSGi config

#### Bad Example
```java
Resource home = resolver.getResource("/content/mysite/en/home");
```

#### Good Example
```java
@OSGiConfig
private String rootPath;  // Configurable per environment

Resource home = resolver.getResource(rootPath + "/home");
```

#### False Positives
- Constants.java or Config.java files defining configurable paths
- Test classes with fixture paths
- Static final String with UPPER_CASE naming (config constants)

---

### AEMCS-CQ-009: Unused Import

- **Severity**: Low
- **Description**: Unused imports add clutter and can cause compile warnings. They may also indicate incomplete refactoring where code was removed but imports were left behind.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
^import\s+(?!.*\*)[\w.]+\.([A-Z]\w+)\s*;
```

#### Detect — Good Pattern
- Only imports that are actually used in the file

#### False Positives
- Annotations referenced only in Javadoc
- Imports used in generics type parameters
- Wildcard imports (`import java.util.*`)

---

### AEMCS-CQ-010: Technical Debt Marker (TODO/FIXME/HACK)

- **Severity**: Low
- **Description**: TODO, FIXME, HACK, XXX, and TEMP comments indicate unfinished work or known issues. Track these to ensure they don't persist into production.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
ui.apps/src/main/content/jcr_root/**/*.html
```

#### Detect — Bad Pattern
```regex
(TODO|FIXME|HACK|XXX|TEMP)\s*[:—-]?\s*\w
```

#### Detect — Good Pattern
- Tracked in issue tracker (Jira) with ticket reference
- `// TODO [JIRA-123]: Implement caching`

#### False Positives
- TODO comments with Jira/ticket references (being tracked)

---

## SEO Rules

---

### AEMCS-SEO-001: Missing Title Tag in Page Template

- **Severity**: High
- **Description**: Every page template must include a `<title>` tag in the `<head>`. Without it, search engines display the URL as the title, hurting click-through rates and rankings.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/page/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/components/**/head.html
```

#### Detect — Bad Pattern
- HTL head files without `<title` tag
- No `${currentPage.title}` or `${page.title}` expression in head

#### Detect — Good Pattern
```regex
<title>.*\$\{.*title.*\}.*</title>
```

#### Bad Example
```html
<head data-sly-use.head="com.mysite.models.HeadModel">
    <meta charset="UTF-8"/>
    <!-- Missing <title> tag entirely -->
</head>
```

#### Good Example
```html
<head data-sly-use.head="com.mysite.models.HeadModel">
    <meta charset="UTF-8"/>
    <title>${currentPage.title || currentPage.name}</title>
</head>
```

#### References
- https://developers.google.com/search/docs/appearance/title-link

---

### AEMCS-SEO-002: Missing Meta Description

- **Severity**: Medium
- **Description**: The meta description appears in search results below the title. Without it, Google generates its own snippet which may not represent your page well.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/page/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/components/**/head.html
```

#### Detect — Bad Pattern
- Page head templates without `meta name="description"` or `meta property="og:description"`

#### Detect — Good Pattern
```regex
<meta\s+name="description"\s+content="\$\{
```

#### Bad Example
```html
<head>
    <title>${currentPage.title}</title>
    <!-- No meta description -->
</head>
```

#### Good Example
```html
<head>
    <title>${currentPage.title}</title>
    <meta name="description" content="${currentPage.description}"/>
</head>
```

#### References
- https://developers.google.com/search/docs/appearance/snippet

---

### AEMCS-SEO-003: Missing Canonical Tag

- **Severity**: Medium
- **Description**: Without a canonical tag, search engines may index duplicate versions of your page (with/without query params, www vs non-www). This dilutes page authority.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/page/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/components/**/head.html
```

#### Detect — Bad Pattern
- Page head templates without `rel="canonical"`

#### Detect — Good Pattern
```regex
<link\s+rel="canonical"\s+href=
```

#### Bad Example
```html
<head>
    <title>${currentPage.title}</title>
    <!-- Missing canonical — Google might index ?utm_source=email version -->
</head>
```

#### Good Example
```html
<head>
    <title>${currentPage.title}</title>
    <link rel="canonical" href="${canonicalUrl}"/>
</head>
```

---

### AEMCS-SEO-004: Missing Open Graph Tags

- **Severity**: Low
- **Description**: Open Graph meta tags control how your page appears when shared on social media (Facebook, LinkedIn, Twitter). Without them, platforms auto-generate previews that may look wrong.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/page/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/components/**/head.html
```

#### Detect — Bad Pattern
- Page head templates without `og:title` or `og:image`

#### Detect — Good Pattern
```regex
<meta\s+property="og:(title|image|description)"
```

#### Bad Example
```html
<head>
    <title>${currentPage.title}</title>
    <!-- No OG tags — social shares show broken previews -->
</head>
```

#### Good Example
```html
<head>
    <title>${currentPage.title}</title>
    <meta property="og:title" content="${currentPage.title}"/>
    <meta property="og:description" content="${currentPage.description}"/>
    <meta property="og:image" content="${ogImage}"/>
</head>
```

---

### AEMCS-SEO-005: Missing Viewport Meta Tag

- **Severity**: High
- **Description**: Without the viewport meta tag, mobile browsers render the page at desktop width and scale down. Google uses mobile-first indexing, so this directly impacts rankings.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/page/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/components/**/head.html
```

#### Detect — Bad Pattern
- Page head templates without `name="viewport"`

#### Detect — Good Pattern
```regex
<meta\s+name="viewport"\s+content="width=device-width
```

#### Bad Example
```html
<head>
    <title>${currentPage.title}</title>
    <!-- No viewport — fails Google mobile-friendly test -->
</head>
```

#### Good Example
```html
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${currentPage.title}</title>
</head>
```

#### References
- https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing

---

### AEMCS-SEO-006: Missing Language Attribute on HTML Tag

- **Severity**: Medium
- **Description**: The `lang` attribute on `<html>` tells search engines and screen readers the page language. Without it, translation tools may not activate and search engines can't confidently serve the page for language-specific queries.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/page/**/*.html
```

#### Detect — Bad Pattern
```regex
<html(?![^>]*\slang[\s=])
```

#### Detect — Good Pattern
```regex
<html[^>]+lang=
```

#### Bad Example
```html
<html>
<head>...</head>
```

#### Good Example
```html
<html lang="${currentPage.language.language @ context='attribute'}">
<head>...</head>
```

---

### AEMCS-SEO-007: Multiple H1 Tags on Page

- **Severity**: Medium
- **Description**: A page should have exactly one H1 tag. Multiple H1s confuse search engines about which heading represents the main topic, potentially diluting keyword relevance.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/**/*.html
```

#### Detect — Bad Pattern
```regex
<h1[\s>]
```

#### Detect — Good Pattern
- Only one `<h1>` per page template (typically in the hero or page title component)

#### False Positives
- Component-level HTL files that are conditionally included (only one renders)
- data-sly-test guarded H1 tags (only one will render)

---

### AEMCS-SEO-008: Non-Descriptive Link Text

- **Severity**: Low
- **Description**: Links with text like "click here", "read more", "learn more" give search engines no context about the linked page. Use descriptive anchor text that explains what the user will find.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/**/*.html
```

#### Detect — Bad Pattern
```regex
<a[^>]*>\s*(click here|read more|learn more|more|here|link)\s*</a>
```

#### Detect — Good Pattern
- `<a href="/products">View our product catalog</a>`
- Linked text that describes the destination

#### False Positives
- CTA buttons where "Learn More" is intentional UX design with aria-label providing context
- data-sly-test expressions that add descriptive text dynamically

---

## Accessibility Rules (WCAG 2.1)

---

### AEMCS-A11Y-001: Image Missing Alt Text

- **Severity**: Critical
- **Description**: Images without `alt` attributes are invisible to screen readers. WCAG 2.1 Level A (1.1.1) requires all non-decorative images to have text alternatives. This is the #1 accessibility failure on the web.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/**/*.html
```

#### Detect — Bad Pattern
```regex
<img(?![^>]*\salt[\s=])(?![^>]*data-sly-attribute\.\s*alt)[^>]*>
```

#### Detect — Good Pattern
```regex
<img[^>]+alt=
```

#### Bad Example
```html
<img src="${image.src}"/>
```

#### Good Example
```html
<img src="${image.src}" alt="${image.alt || 'Decorative image'}" data-sly-test="${image.src}"/>
```

#### False Positives
- Images with `role="presentation"` (decorative)
- Images inside elements with `aria-hidden="true"`
- SVG icons with `aria-hidden="true"` (decorative)

#### References
- https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html

---

### AEMCS-A11Y-002: Form Input Without Label

- **Severity**: High
- **Description**: Form inputs without associated `<label>` elements or `aria-label` attributes leave users relying on screen readers unable to understand what to enter. WCAG 2.1 Level A (1.3.1, 4.1.2).

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/**/*.html
```

#### Detect — Bad Pattern
```regex
<input(?![^>]*type="(hidden|submit|button|image)")(?![^>]*aria-label)(?![^>]*id="[^"]*")[^>]*>
```

#### Detect — Good Pattern
```regex
<label[^>]*for="[^"]*"
```

#### Bad Example
```html
<input type="text" name="email" placeholder="Enter email"/>
```

#### Good Example
```html
<label for="email-input">Email Address</label>
<input type="text" id="email-input" name="email" placeholder="Enter email"/>
```

#### False Positives
- Hidden inputs (`type="hidden"`)
- Submit/button inputs that are self-labeling
- Inputs with `aria-labelledby` pointing to visible text

---

### AEMCS-A11Y-003: onClick on Non-Interactive Element

- **Severity**: High
- **Description**: Using `onclick` on `<div>` or `<span>` creates elements that respond to mouse clicks but are unreachable by keyboard. WCAG 2.1 Level A (2.1.1) requires all functionality to be keyboard-operable.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/*.js
```

#### Detect — Bad Pattern
```regex
<(div|span|li|p)[^>]+onclick\s*=
```

#### Detect — Good Pattern
- `<button onclick="...">`
- `<a href="#" onclick="...">`
- `<div role="button" tabindex="0" onclick="..." onkeydown="...">`

#### Bad Example
```html
<div class="card" onclick="navigate('/products')">Click to view</div>
```

#### Good Example
```html
<button class="card" onclick="navigate('/products')">View Products</button>
```

#### False Positives
- Elements with `role="button"` AND `tabindex="0"` AND a keyboard handler

---

### AEMCS-A11Y-004: Focus Outline Removed Without Replacement

- **Severity**: High
- **Description**: Removing `:focus` outline with `outline: none` or `outline: 0` makes it impossible for keyboard users to see which element is active. WCAG 2.1 Level AA (2.4.7) requires visible focus indicators.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/*.css
ui.frontend/src/**/*.css
ui.frontend/src/**/*.scss
```

#### Detect — Bad Pattern
```regex
:focus\s*\{[^}]*outline\s*:\s*(none|0)
```

#### Detect — Good Pattern
- `:focus { outline: 2px solid #005fcc; }`
- `:focus-visible { box-shadow: 0 0 0 3px rgba(0,95,204,0.5); }`

#### Bad Example
```css
a:focus, button:focus {
    outline: none;  /* Keyboard users can't see where they are */
}
```

#### Good Example
```css
a:focus-visible, button:focus-visible {
    outline: 2px solid #005fcc;
    outline-offset: 2px;
}
```

#### False Positives
- Rules that replace outline with box-shadow or border as focus indicator
- `:focus:not(:focus-visible) { outline: none; }` (progressive enhancement pattern)

---

### AEMCS-A11Y-005: Empty Link or Button

- **Severity**: Critical
- **Description**: Links or buttons with no text content, no `aria-label`, and no `aria-labelledby` announce as "link" or "button" with no purpose. Users cannot determine what clicking will do. WCAG 2.1 Level A (2.4.4).

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/**/*.html
```

#### Detect — Bad Pattern
```regex
<(a|button)[^>]*>\s*</(a|button)>
```

#### Detect — Good Pattern
- `<a href="/home" aria-label="Go to homepage"><i class="icon-home"></i></a>`
- `<button><span class="sr-only">Close</span><i class="icon-x"></i></button>`

#### Bad Example
```html
<a href="/search" class="search-icon"></a>
```

#### Good Example
```html
<a href="/search" class="search-icon" aria-label="Search">
    <span class="sr-only">Search</span>
</a>
```

---

### AEMCS-A11Y-006: Missing iframe Title

- **Severity**: Medium
- **Description**: Iframes without a `title` attribute announce as "frame" with no context. Screen reader users need to know the iframe's purpose to decide whether to enter it. WCAG 2.1 Level A (4.1.2).

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/**/*.html
```

#### Detect — Bad Pattern
```regex
<iframe(?![^>]*\stitle[\s=])[^>]*>
```

#### Detect — Good Pattern
```regex
<iframe[^>]+title="[^"]+"
```

#### Bad Example
```html
<iframe src="https://www.youtube.com/embed/abc123"></iframe>
```

#### Good Example
```html
<iframe src="https://www.youtube.com/embed/abc123" title="Product demo video"></iframe>
```

---

### AEMCS-A11Y-007: Pinch-to-Zoom Disabled

- **Severity**: Critical
- **Description**: Setting `maximum-scale=1.0` or `user-scalable=no` in the viewport meta tag prevents users from zooming in. Users with low vision depend on zoom. WCAG 2.1 Level AA (1.4.4).

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/page/**/*.html
ui.apps/src/main/content/jcr_root/apps/**/components/**/head.html
```

#### Detect — Bad Pattern
```regex
user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?[,"]
```

#### Detect — Good Pattern
- `<meta name="viewport" content="width=device-width, initial-scale=1.0"/>`
- No zoom restrictions

#### Bad Example
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
```

#### Good Example
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
```

#### References
- https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html

---

### AEMCS-A11Y-008: Data Table Missing Header Cells

- **Severity**: High
- **Description**: Data tables without `<th>` elements prevent screen readers from associating data cells with their headers. Users hear "column 1, row 2" instead of "Product Name: Widget". WCAG 2.1 Level A (1.3.1).

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/components/**/*.html
```

#### Detect — Bad Pattern
```regex
<table(?![^>]*role="presentation")[^>]*>(?:(?!<th[\s>]).)*?</table>
```

#### Detect — Good Pattern
- `<table><thead><tr><th>Name</th><th>Price</th></tr></thead>...`

#### False Positives
- Layout tables with `role="presentation"` (not data tables)
- Tables generated dynamically via data-sly-list where th is in a separate template

---

## Dispatcher Rules

---

### AEMCS-DISP-001: Missing Security Headers

- **Severity**: High
- **Description**: Security response headers (X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, Strict-Transport-Security) protect against XSS, clickjacking, and MIME-sniffing attacks. Cloud Service dispatcher configs must set these.

#### Detect — Files to Scan
```
dispatcher/src/conf.d/**/*.vhost
dispatcher/src/conf.d/**/*.conf
dispatcher/src/conf/**/*.conf
```

#### Detect — Bad Pattern
- Vhost files without `Header set X-Content-Type-Options`
- Missing `Header set X-Frame-Options`
- Missing `Header set Strict-Transport-Security`

#### Detect — Good Pattern
```regex
Header\s+(always\s+)?set\s+X-Content-Type-Options
```

#### Bad Example
```apache
<VirtualHost *:80>
    ServerName mysite.com
    # No security headers configured
</VirtualHost>
```

#### Good Example
```apache
<VirtualHost *:80>
    ServerName mysite.com
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
</VirtualHost>
```

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/content-delivery/disp-overview.html

---

### AEMCS-DISP-002: Overly Permissive Filter Rules

- **Severity**: Critical
- **Description**: Dispatcher filter rules that allow all requests (`/0001 { /type "allow" /url "*" }`) bypass security filtering. Use deny-by-default and only allow specific paths needed by the site.

#### Detect — Files to Scan
```
dispatcher/src/conf.dispatcher.d/filters/**/*.any
dispatcher/src/conf.dispatcher.d/**/*.any
```

#### Detect — Bad Pattern
```regex
/type\s+"allow"\s+/url\s+"\*"
```

#### Detect — Good Pattern
- `/0001 { /type "deny" /url "*" }`
- Specific allow rules: `/0100 { /type "allow" /url "/content/mysite*" }`

#### Bad Example
```
/filter {
    /0001 { /type "allow" /url "*" }
}
```

#### Good Example
```
/filter {
    /0001 { /type "deny" /url "*" }
    /0100 { /type "allow" /method "GET" /url "/content/mysite/*" }
    /0200 { /type "allow" /method "GET" /url "/etc.clientlibs/*" }
}
```

---

### AEMCS-DISP-003: Missing Cache Rules for Static Assets

- **Severity**: Medium
- **Description**: Without explicit cache rules for static assets (JS, CSS, images), the dispatcher may not cache them efficiently. This increases origin load and slows page delivery.

#### Detect — Files to Scan
```
dispatcher/src/conf.dispatcher.d/cache/**/*.any
dispatcher/src/conf.d/**/*.vhost
dispatcher/src/conf.d/**/*.conf
```

#### Detect — Bad Pattern
- Cache config without rules for `/etc.clientlibs`
- Missing `Header set Cache-Control` for static file patterns

#### Detect — Good Pattern
```regex
/etc\.clientlibs|clientlibs.*cache|Cache-Control.*max-age
```

#### Bad Example
```
/cache {
    /rules {
        /0001 { /type "allow" /glob "*.html" }
        # No rules for JS, CSS, images
    }
}
```

#### Good Example
```
/cache {
    /rules {
        /0001 { /type "deny" /glob "*" }
        /0010 { /type "allow" /glob "*.html" }
        /0020 { /type "allow" /glob "/etc.clientlibs/*" }
        /0030 { /type "allow" /glob "*.js" }
        /0040 { /type "allow" /glob "*.css" }
        /0050 { /type "allow" /glob "/content/dam/*" }
    }
}
```

---

### AEMCS-DISP-004: Sensitive Paths Not Blocked

- **Severity**: Critical
- **Description**: Paths like `/crx`, `/system/console`, `/bin/querybuilder`, `/libs/granite/security` must be blocked at the dispatcher level. If accessible publicly, attackers can exploit admin interfaces.

#### Detect — Files to Scan
```
dispatcher/src/conf.dispatcher.d/filters/**/*.any
dispatcher/src/conf.dispatcher.d/**/*.any
```

#### Detect — Bad Pattern
- Filter files without deny rules for `/crx`, `/system`, `/bin/querybuilder`

#### Detect — Good Pattern
```regex
/type\s+"deny"\s+/url\s+"(/crx|/system/console|/bin/querybuilder)
```

#### Bad Example
```
/filter {
    /0001 { /type "deny" /url "*" }
    /0100 { /type "allow" /url "/content/*" }
    # Missing: deny rules for admin paths
}
```

#### Good Example
```
/filter {
    /0001 { /type "deny" /url "*" }
    /0050 { /type "deny" /url "/crx/*" }
    /0051 { /type "deny" /url "/system/*" }
    /0052 { /type "deny" /url "/bin/querybuilder*" }
    /0053 { /type "deny" /url "/libs/granite/security/*" }
    /0100 { /type "allow" /url "/content/mysite/*" }
}
```

---

### AEMCS-DISP-005: No TTL Configuration for HTML Pages

- **Severity**: Medium
- **Description**: Without a `statfileslevel` or TTL-based cache invalidation strategy, HTML pages remain stale after content authors publish changes. Configure appropriate invalidation for content freshness.

#### Detect — Files to Scan
```
dispatcher/src/conf.dispatcher.d/cache/**/*.any
dispatcher/src/conf.dispatcher.d/**/*.any
```

#### Detect — Bad Pattern
- Cache configuration without `/statfileslevel`
- No `/enableTTL "1"` setting

#### Detect — Good Pattern
```regex
/statfileslevel\s+"[2-9]"|/enableTTL\s+"1"
```

#### Bad Example
```
/cache {
    /docroot "/var/www/html"
    /rules { /0001 { /type "allow" /glob "*.html" } }
    # No statfileslevel or TTL — pages stay stale indefinitely
}
```

#### Good Example
```
/cache {
    /docroot "/var/www/html"
    /statfileslevel "3"
    /enableTTL "1"
    /rules { /0001 { /type "allow" /glob "*.html" } }
}
```

---

## HTL & Frontend Rules

---

### AEMCS-HTL-001: JSP Syntax in HTL File

- **Severity**: Critical
- **Description**: JSP scriptlet tags (`<% %>`, `<%= %>`) in HTL files indicate an incomplete migration from JSP to HTL. These won't execute in HTL and produce broken output. Cloud Service only supports HTL.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/*.html
```

#### Detect — Bad Pattern
```regex
<%[^-]|%>
```

#### Detect — Good Pattern
- `${properties.title}` (HTL expression)
- `data-sly-use`, `data-sly-test`, `data-sly-list`

#### Bad Example
```html
<div>
    <% String title = properties.get("jcr:title", ""); %>
    <h1><%= title %></h1>
</div>
```

#### Good Example
```html
<div>
    <h1>${properties['jcr:title']}</h1>
</div>
```

---

### AEMCS-HTL-002: Complex HTL Expression (Over 100 Characters)

- **Severity**: Medium
- **Description**: Very long HTL expressions indicate logic that belongs in a Sling Model, not in the template. Complex template expressions are hard to read, test, and maintain.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/*.html
```

#### Detect — Bad Pattern
```regex
\$\{[^}]{100,}\}
```

#### Detect — Good Pattern
- `${model.formattedPrice}` (logic in Sling Model)
- Short, readable expressions

#### Bad Example
```html
<span>${properties.price ? '$' + (properties.price * (1 - properties.discount / 100)).toFixed(2) + ' USD' : 'Contact for pricing'}</span>
```

#### Good Example
```html
<span data-sly-use.product="com.mysite.models.Product">${product.formattedPrice}</span>
```

---

### AEMCS-HTL-003: Hardcoded URL in HTL Template

- **Severity**: Medium
- **Description**: Hardcoded absolute URLs (http://, https://) in templates break across environments (dev, stage, prod) and prevent proper link rewriting by the Externalizer service.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/*.html
```

#### Detect — Bad Pattern
```regex
(href|src|action)="https?://[^$][^"]*"
```

#### Detect — Good Pattern
- `href="${model.externalUrl}"` (Externalizer in Sling Model)
- `src="/content/dam/..."` (relative paths)

#### Bad Example
```html
<a href="https://www.mysite.com/products">Products</a>
<img src="https://cdn.mysite.com/images/logo.png"/>
```

#### Good Example
```html
<a href="${model.productsUrl}">Products</a>
<img src="${model.logoPath}"/>
```

#### False Positives
- Links to third-party sites (external links are expected to be absolute)
- Schema.org or canonical URLs generated dynamically
- Links inside `<!--/* HTL comments */-->`

---

### AEMCS-HTL-004: ClientLib Without Categories

- **Severity**: High
- **Description**: A `cq:ClientLibraryFolder` node without a `categories` property won't be loaded by any page. The clientlib is dead code — its CSS/JS will never reach the browser.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/.content.xml
```

#### Detect — Bad Pattern
- `.content.xml` with `jcr:primaryType="cq:ClientLibraryFolder"` but without `categories` property

#### Detect — Good Pattern
```regex
categories="[^"]*\[
```

#### Bad Example
```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
    jcr:primaryType="cq:ClientLibraryFolder">
    <!-- Missing categories — this clientlib will never load -->
</jcr:root>
```

#### Good Example
```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
    jcr:primaryType="cq:ClientLibraryFolder"
    categories="[mysite.components.hero]">
</jcr:root>
```

---

### AEMCS-HTL-005: eval() Usage in JavaScript

- **Severity**: High
- **Description**: `eval()` executes arbitrary JavaScript strings, creating XSS vulnerabilities if any user input reaches it. It also prevents JavaScript engine optimization and is flagged by all security scanners.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/*.js
ui.frontend/src/**/*.js
ui.frontend/src/**/*.ts
```

#### Detect — Bad Pattern
```regex
\beval\s*\(
```

#### Detect — Good Pattern
- `JSON.parse(data)` instead of `eval(data)`
- `new Function()` for dynamic code (still dangerous but explicit)

#### Bad Example
```javascript
function loadConfig(jsonString) {
    var config = eval('(' + jsonString + ')');  // XSS if jsonString is user-controlled
}
```

#### Good Example
```javascript
function loadConfig(jsonString) {
    const config = JSON.parse(jsonString);
}
```

#### False Positives
- Comments mentioning eval
- Strings containing the word "eval" (e.g., "evaluation")

---

### AEMCS-HTL-006: document.write() Usage

- **Severity**: Medium
- **Description**: `document.write()` blocks page rendering, can break the entire page if called after load, and is incompatible with Content Security Policy. Use DOM manipulation methods instead.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/*.js
ui.frontend/src/**/*.js
```

#### Detect — Bad Pattern
```regex
document\.write\s*\(
```

#### Detect — Good Pattern
- `document.createElement()` + `element.appendChild()`
- `element.innerHTML = content;`

#### Bad Example
```javascript
document.write('<script src="analytics.js"><\/script>');
```

#### Good Example
```javascript
const script = document.createElement('script');
script.src = 'analytics.js';
document.head.appendChild(script);
```

---

### AEMCS-HTL-007: Console.log in Production JavaScript

- **Severity**: Low
- **Description**: `console.log`, `console.debug`, and `console.info` statements left in production code clutter the browser console and may expose internal information to users inspecting the page.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/*.js
ui.frontend/src/**/*.js
ui.frontend/src/**/*.ts
```

#### Detect — Bad Pattern
```regex
console\.(log|debug|info|warn)\s*\(
```

#### Detect — Good Pattern
- Remove console statements for production
- Use a logging utility that can be disabled: `Logger.debug("msg")`

#### False Positives
- `console.error()` is acceptable (genuine error reporting)
- Files in `test/` or `__tests__/` directories
- Build tools that strip console.log in production

---

### AEMCS-HTL-008: Excessive !important in CSS

- **Severity**: Medium
- **Description**: Overusing `!important` indicates specificity wars in CSS. It makes styles nearly impossible to override, breaks component composability, and leads to even more `!important` declarations.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/*.css
ui.frontend/src/**/*.css
ui.frontend/src/**/*.scss
```

#### Detect — Bad Pattern
```regex
!important
```

#### Detect — Good Pattern
- Use more specific selectors instead of !important
- Use CSS custom properties for theming

#### False Positives
- Utility classes intentionally using !important (e.g., `.sr-only`, `.hidden`)
- Third-party CSS override files (sometimes necessary)

---

### AEMCS-HTL-009: Large HTL Template (Over 200 Lines)

- **Severity**: Medium
- **Description**: HTL templates over 200 lines are hard to maintain and indicate the component is doing too much. Break large templates into sub-components using `data-sly-include` or `data-sly-resource`.

#### Detect — Files to Scan
```
ui.apps/src/main/content/jcr_root/apps/**/*.html
```

#### Detect — Bad Pattern
- HTL files with more than 200 lines

#### Detect — Good Pattern
- Components broken into smaller, focused templates
- Use `data-sly-include="partials/header.html"`

---

## Test Coverage Rules

---

### AEMCS-TEST-001: Missing JaCoCo Code Coverage Plugin

- **Severity**: Critical
- **Description**: Without JaCoCo, there's no way to measure or enforce test coverage. Cloud Manager quality gates require minimum coverage thresholds — deployments will fail without this plugin configured.

#### Detect — Files to Scan
```
core/pom.xml
pom.xml
```

#### Detect — Bad Pattern
- `pom.xml` files without `jacoco-maven-plugin`

#### Detect — Good Pattern
```regex
jacoco-maven-plugin
```

#### Bad Example
```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-surefire-plugin</artifactId>
        </plugin>
        <!-- No JaCoCo — can't measure coverage -->
    </plugins>
</build>
```

#### Good Example
```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <executions>
        <execution>
            <goals><goal>prepare-agent</goal></goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals><goal>report</goal></goals>
        </execution>
    </executions>
</plugin>
```

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/using-cloud-manager/test-results/code-quality-testing.html

---

### AEMCS-TEST-002: Missing UI Tests Module

- **Severity**: High
- **Description**: The `ui.tests` module provides end-to-end testing for Cloud Manager pipelines. Without it, your deployment has no automated UI validation and relies entirely on manual QA.

#### Detect — Files to Scan
```
pom.xml
```

#### Detect — Bad Pattern
- Root `pom.xml` without `<module>ui.tests</module>`

#### Detect — Good Pattern
```regex
<module>ui\.tests</module>
```

#### Bad Example
```xml
<modules>
    <module>core</module>
    <module>ui.apps</module>
    <module>ui.content</module>
    <!-- Missing ui.tests -->
</modules>
```

#### Good Example
```xml
<modules>
    <module>core</module>
    <module>ui.apps</module>
    <module>ui.content</module>
    <module>ui.tests</module>
    <module>it.tests</module>
</modules>
```

---

### AEMCS-TEST-003: Sling Model Without Unit Test

- **Severity**: Medium
- **Description**: Sling Models contain business logic (value formatting, conditional rendering, API calls). Without unit tests, regressions in model logic go undetected until users report bugs.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
@Model\s*\(
```

#### Detect — Good Pattern
- Corresponding test file exists in `core/src/test/java/`

#### False Positives
- Very simple models with only `@ValueMapValue` fields (no logic to test)
- Models with corresponding test files that the scanner can't correlate

---

### AEMCS-TEST-004: Servlet Without Unit Test

- **Severity**: Medium
- **Description**: Servlets handle HTTP requests and often contain security-sensitive logic (authentication checks, input validation). Without tests, vulnerabilities and bugs in request handling go uncaught.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
extends\s+(SlingAllMethodsServlet|SlingSafeMethodsServlet)
```

#### Detect — Good Pattern
- Corresponding test file exists in `core/src/test/java/`

---

### AEMCS-TEST-005: Missing Integration Tests Module

- **Severity**: Medium
- **Description**: The `it.tests` module provides server-side integration tests that run against a real AEM instance. Without them, you only test code in isolation — integration issues (OSGi wiring, resource resolution) go undetected.

#### Detect — Files to Scan
```
pom.xml
```

#### Detect — Bad Pattern
- Root `pom.xml` without `<module>it.tests</module>`

#### Detect — Good Pattern
```regex
<module>it\.tests</module>
```

---

### AEMCS-TEST-006: Test Without Assertions

- **Severity**: Medium
- **Description**: Test methods without assertions (assert*, verify*, expect*) pass regardless of outcome. They provide false confidence — the test "passes" but validates nothing.

#### Detect — Files to Scan
```
core/src/test/java/**/*.java
it.tests/src/test/java/**/*.java
```

#### Detect — Bad Pattern
```regex
@Test\s+(?:public\s+)?void\s+\w+\s*\([^)]*\)\s*(?:throws[^{]*)?\{[^}]*\}
```

#### Detect — Good Pattern
- `@Test` methods containing `assert`, `verify`, `expect`, `assertThat`

#### False Positives
- Tests that verify exceptions are thrown (`@Test(expected=...)` or `assertThrows`)
- Tests using Mockito `verify()` for behavior verification

---

## Maintainability Rules

---

### AEMCS-MAINT-001: High Cyclomatic Complexity

- **Severity**: High
- **Description**: Methods with many branches (if/else, switch cases, loops, ternary) are hard to understand, test, and modify. Cyclomatic complexity above 15 strongly correlates with bugs.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
(if\s*\(|else\s+if|switch\s*\(|while\s*\(|for\s*\(|\?\s*[^:]*\s*:|\|\||&&)
```

#### Detect — Good Pattern
- Methods with fewer than 10 decision points
- Extract complex conditionals into named methods

#### False Positives
- Builder pattern methods with many chained calls
- Simple switch statements mapping enum values

---

### AEMCS-MAINT-002: Deep Nesting (More Than 4 Levels)

- **Severity**: Medium
- **Description**: Code nested more than 4 levels deep (loops inside conditions inside loops) is extremely hard to follow. Use early returns, extract methods, or restructure the algorithm.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
^(\s{16,}|\t{4,})(if|for|while|switch)\s*\(
```

#### Detect — Good Pattern
- Early returns: `if (x == null) return;`
- Extract inner logic to named methods
- Maximum 3 levels of nesting

#### Bad Example
```java
public void process(List<Page> pages) {
    if (pages != null) {
        for (Page page : pages) {
            if (page.isValid()) {
                for (Component comp : page.getComponents()) {
                    if (comp.isEditable()) {
                        // 5 levels deep — impossible to follow
                    }
                }
            }
        }
    }
}
```

#### Good Example
```java
public void process(List<Page> pages) {
    if (pages == null) return;
    pages.stream()
        .filter(Page::isValid)
        .flatMap(p -> p.getComponents().stream())
        .filter(Component::isEditable)
        .forEach(this::processComponent);
}
```

---

### AEMCS-MAINT-003: God Class (Over 500 Lines)

- **Severity**: Medium
- **Description**: Java classes over 500 lines typically violate the Single Responsibility Principle. They're hard to understand, test in isolation, and modify without side effects. Split into focused classes.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
- Java files exceeding 500 lines

#### Detect — Good Pattern
- Classes under 300 lines
- Each class has a single, clear responsibility

---

### AEMCS-MAINT-004: Long Parameter List (More Than 5)

- **Severity**: Low
- **Description**: Methods with more than 5 parameters are hard to call correctly (easy to swap arguments). Consider using a parameter object, builder pattern, or restructuring the method.

#### Detect — Files to Scan
```
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
(public|protected|private)\s+\w+\s+\w+\s*\([^)]*,\s*[^)]*,\s*[^)]*,\s*[^)]*,\s*[^)]*,\s*[^)]*\)
```

#### Detect — Good Pattern
- Methods with 3 or fewer parameters
- Using builder or configuration objects for complex initialization

#### Bad Example
```java
public void createPage(String path, String title, String template,
    String description, String language, String author, boolean published) {
```

#### Good Example
```java
public void createPage(PageCreateRequest request) {
    // All parameters bundled in a typed object
}
```

---

## Dependencies & Versions Rules

---

### AEMCS-DEP-001: End-of-Life Java Version

- **Severity**: High
- **Description**: Java 8 and non-LTS versions (9, 10, 12-16, 18-20) are either EOL or losing security updates. AEM Cloud Service supports Java 11 (minimum) and recommends Java 17+ for new projects.

#### Detect — Files to Scan
```
core/pom.xml
pom.xml
```

#### Detect — Bad Pattern
```regex
<(java\.version|maven\.compiler\.(source|target|release))>\s*(1\.8|8|9|10|12|13|14|15|16|18|19|20)\s*<
```

#### Detect — Good Pattern
```regex
<(java\.version|maven\.compiler\.(source|target|release))>\s*(11|17|21)\s*<
```

#### Bad Example
```xml
<properties>
    <java.version>1.8</java.version>
</properties>
```

#### Good Example
```xml
<properties>
    <java.version>11</java.version>
</properties>
```

#### References
- https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/implementing/developing/aem-as-a-cloud-service-sdk.html

---

### AEMCS-DEP-002: Vulnerable Log4j Version

- **Severity**: Critical
- **Description**: Log4j versions prior to 2.17.1 contain critical RCE vulnerabilities (CVE-2021-44228, CVE-2021-45046). Any version of log4j-core 1.x or 2.x below 2.17.1 must be upgraded immediately.

#### Detect — Files to Scan
```
**/pom.xml
```

#### Detect — Bad Pattern
```regex
<artifactId>log4j-core</artifactId>\s*<version>(1\.|2\.(0|1[0-6]))
```

#### Detect — Good Pattern
```regex
<artifactId>log4j-core</artifactId>\s*<version>2\.(17\.[1-9]|1[89]|[2-9]\d)
```

#### Bad Example
```xml
<dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-core</artifactId>
    <version>2.14.1</version>  <!-- CVE-2021-44228 (Log4Shell) -->
</dependency>
```

#### Good Example
```xml
<dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-core</artifactId>
    <version>2.21.1</version>
</dependency>
```

---

### AEMCS-DEP-003: Vulnerable Commons-Collections 3.x

- **Severity**: Critical
- **Description**: Apache Commons Collections 3.x has a known deserialization RCE vulnerability (CVE-2015-7501). Upgrade to 4.x or exclude this transitive dependency.

#### Detect — Files to Scan
```
**/pom.xml
```

#### Detect — Bad Pattern
```regex
<artifactId>commons-collections</artifactId>\s*<version>3\.
```

#### Detect — Good Pattern
```regex
<artifactId>commons-collections4</artifactId>
```

---

### AEMCS-DEP-004: jQuery Below 3.5 (XSS Vulnerability)

- **Severity**: High
- **Description**: jQuery versions below 3.5.0 have known XSS vulnerabilities in `$.htmlPrefilter()` (CVE-2020-11022, CVE-2020-11023). Upgrade to 3.5+ or use vanilla JavaScript.

#### Detect — Files to Scan
```
ui.frontend/package.json
ui.apps/src/main/content/jcr_root/apps/**/clientlibs/**/*.js
```

#### Detect — Bad Pattern
```regex
"jquery":\s*"[^3-9]|jQuery\s+v[12]\.|jQuery JavaScript Library v[12]\.
```

#### Detect — Good Pattern
- jQuery 3.5+ or no jQuery dependency

#### False Positives
- jQuery migrate plugin references

---

### AEMCS-DEP-005: Outdated AEM Core Components

- **Severity**: Medium
- **Description**: AEM Core Components below 2.20 miss security patches, accessibility fixes, and Cloud Service compatibility improvements. Keep Core Components current for best platform support.

#### Detect — Files to Scan
```
pom.xml
ui.apps/pom.xml
```

#### Detect — Bad Pattern
```regex
<artifactId>core\.wcm\.components\.(core|content|config)</artifactId>\s*<version>2\.(1?[0-9])\.</version>
```

#### Detect — Good Pattern
- Core Components 2.20+

---

### AEMCS-DEP-006: Using Deprecated Commons-Lang 2.x

- **Severity**: Medium
- **Description**: Apache Commons Lang 2.x (`commons-lang`) is superseded by 3.x (`commons-lang3`). The 2.x line no longer receives updates. Use `org.apache.commons.lang3` package.

#### Detect — Files to Scan
```
**/pom.xml
core/src/main/java/**/*.java
```

#### Detect — Bad Pattern
```regex
<artifactId>commons-lang</artifactId>|import\s+org\.apache\.commons\.lang\.\w+
```

#### Detect — Good Pattern
```regex
<artifactId>commons-lang3</artifactId>|import\s+org\.apache\.commons\.lang3\.\w+
```

#### Bad Example
```xml
<dependency>
    <groupId>commons-lang</groupId>
    <artifactId>commons-lang</artifactId>
    <version>2.6</version>
</dependency>
```

#### Good Example
```xml
<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-lang3</artifactId>
    <version>3.14.0</version>
</dependency>
```

---

### AEMCS-DEP-007: JUnit 4 Instead of JUnit 5

- **Severity**: Low
- **Description**: JUnit 4 is in maintenance mode. JUnit 5 (Jupiter) offers better parameterized tests, nested test classes, and AEM-specific extensions (AemContext via wcm.io). New tests should use JUnit 5.

#### Detect — Files to Scan
```
**/pom.xml
core/src/test/java/**/*.java
```

#### Detect — Bad Pattern
```regex
import\s+org\.junit\.(Test|Before|After|Assert)|<artifactId>junit</artifactId>\s*<version>4\.
```

#### Detect — Good Pattern
```regex
import\s+org\.junit\.jupiter|<artifactId>junit-jupiter</artifactId>
```
    @Override
    public void run() {
        // This will execute on EVERY instance, causing duplicate API calls
        externalApi.syncData();
    }
}
```

#### Good Example
```java
@Component(
    service = Runnable.class,
    property = {
        "scheduler.expression=0 0 * * * ?",
        "scheduler.concurrent:Boolean=false",
        "scheduler.runOn=LEADER"  // Only runs on leader instance
    }
)
public class DataSyncTask implements Runnable {
    @Override
    public void run() {
        externalApi.syncData();
    }
}
```

#### False Positives
- Tasks that are intentionally idempotent and safe to run on all instances (cache warmup, local cleanup)
- Tasks that already check leadership programmatically

#### Related Rules
- `AEMCS-PERF-001` (async processing — schedulers are a form of async)

---

## Frontend Framework Rules (ui.frontend SPA)

---

### AEMCS-FE-001: Frontend Framework Detection & Audit Scope

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

### AEMCS-FE-002: Heavy Library Dependency

- **Severity**: Medium
- **Description**: Large libraries (moment.js, lodash full, jQuery, underscore) in `ui.frontend` dependencies bloat the final bundle compiled into AEM client libraries. On AEMaaCS with CDN, large bundles still hurt initial page load and Core Web Vitals (LCP/FID).

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

### AEMCS-FE-003: Missing Frontend Test Framework

- **Severity**: High
- **Description**: AEM `ui.frontend` projects with SPA frameworks must have unit and component testing. Frontend code without tests has high regression risk, especially when bundled output is deployed as AEM clientlibs via Cloud Manager pipelines.

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

### AEMCS-FE-004: React — Missing Key in List Rendering

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

### AEMCS-FE-005: React — useEffect Without Dependency Array

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

### AEMCS-FE-006: React — dangerouslySetInnerHTML Without Sanitization

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

### AEMCS-FE-007: Angular — Observable Without Unsubscribe

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

### AEMCS-FE-008: Angular — *ngFor Without trackBy

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

### AEMCS-FE-009: Vue — v-for Without :key

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

### AEMCS-FE-010: Vue — v-html Without Sanitization (XSS)

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

### AEMCS-FE-011: Direct DOM Manipulation in SPA Framework

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

### AEMCS-FE-012: Hardcoded Environment URLs in Frontend

- **Severity**: High
- **Description**: Hardcoded URLs with environment identifiers (localhost, dev, stage, prod) in frontend source code break across AEM environments. On AEMaaCS, Cloud Manager promotes the same artifact across dev→stage→prod, so hardcoded URLs will be wrong in higher environments.

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

### AEMCS-FE-013: Secrets in Frontend Code

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