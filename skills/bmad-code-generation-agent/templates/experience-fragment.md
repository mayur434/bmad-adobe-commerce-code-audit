# Experience Fragment Generation Template

## XF Template Structure

**Location:** `ui.content/src/main/content/jcr_root/content/experience-fragments/{project}/`

### Folder .content.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
          xmlns:rep="internal"
          xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="sling:Folder"
    jcr:title="{{PROJECT_TITLE}} Experience Fragments"/>
```

### XF Variation — Web

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
          xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="cq:Page">
    <jcr:content
        jcr:primaryType="cq:PageContent"
        jcr:title="{{XF_TITLE}} - Web"
        sling:resourceType="cq/experience-fragments/components/xfpage"
        cq:xfVariantType="web">
        <root
            jcr:primaryType="nt:unstructured"
            sling:resourceType="wcm/foundation/components/responsivegrid">
            <!-- Components go here -->
        </root>
    </jcr:content>
</jcr:root>
```

### XF Variation — Email

```xml
<jcr:content
    jcr:primaryType="cq:PageContent"
    jcr:title="{{XF_TITLE}} - Email"
    sling:resourceType="cq/experience-fragments/components/xfpage"
    cq:xfVariantType="email">
    <root
        jcr:primaryType="nt:unstructured"
        sling:resourceType="wcm/foundation/components/responsivegrid">
        <!-- Email-safe components only -->
    </root>
</jcr:content>
```

## XF Editable Template

**Location:** `ui.content/src/main/content/jcr_root/conf/{project}/settings/wcm/templates/xf-web-variation/`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
          xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="cq:Template"
    jcr:title="Experience Fragment Web Variation"
    status="enabled"
    allowedPaths="[/content/experience-fragments/{{PROJECT}}(/.*)?]">
    <structure jcr:primaryType="nt:unstructured">
        <jcr:content
            jcr:primaryType="nt:unstructured"
            sling:resourceType="cq/experience-fragments/components/xfpage"/>
    </structure>
</jcr:root>
```
