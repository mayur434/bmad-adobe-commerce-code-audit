# Security Rules — Language Vulnerability Reference

This file is read by the AI agent during Tier 2 (LLM) review.
For each file in the diff, load the matching language section and include those rules in the review prompt.
If the language has no section, use the **Default** rules at the bottom.

---

## JavaScript

- XSS via `innerHTML` / `dangerouslySetInnerHTML`
- Prototype pollution
- Insecure `eval()` or `Function()` usage
- Hardcoded secrets or API keys
- Open redirect vulnerabilities
- Insecure deserialization

## JavaScript (React)

- `dangerouslySetInnerHTML` usage
- XSS via user-controlled data
- Exposed sensitive data in props or state
- Client-side secret storage

## TypeScript

- Type casting bypasses (`as any`, `as unknown`)
- XSS vulnerabilities
- Hardcoded secrets
- Insecure type assertions hiding injection points

## TypeScript (React)

- `dangerouslySetInnerHTML` usage
- XSS via user-controlled data
- Exposed sensitive data in props or state

## HTML

- Inline event handlers
- External resource loading from untrusted origins
- Missing Content-Security-Policy hints
- Embedded sensitive data
- Open redirect via meta refresh

## CSS

- CSS injection via user-controlled values
- `url()` loading from external untrusted sources

## SCSS / SASS / LESS

- Dynamic `url()` or `@import` from untrusted sources
- User-controlled values injected into property values

## Java

- SQL injection
- Deserialization vulnerabilities
- Path traversal
- Hardcoded credentials
- Insecure random number generation
- XXE (XML External Entity)
- SSRF vulnerabilities

## Kotlin

- SQL injection
- Hardcoded credentials
- Insecure HTTP (no TLS)
- SSRF vulnerabilities

## Python

- SQL injection
- Command injection via `subprocess` / `os.system`
- `pickle` deserialization
- Path traversal
- Hardcoded secrets
- Insecure use of `eval()` / `exec()`
- SSRF

## Ruby

- SQL injection via string interpolation in ActiveRecord
- Command injection via backticks or `system()`
- Mass assignment vulnerabilities
- Hardcoded credentials

## PHP

- SQL injection
- Remote code execution via `eval()` / `exec()`
- File inclusion vulnerabilities (LFI / RFI)
- XSS
- CSRF
- Hardcoded credentials

## Go

- SQL injection
- Command injection
- Hardcoded credentials
- Insecure HTTP (no TLS)

## Rust

- Unsafe blocks with unchecked pointer arithmetic
- Hardcoded secrets
- Command injection via `std::process::Command`

## C#

- SQL injection
- Deserialization vulnerabilities
- Path traversal
- Hardcoded credentials
- XXE

## C / C++

- Buffer overflows
- Use-after-free
- Format string vulnerabilities
- Hardcoded credentials
- Insecure use of `strcpy`, `gets`, `sprintf`

## Swift

- Hardcoded credentials or API keys
- Insecure data storage (plaintext in UserDefaults / Keychain misuse)
- Unvalidated URL schemes

## Scala / Groovy

- SQL injection
- Hardcoded credentials
- SSRF via HTTP client calls

## SQL

- Dynamic SQL construction (injection risk)
- Missing parameterisation
- Overly permissive grants

## GraphQL

- Introspection enabled in production
- Missing depth / complexity limits
- Exposed sensitive resolver logic

## Shell Script / Bash / Zsh / Fish Shell

- Command injection
- Hardcoded credentials
- Insecure temp file creation
- Unsafe variable expansion

## PowerShell

- Command injection via `Invoke-Expression`
- Hardcoded credentials
- Insecure execution policy bypass

## Environment Config

- Actual secret values committed (not placeholders)
- Production credentials in non-production files
- Overly permissive values

## JSON

- Hardcoded credentials or tokens
- Exposed internal endpoints
- Overly permissive CORS or CSP settings

## YAML

- Hardcoded secrets
- Insecure deserialization (YAML bomb)
- Exposed service credentials
- Overly permissive IAM roles

## TOML

- Hardcoded secrets
- Exposed internal service URLs or credentials

## XML

- XXE injection
- DTD-based attacks
- Hardcoded credentials
- Exposed internal paths

## Terraform (HCL)

- Overly permissive IAM policies
- Public S3 buckets or storage
- Unencrypted storage volumes
- Hardcoded secrets in variables

## Dockerfile

- Running as root
- Hardcoded secrets in `ENV` or `ARG`
- Using `:latest` tags (unpinned images)
- Exposed unnecessary ports

## Docker Compose

- Hardcoded secrets in `environment` blocks
- Exposed ports bound to `0.0.0.0`
- Volumes mounting sensitive host paths

## Nginx Config / Apache Config

- Directory listing enabled
- Overly permissive CORS headers
- Missing security headers (HSTS, X-Frame-Options)
- Exposed internal paths or upstream addresses

## Node.js Package Config

- Deprecated or known-vulnerable dependency versions
- Postinstall scripts that could execute arbitrary code
- Exposed internal registry URLs

## Protocol Buffers

- Missing field validation in generated code patterns
- Sensitive data in required fields without encryption note

## Java Properties

- Hardcoded credentials
- Exposed internal URLs or endpoints

## EJS Template / Handlebars / Pug / Jinja2

- Unescaped user-controlled output leading to XSS
- Server-side template injection

---

## Default

Used when the file language has no specific section above.

- Hardcoded credentials or secrets
- Injection vulnerabilities (SQL, command, template)
- Insecure data handling or storage
- Authentication or authorisation flaws
