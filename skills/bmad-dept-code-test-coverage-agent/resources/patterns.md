# Test Coverage — Platform Test Patterns

## Adobe Commerce (Magento 2)

### Test Framework
- PHPUnit 9.x / 10.x
- Magento Testing Framework (MTF) for functional tests

### Directory Conventions
```
app/code/Vendor/Module/
├── Test/
│   ├── Unit/         ← PHPUnit unit tests
│   ├── Integration/  ← Integration tests (require DB)
│   └── Mftf/        ← Magento Functional Testing Framework
dev/tests/
├── integration/      ← Cross-module integration tests
├── api-functional/   ← REST/GraphQL API tests
└── static/           ← Static analysis (phpcs, phpmd)
```

### Key Patterns
- Repository classes → test CRUD + search criteria
- Plugins → test before/after/around behavior in isolation
- Observers → test event data handling
- ViewModels → test data transformation logic
- Console commands → test execute() method
- API endpoints → test request/response contract

### Mocking
- `\PHPUnit\Framework\MockObject\MockObject`
- `\Magento\Framework\TestFramework\Unit\Helper\ObjectManager`
- Never mock value objects; always use real instances

---

## AEM as a Cloud Service

### Test Framework
- JUnit 5 (Jupiter)
- AEM Mocks (`io.wcm.testing.aem-mock`)
- Sling Mocks (`org.apache.sling.testing.sling-mock`)
- OSGi Mocks (`org.apache.sling.testing.osgi-mock`)

### Directory Conventions
```
core/
├── src/main/java/com/example/core/
│   └── models/MyModel.java
└── src/test/java/com/example/core/
    └── models/MyModelTest.java
it.tests/        ← Server-side integration tests
ui.tests/        ← Cypress/Playwright UI tests
```

### Key Patterns
- Sling Models → test with AemContext, mock resources
- Servlets → test doGet/doPost with MockSlingHttpServletRequest
- OSGi Services → test with OsgiContext, mock service references
- Workflows → test process() with mock WorkItem
- Schedulers → test run() logic, mock ResourceResolver

### Mocking
- `AemContext` (extends `SlingContext`)
- `context.registerService()` for OSGi references
- `context.load().json()` for content fixtures
- Never use PowerMock; prefer constructor injection

---

## Edge Delivery Services

### Test Framework
- Mocha + Chai (default) or Jest
- jsdom for DOM testing
- sinon for stubs/mocking

### Directory Conventions
```
project/
├── blocks/
│   └── hero/
│       ├── hero.js
│       └── hero.css
├── scripts/
│   └── scripts.js
└── test/
    ├── blocks/
    │   └── hero.test.js
    └── scripts/
        └── scripts.test.js
```

### Key Patterns
- Block decorators → test DOM transformation output
- Lazy-loaded blocks → test async loading behavior
- Fetch wrappers → mock fetch responses
- Event handlers → test event dispatch/handling

### Mocking
- `sinon.stub(window, 'fetch')` or jest `jest.fn()`
- `jsdom` for `document` context
- Custom fixtures for block HTML input

---

## EDS + Commerce

### Additional Patterns
- Dropin components → test render + commerce API integration
- Commerce API calls → mock Adobe Commerce GraphQL responses
- Cart/Checkout flows → test state transitions
- Product listing → test filter/sort behavior with mocked catalog data
