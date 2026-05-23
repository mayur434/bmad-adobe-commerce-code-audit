# Impact Analysis

## Dimensions

Each finding is assessed across these impact dimensions:

### 1. Performance Impact
- **Page load time**: Does this issue add latency to user-facing pages?
- **Server resources**: Does it waste CPU, memory, or I/O?
- **CDN/Cache efficiency**: Does it reduce cache hit ratios?
- **Scalability**: Does it degrade under load?

### 2. Security Impact
- **Data exposure**: Could sensitive data leak?
- **Authentication/Authorization**: Are access controls weakened?
- **Input validation**: Are injection vectors opened?
- **Dependency risk**: Are vulnerable libraries in use?

### 3. Maintainability Impact
- **Coupling**: Does it create tight coupling between modules?
- **Complexity**: Does it increase cyclomatic complexity unnecessarily?
- **Testability**: Does it make automated testing harder?
- **Upgrade path**: Will it block platform upgrades?

### 4. Business Impact
- **Revenue**: Could this cause lost transactions or conversions?
- **SEO**: Does it harm search engine visibility?
- **Compliance**: Does it violate GDPR, PCI-DSS, or accessibility standards?
- **Brand**: Could it cause visible defects harming reputation?

## Blast Radius Assessment

| Radius | Description | Factor |
|--------|-------------|--------|
| Isolated | Single component/page affected | 0.1 |
| Module | Entire module/feature affected | 0.3 |
| Section | Site section or user flow affected | 0.5 |
| Site-wide | All pages or all users affected | 0.8 |
| Cross-system | External systems or integrations affected | 1.0 |

## Remediation Effort

| Level | Time Estimate | Description |
|-------|---------------|-------------|
| Trivial | < 1 hour | Config change or one-line fix |
| Small | 1-4 hours | Localized code change |
| Medium | 1-2 days | Multi-file refactor |
| Large | 3-5 days | Architectural change needed |
| Epic | > 1 week | Fundamental rework required |
