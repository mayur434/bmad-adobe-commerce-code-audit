# Editable Template Generation Template

## Template Type Definition

**Location:** `ui.content/src/main/content/jcr_root/conf/{project}/settings/wcm/template-types/{template-type-name}/`

### .content.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
    jcr:primaryType="cq:Template"
    jcr:title="{{TEMPLATE_TITLE}}"
    jcr:description="{{TEMPLATE_DESCRIPTION}}"
    ranking="{Long}100">
</jcr:root>
```

## Template Definition

**Location:** `ui.content/src/main/content/jcr_root/conf/{project}/settings/wcm/templates/{template-name}/`

### .content.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
          xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="cq:Template"
    jcr:title="{{TEMPLATE_TITLE}}"
    jcr:description="{{TEMPLATE_DESCRIPTION}}"
    status="enabled"
    allowedPaths="[/content/{{PROJECT}}(/.*)?]">
    
    <!-- Structure: locked components -->
    <structure jcr:primaryType="nt:unstructured">
        <jcr:content
            jcr:primaryType="nt:unstructured"
            sling:resourceType="{{PROJECT}}/components/page">
            <root
                jcr:primaryType="nt:unstructured"
                sling:resourceType="wcm/foundation/components/responsivegrid">
                <cq:responsive jcr:primaryType="nt:unstructured">
                    <default
                        jcr:primaryType="nt:unstructured"
                        width="1200"
                        offset="0"/>
                </cq:responsive>
            </root>
        </jcr:content>
    </structure>
    
    <!-- Initial: default content for new pages -->
    <initial jcr:primaryType="nt:unstructured">
        <jcr:content
            jcr:primaryType="nt:unstructured"
            sling:resourceType="{{PROJECT}}/components/page">
            <root
                jcr:primaryType="nt:unstructured"
                sling:resourceType="wcm/foundation/components/responsivegrid"/>
        </jcr:content>
    </initial>
    
    <!-- Policies: component allowlists -->
    <policies jcr:primaryType="nt:unstructured">
        <jcr:content
            jcr:primaryType="nt:unstructured"
            sling:resourceType="{{PROJECT}}/components/page">
            <root
                jcr:primaryType="nt:unstructured"
                sling:resourceType="wcm/foundation/components/responsivegrid"
                cq:policy="{{PROJECT}}/components/container/policy"/>
        </jcr:content>
    </policies>
</jcr:root>
```

## Policy Definition

**Location:** `ui.content/src/main/content/jcr_root/conf/{project}/settings/wcm/policies/{project}/components/container/`

### policy/.content.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
    jcr:primaryType="nt:unstructured"
    jcr:title="{{PROJECT}} Container Policy"
    sling:resourceType="wcm/core/components/policy/policy"
    components="[{{ALLOWED_COMPONENTS}}]"/>
```

**Typical allowed components:**
```
group:{{Project}} - Content,
group:{{Project}} - Structure,
core/wcm/components/text,
core/wcm/components/image,
core/wcm/components/title,
core/wcm/components/button,
core/wcm/components/teaser,
core/wcm/components/list,
core/wcm/components/separator,
core/wcm/components/experiencefragment
```
