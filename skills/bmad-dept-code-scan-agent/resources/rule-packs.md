# Scan Agent — Rule Packs

## Commerce Rules

Static analysis rules for Adobe Commerce / Magento 2:

- Security: SQL injection, XSS, CSRF, unsafe deserialization
- Performance: N+1 queries, missing indexes, collection loading in loops
- Deprecated: Removed APIs per version, ObjectManager direct usage
- Architecture: Plugin conflicts, preference overrides, missing DI

## AEM Rules

Static analysis rules for AEM as a Cloud Service:

- Security: Unsafe JCR queries, missing permissions
- Performance: Unbounded queries, large node traversals
- Deprecated: Classic UI components, removed APIs
- Architecture: Mutable content in immutable path

## EDS Rules

Static analysis rules for Edge Delivery Services:

- Security: Client-side injection, unsafe DOM manipulation
- Performance: Render-blocking resources, LCP issues
- Architecture: Block naming violations, missing metadata
