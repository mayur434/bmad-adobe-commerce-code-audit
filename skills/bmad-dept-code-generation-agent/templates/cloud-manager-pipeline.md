# Cloud Manager Pipeline Configuration Template

## Full-Stack Pipeline

```yaml
# .cloudmanager/pipeline.yaml
kind: "CI/CD Pipeline"
version: 1
pipeline:
  name: "${PROJECT_NAME} - Full Stack"
  type: "fullStack"
  trigger: "ON_COMMIT"
  
  buildConfig:
    mavenVersion: "3.9.6"
    javaVersion: "11"
    nodeVersion: "20"
    
  qualityGates:
    codeQuality: true
    securityTesting: true
    performanceTesting: true
    
  environments:
    dev:
      branch: "develop"
      autoTrigger: true
    staging:
      branch: "main"
      autoTrigger: false
      approvalRequired: true
    production:
      branch: "main"
      autoTrigger: false
      approvalRequired: true
```

## Frontend-Only Pipeline

```yaml
kind: "CI/CD Pipeline"
version: 1
pipeline:
  name: "${PROJECT_NAME} - Frontend"
  type: "frontEnd"
  trigger: "ON_COMMIT"
  
  buildConfig:
    nodeVersion: "20"
    artifactPath: "ui.frontend"
    
  environments:
    dev:
      branch: "develop"
      autoTrigger: true
```

## Config Pipeline

```yaml
kind: "CI/CD Pipeline"
version: 1
pipeline:
  name: "${PROJECT_NAME} - Config"
  type: "configOnly"
  trigger: "MANUAL"
  
  scope:
    - dispatcher
    - cdn
```

## Environment Variables Template

```
# .cloudmanager/env-variables.yaml
variables:
  - name: "AEM_PROXY_HOST"
    type: "environmentVariable"
    value: ""
    
  - name: "API_KEY"
    type: "secretEnvironmentVariable"
    value: ""

  - name: "CDN_DOMAIN"
    type: "environmentVariable"  
    value: ""
```
