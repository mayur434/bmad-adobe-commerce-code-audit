/**
 * Security Scans for AEM Projects
 * Detects: XSS, SSRF, credential exposure, admin sessions, insecure deserialization,
 * missing CSRF protection, path traversal, SQL injection, input validation
 */
import { ScanContext } from './types';

export function scanSecurity(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of java) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Admin session usage (deprecated and insecure)
    for (const hit of ctx.grep(f, /getAdministrativeResourceResolver|loginAdministrative/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Using Admin Session (Banned Since AEM 6.2)',
        'getAdministrativeResourceResolver() gives FULL access to the entire JCR — it bypasses all permissions. If an attacker reaches this code path, they can read/write/delete ANY content.',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Replace with getServiceResourceResolver(Map.of("sling.service.subservice", "your-service-name")). Then add a service user mapping in your repo-init script with only the permissions this code actually needs.', 'Medium',
        'Any vulnerability in this servlet becomes full repository access for attackers. Adobe marks this as a Cloud Service blocker.', 'Verified',
        'This API was deprecated in AEM 6.2 and removed in AEM as a Cloud Service — your code will not deploy to AEMaaCS');
    }

    // SSRF - URL from request used in HTTP call
    for (const hit of ctx.grep(f, /request\.getParameter\([^)]+\)|getRequestParameter\([^)]+\)/)) {
      const surrounding = content.split('\n').slice(hit.lineNum - 1, hit.lineNum + 15).join('\n');
      if (/URL|HttpClient|HttpURLConnection|openConnection|fetch/.test(surrounding)) {
        ctx.add('Security', mod, f, hit.lineNum,
          'User Input Used in HTTP Request (SSRF Risk)',
          'A URL or hostname from the request parameter is passed to an HTTP client. An attacker can make YOUR server call internal services (http://localhost:4502/crx/de, AWS metadata endpoint, etc).',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Create a whitelist of allowed hostnames/URL prefixes. Validate the URL before making the request: reject private IPs (10.x, 172.16.x, 192.168.x, 127.0.0.1) and non-HTTP schemes.', 'High',
          'Attacker can scan your internal network, read cloud metadata (AWS keys), or access admin consoles that are only available internally', 'Verified',
          'User-controlled input is directly used in a server-side HTTP request without any URL validation');
      }
    }

    // XSS - Response writer with user input
    for (const hit of ctx.grep(f, /response\.getWriter\(\)\.(?:write|print|println)\s*\(/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 5), hit.lineNum + 1).join('\n');
      if (/getParameter|getRequestParameter|getHeader/.test(surrounding)) {
        ctx.add('Security', mod, f, hit.lineNum,
          'User Input Written to Response Without Encoding (XSS)',
          'Data from request.getParameter() is written directly to the HTTP response. If a user puts <script>alert(1)</script> in the URL, it executes in every visitor\'s browser.',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Encode before writing: response.getWriter().write(xssAPI.encodeForHTML(userInput)). Inject XSSAPI via @Reference or @OSGiService annotation.', 'Medium',
          'Attackers can steal user sessions, redirect to phishing sites, or deface pages by crafting malicious URLs shared via email/social media', 'Verified',
          'User-controlled request parameter flows directly to response writer without HTML encoding');
      }
    }

    // Missing XSSAPI usage with user input (skip test files, skip when param is used only for logic)
    for (const hit of ctx.grep(f, /request\.getParameter\s*\(/)) {
      if (f.includes('/test/') || f.includes('Test.java')) continue;
      const surrounding = content.split('\n').slice(hit.lineNum - 1, Math.min(content.split('\n').length, hit.lineNum + 10)).join('\n');
      // Only flag if the parameter might reach output (response, model, attribute)
      const reachesOutput = /response|writer|model|setAttribute|request\.setAttribute|setProperty|put\(/.test(surrounding);
      if (!surrounding.includes('xssAPI') && !surrounding.includes('XSSAPI') &&
          !surrounding.includes('encodeForHTML') && !surrounding.includes('filterHTML') && reachesOutput) {
        ctx.add('Security', mod, f, hit.lineNum,
          'Request Parameter Used Without XSS Sanitization',
          'request.getParameter() is called and the value appears to reach output (response, model, or attribute) without XSSAPI encoding. If this value ends up in HTML, it\'s an XSS vulnerability.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add @Reference XSSAPI xssApi; then sanitize: String safe = xssApi.encodeForHTML(request.getParameter("param")). Do this for EVERY request parameter that reaches output.', 'Medium',
          'If this parameter value reaches any HTML output without encoding, attackers can inject JavaScript into your pages',
          'Needs Review', 'Verify the parameter value actually reaches HTML/JSON output. If used only for internal logic (e.g., page number, sort order with validation), this may be safe');
      }
    }

    // Hardcoded credentials (skip obvious non-secrets: property names, field refs, placeholders, tests)
    for (const hit of ctx.grep(f, /(?:password|passwd|secret|apikey|api_key|token)\s*=\s*"[^"]{3,}"/i)) {
      const value = hit.lineText.match(/=\s*"([^"]+)"/)?.[1] || '';
      // Skip known false positives: placeholder values, property key names, test fixtures, OSGi config keys
      const isFalsePositive = /^(changeme|password|test|TODO|xxx|placeholder|\$\{|your-|example|dummy)/i.test(value) ||
        hit.lineText.includes('getProperty') || hit.lineText.includes('put("') ||
        hit.lineText.includes('PROPERTY_') || hit.lineText.includes('_KEY') ||
        hit.lineText.includes('@Property') || f.includes('/test/') || f.includes('Test.java');
      if (!isFalsePositive) {
        ctx.add('Security', mod, f, hit.lineNum,
          'Password/Secret Hardcoded in Source Code',
          'A password, API key, or secret token appears to be hardcoded as a string literal. Anyone with repo access (including CI/CD logs) can see this credential.',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Move to OSGi configuration with crypto support, AEM\'s Cloud Manager secret variables, or an external vault (Azure Key Vault, AWS Secrets Manager). Never commit secrets to Git.', 'Medium',
          'Exposed credentials can be used to access external APIs, databases, or admin interfaces. Git history preserves them even after deletion.', 'Needs Review',
          'Verify this is an actual secret and not a property key name, config reference, or test placeholder');
      }
    }

    // Insecure deserialization
    for (const hit of ctx.grep(f, /ObjectInputStream|readObject\(\)|XMLDecoder/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Java Deserialization (Remote Code Execution Risk)',
        'ObjectInputStream.readObject() can execute arbitrary code if an attacker controls the input bytes. This is the same vulnerability class that caused the Equifax breach.',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Replace with JSON (Jackson/Gson) or XML parsing. If you MUST deserialize Java objects, use Apache ValidatingObjectInputStream with an explicit class whitelist.', 'High',
        'An attacker who can send crafted bytes to this endpoint gets full server control (run commands, read files, pivot to internal systems)', 'Verified',
        'Java deserialization of untrusted data is consistently rated as one of the most dangerous vulnerabilities (OWASP A8)');
    }

    // Path traversal
    for (const hit of ctx.grep(f, /getParameter.*(?:File|Path|\.resolve|Paths\.get)/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'User Input in File Path (Path Traversal)',
        'A request parameter is used to build a file path. An attacker can use "../" sequences to read files outside the intended directory (e.g., /etc/passwd, config files).',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Validate the path: reject any input containing ".." or starting with "/". Use Path.normalize() and verify the result still starts with your allowed base directory.', 'Medium',
        'Attackers can read sensitive server files, configuration with credentials, or other users\' content', 'Needs Review',
        'Request parameter flows into file/path operations — verify if path validation exists elsewhere in the call chain');
    }

    // CSRF - POST servlet without sling referrer filter check
    if (content.includes('@SlingServlet') || content.includes('service = Servlet.class')) {
      if (content.includes('doPost') && !content.includes('CSRF') && !content.includes('csrf') && !content.includes('@:sym:check')) {
        for (const hit of ctx.grep(f, /(?:void|protected)\s+doPost\s*\(/)) {
          ctx.add('Security', mod, f, hit.lineNum,
            'POST Servlet Without CSRF Token Check',
            'This servlet accepts POST requests but doesn\'t validate a CSRF token. An attacker can trick a logged-in author into submitting a hidden form that calls YOUR servlet.',
            ctx.context(f, hit.lineNum), 'HIGH',
            'Enable the Apache Sling Referrer Filter (blocks cross-origin POSTs) OR add manual CSRF token validation. In HTL forms, use <input type="hidden" name=":cq_csrf_token" value="${csrf.token}">.', 'Medium',
            'Attackers can make authors unknowingly trigger actions (delete content, change configs, create users) by visiting a malicious webpage');
        }
      }
    }

    // SQL Injection (if using JDBC directly)
    for (const hit of ctx.grep(f, /Statement\.execute(?:Query|Update)\s*\(.*\+/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'SQL Built With String Concatenation (SQL Injection)',
        'SQL query is built by concatenating strings (possibly including user input). An attacker can inject SQL commands like \'; DROP TABLE users; --\' to steal or destroy data.',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Use PreparedStatement with ? placeholders: stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?"); stmt.setString(1, userId);. NEVER build SQL with + operator.', 'Medium',
        'Complete database compromise — attackers can read all data, modify records, or delete tables', 'Verified',
        'String concatenation in SQL statements means user input becomes part of the SQL command structure');
    }

    // Weak cryptography (distinguish security use from non-security use like checksums/etags)
    for (const hit of ctx.grep(f, /(?:MD5|SHA1|DES|RC4|getInstance\("(?:MD5|SHA-1|DES)")/)) {
      // Check if used for non-security purposes (content hash, etag, checksum, fingerprint)
      const context = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum + 3).join('\n');
      const isNonSecurityUse = /checksum|etag|fingerprint|cache.?key|content.?hash|digest.*file|file.*digest/i.test(context);
      const severity = isNonSecurityUse ? 'LOW' : 'HIGH';
      const desc = isNonSecurityUse
        ? 'MD5/SHA-1 used for non-security purpose (checksum/etag). While not a security risk here, consider SHA-256 for consistency.'
        : 'MD5 and SHA-1 have known collision attacks — they can be cracked in seconds. DES/RC4 use tiny key sizes. Using these means your "encrypted" data isn\'t actually secure.';
      ctx.add('Security', mod, f, hit.lineNum,
        isNonSecurityUse ? 'Weak Hash for Checksum (Low Risk)' : 'Broken Cryptographic Algorithm (MD5/SHA1/DES)',
        desc,
        ctx.context(f, hit.lineNum), severity,
        'Replace with: SHA-256 or SHA-3 for hashing, AES-256-GCM for encryption, bcrypt/Argon2 for passwords. Example: MessageDigest.getInstance("SHA-256")', 'Medium',
        isNonSecurityUse ? 'No immediate security risk since not used for security. Consider upgrading for best practice.' : 'Password hashes can be reversed, encrypted data can be decrypted by attackers, digital signatures can be forged');
    }

    // Open redirect
    for (const hit of ctx.grep(f, /sendRedirect\s*\(.*getParameter/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Redirect URL From User Input (Open Redirect)',
        'The redirect target comes from a request parameter. An attacker can craft a link like yoursite.com/redirect?url=evil.com that appears legitimate but sends users to a phishing page.',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Only allow relative paths (no http:// prefix) OR validate against a whitelist of allowed domains. Example: if (!url.startsWith("/")) { throw new IllegalArgumentException(); }', 'Medium',
        'Users trust your domain in the link and click it, but end up on a fake login page that steals their credentials');
    }

    // Verbose error messages
    for (const hit of ctx.grep(f, /response\.(?:getWriter|getOutputStream)\(\).*(?:getMessage|getStackTrace|toString)/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Stack Trace / Error Details Sent to Browser',
        'Exception details (class names, file paths, line numbers) are being written to the HTTP response. This tells attackers exactly what technology and version you\'re running.',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Return a generic error message to the user ("Something went wrong"). Log the full stack trace server-side only: LOG.error("Processing failed", e);', 'Low',
        'Attackers use exposed class names, paths, and versions to find known vulnerabilities specific to your stack');
    }
  }

  // HTL Security
  for (const f of htl) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Unescaped output in HTL (@ context='unsafe' or @ context='html')
    for (const hit of ctx.grep(f, /\$\{.*@\s*context\s*=\s*'unsafe'/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'HTL context=\'unsafe\' Disables ALL XSS Protection',
        "context='unsafe' tells HTL to output the value with ZERO encoding. If this value comes from user input, content authors, or any external source, it's a direct XSS vulnerability.",
        ctx.context(f, hit.lineNum), 'CRITICAL',
        "Remove context='unsafe'. Use the correct context for your use case: context='html' for rich text, context='uri' for links, context='attribute' for HTML attributes. HTL's default context is usually correct.", 'Medium',
        'Any JavaScript in this value will execute in visitors\' browsers — can steal sessions, redirect users, or inject malicious content into your pages', 'Verified',
        'context=unsafe completely bypasses the HTL XSS protection framework that normally auto-encodes output');
    }

    // data-sly-attribute with unescaped URL
    for (const hit of ctx.grep(f, /data-sly-attribute\.(?:href|src|action)\s*=\s*"\$\{[^}]*@\s*context\s*=\s*'uri'/)) {
      // This is actually correct usage - skip
    }

    // Missing context specification for URLs
    for (const hit of ctx.grep(f, /(?:href|src|action)\s*=\s*"\$\{[^}]*(?!@\s*context)[^}]*\}"/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'URL Attribute Without context=\'uri\' in HTL',
        'This href/src/action uses an HTL expression without specifying context=\'uri\'. The default text context won\'t properly encode special URL characters, which could allow javascript: URLs.',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        "Add @ context='uri' to URL attributes: href=\"${model.link @ context='uri'}\". This ensures javascript: and data: schemes are blocked and special characters are URL-encoded.", 'Low');
    }
  }

  // XML Security checks
  for (const f of xml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Check for overly permissive OSGI configs
    if (f.includes('config') && content.includes('filter.scope')) {
      for (const hit of ctx.grep(f, /filter\.pattern.*\.\*/)) {
        ctx.add('Security', mod, f, hit.lineNum,
          'OSGi Filter Pattern Too Broad (Matches Everything)',
          'This filter pattern uses .* which matches ALL requests. Internal servlets, admin endpoints, and debug tools may be unintentionally exposed to the public.',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Replace .* with specific path patterns like /content/mysite/.* or /bin/myservlet. List only the paths this filter actually needs to process.', 'Medium');
      }
    }

    // ACL/rep:policy permissive permissions
    if (content.includes('rep:policy') || content.includes('rep:GrantACE')) {
      for (const hit of ctx.grep(f, /rep:privileges.*jcr:all|allow.*jcr:all/)) {
        ctx.add('Security', mod, f, hit.lineNum,
          'Overly Permissive ACL',
          'Granting jcr:all permission — violates principle of least privilege',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Grant only required permissions (jcr:read, jcr:write, etc). Never use jcr:all in production.', 'Medium',
          'Privilege escalation');
      }
    }
  }
}
