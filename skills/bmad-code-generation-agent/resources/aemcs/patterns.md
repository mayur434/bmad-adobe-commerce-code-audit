# AEMaaCS Code Generation — Best Practices & Patterns

## Project Archetype Standards

All generated code must follow the AEM Project Archetype structure:

```
aem-project/
├── core/                    # Java bundle (Sling Models, OSGi Services, Servlets)
├── ui.apps/                 # Components (/apps)
├── ui.content/              # Mutable content (/content, /conf)
├── ui.config/               # OSGi configs
├── ui.frontend/             # Frontend module (webpack/vite)
├── ui.tests/                # Integration tests
├── dispatcher/              # Dispatcher SDK configs
└── all/                     # Embed package (assembles everything)
```

---

## Sling Model Patterns

### Standard Model (ValueMap injection)

```java
package {base.package}.models;

import org.apache.sling.api.resource.Resource;
import org.apache.sling.models.annotations.DefaultInjectionStrategy;
import org.apache.sling.models.annotations.Model;
import org.apache.sling.models.annotations.injectorspecific.ValueMapValue;

@Model(
    adaptables = Resource.class,
    defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL
)
public class {ModelName} {

    @ValueMapValue
    private String title;

    @ValueMapValue
    private String description;

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }
}
```

### Interface-based Model (for testability)

```java
// Interface
package {base.package}.models;

public interface {ModelName} {
    String getTitle();
    String getDescription();
}

// Implementation
package {base.package}.models.impl;

import {base.package}.models.{ModelName};
import org.apache.sling.api.SlingHttpServletRequest;
import org.apache.sling.models.annotations.*;
import org.apache.sling.models.annotations.injectorspecific.ValueMapValue;

@Model(
    adaptables = SlingHttpServletRequest.class,
    adapters = {ModelName}.class,
    resourceType = {ModelName}Impl.RESOURCE_TYPE,
    defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL
)
public class {ModelName}Impl implements {ModelName} {

    protected static final String RESOURCE_TYPE = "{project}/components/{component-name}";

    @ValueMapValue
    private String title;

    @ValueMapValue
    private String description;

    @Override
    public String getTitle() {
        return title;
    }

    @Override
    public String getDescription() {
        return description;
    }
}
```

### Model with ChildResource and PostConstruct

```java
@Model(adaptables = Resource.class, defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL)
public class {ModelName} {

    @ChildResource
    private List<Resource> items;

    @ValueMapValue
    private String layout;

    private List<ItemModel> processedItems;

    @PostConstruct
    protected void init() {
        processedItems = Optional.ofNullable(items).orElse(Collections.emptyList())
            .stream()
            .map(r -> r.adaptTo(ItemModel.class))
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
    }

    public List<ItemModel> getItems() {
        return Collections.unmodifiableList(processedItems);
    }
}
```

---

## HTL Template Patterns

### Component HTML

```html
<sly data-sly-use.model="com.{project}.core.models.{ModelName}"/>
<div class="cmp-{component-name}"
     data-cmp-is="{component-name}">
    <sly data-sly-test="${model.title}">
        <h2 class="cmp-{component-name}__title">${model.title}</h2>
    </sly>
    <sly data-sly-test="${model.description}">
        <div class="cmp-{component-name}__description">${model.description @ context='html'}</div>
    </sly>
</div>
```

### Component with List Iteration

```html
<sly data-sly-use.model="com.{project}.core.models.{ModelName}"/>
<div class="cmp-{component-name}" data-sly-test="${model.items.size > 0}">
    <ul class="cmp-{component-name}__list">
        <sly data-sly-list.item="${model.items}">
            <li class="cmp-{component-name}__item">
                <span class="cmp-{component-name}__item-title">${item.title}</span>
            </li>
        </sly>
    </ul>
</div>
```

---

## Touch UI Dialog Patterns

### Basic Dialog

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
          xmlns:granite="http://www.adobe.com/jcr/granite/1.0"
          xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
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
                            <title
                                jcr:primaryType="nt:unstructured"
                                sling:resourceType="granite/ui/components/coral/foundation/form/textfield"
                                fieldLabel="Title"
                                name="./title"
                                required="{Boolean}true"/>
                            <description
                                jcr:primaryType="nt:unstructured"
                                sling:resourceType="granite/ui/components/coral/foundation/form/textarea"
                                fieldLabel="Description"
                                name="./description"/>
                        </items>
                    </properties>
                </items>
            </tabs>
        </items>
    </content>
</jcr:root>
```

---

## OSGi Service Patterns

### Configurable Service

```java
// Interface
package {base.package}.services;

public interface {ServiceName} {
    String process(String input);
}

// Implementation
package {base.package}.services.impl;

import {base.package}.services.{ServiceName};
import org.osgi.service.component.annotations.*;
import org.osgi.service.metatype.annotations.*;

@Component(service = {ServiceName}.class, immediate = true)
@Designate(ocd = {ServiceName}Impl.Config.class)
public class {ServiceName}Impl implements {ServiceName} {

    @ObjectClassDefinition(name = "{Service Display Name}")
    @interface Config {
        @AttributeDefinition(name = "Enabled", description = "Enable/disable the service")
        boolean enabled() default true;

        @AttributeDefinition(name = "API Endpoint")
        String apiEndpoint() default "";
    }

    private Config config;

    @Activate
    @Modified
    protected void activate(Config config) {
        this.config = config;
    }

    @Override
    public String process(String input) {
        if (!config.enabled()) {
            return input;
        }
        // Implementation here
        return input;
    }
}
```

### OSGi Config File

**Location:** `ui.config/src/main/content/jcr_root/apps/{project}/osgiconfig/config/`

**Filename:** `{base.package}.services.impl.{ServiceName}Impl.cfg.json`

```json
{
    "enabled": true,
    "apiEndpoint": ""
}
```

---

## Component Node Definition

### .content.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
    jcr:primaryType="cq:Component"
    jcr:title="{Component Title}"
    jcr:description="{Component description}"
    componentGroup="{Project} - Content"
    sling:resourceSuperType="core/wcm/components/commons/editor/dialog"/>
```

---

## Unit Test Pattern (AEM Mocks)

```java
package {base.package}.models;

import io.wcm.testing.mock.aem.junit5.AemContext;
import io.wcm.testing.mock.aem.junit5.AemContextExtension;
import org.apache.sling.testing.mock.sling.ResourceResolverType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(AemContextExtension.class)
class {ModelName}Test {

    private final AemContext ctx = new AemContext(ResourceResolverType.JCR_MOCK);

    private {ModelName} model;

    @BeforeEach
    void setUp() {
        ctx.addModelsForClasses({ModelName}.class);
        ctx.load().json("/com/{project}/models/{ModelName}Test.json", "/content/test");
        ctx.currentResource("/content/test/component");
        model = ctx.request().adaptTo({ModelName}.class);
    }

    @Test
    void testGetTitle() {
        assertEquals("Test Title", model.getTitle());
    }

    @Test
    void testGetDescription() {
        assertEquals("Test Description", model.getDescription());
    }

    @Test
    void testNullValues() {
        ctx.currentResource("/content/test/empty-component");
        {ModelName} emptyModel = ctx.request().adaptTo({ModelName}.class);
        assertNull(emptyModel.getTitle());
    }
}
```

### Test JSON (mock content)

**Location:** `core/src/test/resources/com/{project}/models/{ModelName}Test.json`

```json
{
    "component": {
        "jcr:primaryType": "nt:unstructured",
        "sling:resourceType": "{project}/components/{component-name}",
        "title": "Test Title",
        "description": "Test Description"
    },
    "empty-component": {
        "jcr:primaryType": "nt:unstructured",
        "sling:resourceType": "{project}/components/{component-name}"
    }
}
```

---

## Dispatcher Config Patterns

### Filter Rule

```
# Allow component-specific paths
/0100 { /type "allow" /method "GET" /url "/content/{project}/*" }
/0101 { /type "deny"  /method "GET" /url "/content/{project}/*/jcr:content/*" /selectors '(infinity|tidy|edit|childrenlist)' }
```

### Cache Rule

```
/rules {
    /0000 { /glob "*" /type "deny" }
    /0001 { /glob "*.html" /type "allow" }
    /0002 { /glob "*.css" /type "allow" }
    /0003 { /glob "*.js" /type "allow" }
    /0004 { /glob "*.json" /type "allow" }
    /0005 { /glob "/content/{project}/*.html" /type "allow" }
}
```

---

## Content Fragment Model Pattern

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:dam="http://www.day.com/dam/1.0"
    jcr:primaryType="cq:Template"
    jcr:title="{Model Title}"
    jcr:description="{Model description}"
    ranking="{Long}100">
    <jcr:content
        jcr:primaryType="dam:ContentFragment"
        cq:model="/conf/{project}/settings/dam/cfm/models/{model-name}"/>
</jcr:root>
```

---

## Naming Conventions

| Artifact | Convention | Example |
|----------|-----------|---------|
| Component folder | kebab-case | `hero-banner` |
| Sling Model class | PascalCase | `HeroBanner` |
| Service interface | PascalCase | `ContentService` |
| Service impl | PascalCase + Impl | `ContentServiceImpl` |
| OSGi config file | FQCN + .cfg.json | `com.mysite.core.services.impl.ContentServiceImpl.cfg.json` |
| HTL variable | camelCase | `data-sly-use.model` |
| CSS class (BEM) | `cmp-{name}__element--modifier` | `cmp-hero-banner__title--large` |
| Test class | PascalCase + Test | `HeroBannerTest` |
| Component group | `{Project} - {Category}` | `MySite - Content` |
