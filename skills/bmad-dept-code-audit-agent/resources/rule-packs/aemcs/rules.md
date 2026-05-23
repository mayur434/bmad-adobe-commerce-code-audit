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