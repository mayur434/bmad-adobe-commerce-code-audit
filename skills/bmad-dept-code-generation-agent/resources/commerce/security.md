# Adobe Commerce — Security Patterns

All generated Commerce code MUST comply with these security rules.

---

## Input Validation

### Request Parameters
```php
// CORRECT: Use typed request methods
$id = (int)$this->getRequest()->getParam('id');
$name = $this->getRequest()->getParam('name', '');

// For API endpoints: use @param type annotations on interface methods
// Framework auto-validates types from webapi.xml

// NEVER: trust raw input
// $data = $_POST['data']; // FORBIDDEN
```

### Data Sanitization
- Validate all user input at the controller/API boundary
- Use PHP type casting (`(int)`, `(float)`, `(bool)`) for known types
- Use `\Magento\Framework\Filter\FilterInput` for complex input
- Use `\Magento\Framework\Validator\DataObject` for entity validation
- Whitelist expected fields — never persist arbitrary request arrays

---

## XSS Prevention

### Template Output Escaping
```php
// ALWAYS escape in .phtml templates:
<?= $escaper->escapeHtml($value) ?>           // Default — HTML entities
<?= $escaper->escapeUrl($url) ?>              // URL context
<?= $escaper->escapeJs($jsValue) ?>           // JavaScript context
<?= $escaper->escapeHtmlAttr($attribute) ?>   // HTML attribute context
<?= $escaper->escapeCss($style) ?>            // CSS context

// NEVER: echo unescaped data
// <?= $value ?> // FORBIDDEN in user-facing output
```

### Knockout Templates
```html
<!-- Use `text` binding (auto-escapes) not `html` -->
<span data-bind="text: itemName"></span>

<!-- Only use `html` binding with pre-sanitized server-side content -->
```

### Admin Forms
- All UI Component form fields auto-escape by default
- Never use `innerHTML` or jQuery `.html()` with user data
- Use `$.mage.__()` for translations (auto-escaped)

---

## SQL Injection Prevention

### NEVER use raw SQL with user input
```php
// FORBIDDEN:
$connection->query("SELECT * FROM table WHERE id = " . $id);
$collection->getSelect()->where("name = '$name'");

// CORRECT: Use parameterized queries
$connection->select()
    ->from('table')
    ->where('id = ?', $id);

// CORRECT: Collection filters (auto-parameterized)
$collection->addFieldToFilter('entity_id', ['eq' => $id]);

// CORRECT: Zend_Db_Expr only for safe, static expressions
$connection->select()
    ->from('table')
    ->where('status IN (?)', [1, 2, 3]);
```

---

## CSRF Protection

### Admin Controllers
```php
// Inherit from Magento\Backend\App\Action — provides CSRF token validation
// For custom POST endpoints, validate form_key:
class Save extends \Magento\Backend\App\Action
{
    // Automatically validates form_key for POST requests
    // Override ONLY if you know what you're doing:
    // public function _validateSecretKey() { ... }
}
```

### Frontend Controllers
```php
// For POST actions, implement CsrfAwareActionInterface:
use Magento\Framework\App\CsrfAwareActionInterface;
use Magento\Framework\App\Request\InvalidRequestException;
use Magento\Framework\App\RequestInterface;

class Submit extends \Magento\Framework\App\Action\Action implements CsrfAwareActionInterface
{
    public function createCsrfValidationException(RequestInterface $request): ?InvalidRequestException
    {
        return null; // Return null to use default validation error
    }

    public function validateForCsrf(RequestInterface $request): ?bool
    {
        return null; // null = use default validation
    }
}
```

### AJAX Requests
- Include `form_key` in all AJAX POST/PUT/DELETE requests
- Get via `$.mage.cookies.get('form_key')` or `window.FORM_KEY`

---

## ACL (Access Control)

### Define Resources
```xml
<!-- etc/acl.xml -->
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:framework:Acl/etc/acl.xsd">
    <acl>
        <resources>
            <resource id="Magento_Backend::admin">
                <resource id="{Vendor}_{Module}::top_level" title="Module Name">
                    <resource id="{Vendor}_{Module}::{entity}_view" title="View Entity"/>
                    <resource id="{Vendor}_{Module}::{entity}_manage" title="Manage Entity"/>
                    <resource id="{Vendor}_{Module}::{entity}_delete" title="Delete Entity"/>
                </resource>
            </resource>
        </resources>
    </acl>
</config>
```

### Enforce in Controllers
```php
// ADMIN_RESOURCE constant checked by _isAllowed()
public const ADMIN_RESOURCE = '{Vendor}_{Module}::{entity}_manage';
```

### Enforce in Web API
```xml
<!-- webapi.xml: resource ref must match acl.xml resource id -->
<resources>
    <resource ref="{Vendor}_{Module}::{entity}_view"/>
</resources>

<!-- For customer-authenticated APIs: -->
<resources>
    <resource ref="self"/>
</resources>

<!-- For anonymous/public APIs: -->
<resources>
    <resource ref="anonymous"/>
</resources>
```

### GraphQL Authorization
```php
// Check in resolver before accessing data:
if (false === $context->getExtensionAttributes()->getIsCustomer()) {
    throw new GraphQlAuthorizationException(__('Not authorized.'));
}
```

---

## File Upload Security

```php
// ALWAYS use Magento's uploader — never move_uploaded_file() directly
use Magento\MediaStorage\Model\File\UploaderFactory;

$uploader = $this->uploaderFactory->create(['fileId' => 'file_field']);
$uploader->setAllowedExtensions(['jpg', 'png', 'gif', 'pdf']);
$uploader->setAllowRenameFiles(true);
$uploader->setFilesDispersion(false);
$uploader->setAllowCreateFolders(true);

// Validate MIME type (not just extension)
$uploader->addValidateCallback('validate_image', $this->imageValidator, 'validate');

$result = $uploader->save($targetPath);
```

### Rules
- Whitelist allowed extensions explicitly
- Validate MIME type server-side (extensions can be spoofed)
- Never allow PHP/PHTML file uploads
- Store outside webroot when possible
- Use `pub/media/` with `.htaccess` protection for public files

---

## Sensitive Data Handling

### Configuration
- Use `<backend_model>Magento\Config\Model\Config\Backend\Encrypted</backend_model>` for API keys/secrets
- Never log sensitive data (API keys, passwords, tokens, PII)
- Use `\Magento\Framework\Encryption\EncryptorInterface` for custom encryption

### Logging
```php
// CORRECT: Redact sensitive fields
$this->logger->debug('API call', ['endpoint' => $url, 'status' => $status]);

// FORBIDDEN: Never log credentials or tokens
// $this->logger->debug('API call', ['token' => $apiKey]); // NEVER
```

---

## Rate Limiting & Abuse Prevention

### For Custom APIs
- Use `\Magento\Framework\App\DeploymentConfig` for rate limit config
- Implement throttling at the service layer, not controller
- Return 429 (Too Many Requests) with Retry-After header

### For Forms
- Use CAPTCHA integration (`\Magento\Captcha\Helper\Data`)
- Implement flood protection for contact forms, reviews, etc.

---

## Dependency Security Rules

| Rule | Enforcement |
|------|-------------|
| No `ObjectManager::getInstance()` | All classes use constructor DI |
| No `new ClassName()` for framework classes | Factory or DI only |
| No `eval()` / `assert()` as function | Never execute dynamic code |
| No `serialize()`/`unserialize()` | Use `\Magento\Framework\Serialize\Serializer\Json` |
| No `exec()`/`shell_exec()`/`system()` | Use `\Magento\Framework\Shell` if absolutely needed |
| No `file_get_contents()` for URLs | Use `\Magento\Framework\HTTP\Client\Curl` |
| No hardcoded secrets | Use env-based encrypted config |
| No debug code in production | Remove `var_dump`, `print_r`, `error_log` |
