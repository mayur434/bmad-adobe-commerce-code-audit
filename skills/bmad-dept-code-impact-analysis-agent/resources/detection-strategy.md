# Impact Analysis — Detection Strategy

## Dependency Resolution

Platform-specific dependency chain resolution:

### Commerce (Magento 2)
- `di.xml` preference/type overrides
- Plugin (interceptor) chains
- Observer event subscriptions
- Layout XML block references
- GraphQL schema dependencies
- Cron schedule interactions

### AEM (AEMaaCS)
- Sling Resource Type inheritance
- OSGi service references (SCR)
- Content model dependencies
- Workflow step chains
- Dispatcher mapping impacts

### EDS
- Block import chains
- Shared script dependencies
- CSS cascade impacts

## Blast Radius Scoring

| Factor | Weight |
|--------|--------|
| Direct dependents | 3x |
| Indirect dependents (2+ hops) | 1x |
| Public API surface | 5x |
| Config-only impact | 0.5x |
