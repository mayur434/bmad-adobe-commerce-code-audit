# Severity Model

## Severity Levels

### Critical
- **Score**: 9-10
- **Definition**: Issue that will cause production failure, data loss, security breach, or compliance violation
- **Response**: Must be fixed before deployment
- **Examples**:
  - Hardcoded credentials or secrets
  - SQL injection vectors
  - Broken authentication/authorization
  - Data corruption paths
  - Infinite loops in dispatcher/CDN config

### High
- **Score**: 7-8
- **Definition**: Issue that significantly degrades performance, reliability, or maintainability; violates core platform contracts
- **Response**: Should be fixed in current sprint
- **Examples**:
  - Missing cache invalidation causing stale content
  - N+1 query patterns in Commerce GraphQL resolvers
  - Sling resource resolver leaks in AEM
  - Blocking main thread in EDS critical rendering path
  - Bypassing ACL checks

### Medium
- **Score**: 4-6
- **Definition**: Issue that impacts code quality, introduces tech debt, or violates best practices with moderate risk
- **Response**: Plan to fix within next 2 sprints
- **Examples**:
  - Missing error boundaries in React components
  - Deprecated API usage
  - Oversized bundles without lazy loading
  - Missing Content-Security-Policy headers
  - Hardcoded environment-specific values

### Low
- **Score**: 1-3
- **Definition**: Style violations, minor inefficiencies, or improvement opportunities with minimal production risk
- **Response**: Address opportunistically
- **Examples**:
  - Inconsistent naming conventions
  - Missing JSDoc on public APIs
  - Suboptimal import ordering
  - Verbose code that could be simplified

## Scoring Formula

```
severity_score = base_impact × (1 + blast_radius_factor) × exploitability_factor
```

Where:
- `base_impact`: Core damage potential (1-5)
- `blast_radius_factor`: How many users/systems affected (0.0-1.0)
- `exploitability_factor`: How easy to trigger (0.5-1.0)

Final score is clamped to 1-10 range.
