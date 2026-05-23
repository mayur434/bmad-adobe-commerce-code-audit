# Content Fragment Model Generation Template

## Model Definition

**Location:** `ui.content/src/main/content/jcr_root/conf/{project}/settings/dam/cfm/models/{model-name}/`

### .content.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
          xmlns:cq="http://www.day.com/jcr/cq/1.0"
          xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="cq:Template"
    jcr:title="{{MODEL_TITLE}}"
    jcr:description="{{MODEL_DESCRIPTION}}"
    ranking="{Long}100"
    allowedPaths="[/content/dam/{{PROJECT}}(/.*)?]">
    <jcr:content
        jcr:primaryType="nt:unstructured"
        sling:resourceType="dam/cfm/models/console/components/data/entity/default"
        dataTypesConfig="/mnt/overlay/settings/dam/cfm/models/formbuilderconfig/datatypes"
        name="{{MODEL_TITLE}}">
        <model
            jcr:primaryType="nt:unstructured"
            dataTypesConfig="/mnt/overlay/settings/dam/cfm/models/formbuilderconfig/datatypes"
            name="{{MODEL_TITLE}}">
            <items jcr:primaryType="nt:unstructured">
                <!-- Fields defined below -->
            </items>
        </model>
    </jcr:content>
</jcr:root>
```

## Field Type Templates

### Single-Line Text

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="text-single"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="textfield"
    required="{{Boolean}}"
    valueType="string"/>
```

### Multi-Line Text (Rich Text)

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="text-multi"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="textarea"
    valueType="string"
    showProperties="[paragraphs,lists,alignment,links]"/>
```

### Number

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="number"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="number"
    valueType="double"/>
```

### Boolean

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="boolean"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="checkbox"
    valueType="boolean"/>
```

### Date and Time

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="date-time"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="date-time"
    valueType="calendar"/>
```

### Enumeration (Dropdown)

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="enumeration"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="dropdown"
    valueType="string[]">
    <options jcr:primaryType="nt:unstructured">
        <option1 jcr:primaryType="nt:unstructured" value="value1" label="Label 1"/>
        <option2 jcr:primaryType="nt:unstructured" value="value2" label="Label 2"/>
    </options>
</{{FIELD_NAME}}>
```

### Content Reference (Path picker)

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="reference"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="reference"
    valueType="string"
    rootPath="/content/dam/{{PROJECT}}"/>
```

### Fragment Reference

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="fragment-reference"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="fragment-reference"
    valueType="string"
    fragmentmodelpath="/conf/{{PROJECT}}/settings/dam/cfm/models/{{REFERENCED_MODEL}}"
    rootPath="/content/dam/{{PROJECT}}"/>
```

### JSON Object

```xml
<{{FIELD_NAME}}
    jcr:primaryType="nt:unstructured"
    name="{{fieldName}}"
    metaType="json"
    cfm-element="{{fieldName}}"
    fieldLabel="{{Field Label}}"
    renderType="textarea"
    valueType="string"/>
```

## GraphQL Considerations

When generating CF models, ensure field names are:
- camelCase (GraphQL convention)
- No special characters
- Unique within the model
- Descriptive for API consumers

The model automatically exposes via AEM's GraphQL endpoint at:
```
/content/cq:graphql/{project}/endpoint.json
```
