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
        'Administrative Session Usage',
        'Using administrative session — bypasses access control and is deprecated in AEM 6.2+',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Use getServiceResourceResolver() with a dedicated service user. Configure service user mapping in Apache Sling Service User Mapper.', 'Medium',
        'Privilege escalation, access control bypass', 'Verified',
        'Administrative sessions have unrestricted JCR access');
    }

    // SSRF - URL from request used in HTTP call
    for (const hit of ctx.grep(f, /request\.getParameter\([^)]+\)|getRequestParameter\([^)]+\)/)) {
      const surrounding = content.split('\n').slice(hit.lineNum - 1, hit.lineNum + 15).join('\n');
      if (/URL|HttpClient|HttpURLConnection|openConnection|fetch/.test(surrounding)) {
        ctx.add('Security', mod, f, hit.lineNum,
          'Potential SSRF Vulnerability',
          'User-supplied input used in HTTP request — Server-Side Request Forgery risk',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Validate and whitelist allowed URLs/hosts. Never pass raw user input to HTTP clients.', 'High',
          'Internal network access, data exfiltration', 'Verified',
          'CWE-918: User input flows to HTTP request without validation');
      }
    }

    // XSS - Response writer with user input
    for (const hit of ctx.grep(f, /response\.getWriter\(\)\.(?:write|print|println)\s*\(/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 5), hit.lineNum + 1).join('\n');
      if (/getParameter|getRequestParameter|getHeader/.test(surrounding)) {
        ctx.add('Security', mod, f, hit.lineNum,
          'Potential XSS in Servlet Response',
          'Writing to response without encoding — user input may reach output unescaped',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Use XSSAPI.encodeForHTML() or XSSAPI.filterHTML() before writing user input to response.', 'Medium',
          'Cross-site scripting, session hijacking', 'Verified',
          'CWE-79: Unescaped user input in HTTP response');
      }
    }

    // Missing XSSAPI usage with user input
    for (const hit of ctx.grep(f, /request\.getParameter\s*\(/)) {
      const surrounding = content.split('\n').slice(hit.lineNum - 1, Math.min(content.split('\n').length, hit.lineNum + 10)).join('\n');
      if (!surrounding.includes('xssAPI') && !surrounding.includes('XSSAPI') && !surrounding.includes('encodeForHTML') && !surrounding.includes('filterHTML')) {
        ctx.add('Security', mod, f, hit.lineNum,
          'User Input Without XSS Protection',
          'Request parameter accessed without XSSAPI sanitization',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Use @Reference XSSAPI and call encodeForHTML/filterHTML on all user inputs before processing.', 'Medium',
          'XSS vulnerability if value reaches output');
      }
    }

    // Hardcoded credentials
    for (const hit of ctx.grep(f, /(?:password|passwd|secret|apikey|api_key|token)\s*=\s*"[^"]{3,}"/i)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Hardcoded Credential',
        'Potential hardcoded password/secret in source code',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Store credentials in OSGi crypto support, AEM Vault, or external secret manager. Never commit secrets to VCS.', 'Medium',
        'Credential exposure, unauthorized access', 'Needs Review',
        'May be a false positive if value is a placeholder');
    }

    // Insecure deserialization
    for (const hit of ctx.grep(f, /ObjectInputStream|readObject\(\)|XMLDecoder/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Insecure Deserialization',
        'Java deserialization without input validation — RCE risk',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Use JSON/XML serialization instead. If deserialization is required, use Apache Commons IO ValidatingObjectInputStream.', 'High',
        'Remote code execution', 'Verified',
        'CWE-502: Deserialization of untrusted data');
    }

    // Path traversal
    for (const hit of ctx.grep(f, /getParameter.*(?:File|Path|\.resolve|Paths\.get)/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Potential Path Traversal',
        'User input used in file path construction — directory traversal risk',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Validate and canonicalize file paths. Reject paths containing ".." sequences.', 'Medium',
        'Unauthorized file access', 'Needs Review',
        'CWE-22: Path traversal');
    }

    // CSRF - POST servlet without sling referrer filter check
    if (content.includes('@SlingServlet') || content.includes('service = Servlet.class')) {
      if (content.includes('doPost') && !content.includes('CSRF') && !content.includes('csrf') && !content.includes('@:sym:check')) {
        for (const hit of ctx.grep(f, /(?:void|protected)\s+doPost\s*\(/)) {
          ctx.add('Security', mod, f, hit.lineNum,
            'POST Servlet Without CSRF Protection',
            'POST-handling servlet without explicit CSRF validation',
            ctx.context(f, hit.lineNum), 'HIGH',
            'Enable Apache Sling Referrer Filter or implement CSRF token validation. Use @csrf.token in forms.', 'Medium',
            'Cross-site request forgery');
        }
      }
    }

    // SQL Injection (if using JDBC directly)
    for (const hit of ctx.grep(f, /Statement\.execute(?:Query|Update)\s*\(.*\+/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Potential SQL Injection',
        'String concatenation in SQL statement — SQL injection risk',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Use PreparedStatement with parameterized queries. Never concatenate user input into SQL.', 'Medium',
        'Data breach, unauthorized data access', 'Verified',
        'CWE-89: SQL Injection');
    }

    // Weak cryptography
    for (const hit of ctx.grep(f, /(?:MD5|SHA1|DES|RC4|getInstance\("(?:MD5|SHA-1|DES)")/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Weak Cryptographic Algorithm',
        'Using deprecated/weak cryptographic algorithm',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use SHA-256/SHA-3 for hashing, AES-256 for encryption. Avoid MD5 and SHA-1.', 'Medium',
        'Cryptographic weakness, data exposure');
    }

    // Open redirect
    for (const hit of ctx.grep(f, /sendRedirect\s*\(.*getParameter/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Open Redirect',
        'Redirect URL from user input without validation — phishing risk',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Validate redirect URLs against whitelist of allowed domains. Use relative paths when possible.', 'Medium',
        'Phishing, credential theft');
    }

    // Verbose error messages
    for (const hit of ctx.grep(f, /response\.(?:getWriter|getOutputStream)\(\).*(?:getMessage|getStackTrace|toString)/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Information Disclosure in Error Response',
        'Exception details exposed in HTTP response — reveals internal implementation',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Return generic error messages. Log detailed errors server-side only.', 'Low',
        'Information leakage to attackers');
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
        'Unsafe HTL Context',
        "Using context='unsafe' bypasses all XSS protection in HTL output",
        ctx.context(f, hit.lineNum), 'CRITICAL',
        "Never use context='unsafe'. Use appropriate context (html, attribute, uri, scriptString, etc).", 'Medium',
        'XSS vulnerability', 'Verified',
        'Unsafe context disables all output encoding');
    }

    // data-sly-attribute with unescaped URL
    for (const hit of ctx.grep(f, /data-sly-attribute\.(?:href|src|action)\s*=\s*"\$\{[^}]*@\s*context\s*=\s*'uri'/)) {
      // This is actually correct usage - skip
    }

    // Missing context specification for URLs
    for (const hit of ctx.grep(f, /(?:href|src|action)\s*=\s*"\$\{[^}]*(?!@\s*context)[^}]*\}"/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Missing HTL Context for URL',
        'URL attribute without explicit context — default context may not properly encode for URI',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        "Add @ context='uri' for href/src/action attributes to ensure proper URL encoding.", 'Low');
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
          'Overly Permissive Filter Pattern',
          'Filter scope pattern matches everything — may expose internal endpoints',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Restrict filter patterns to specific paths. Avoid wildcard .* patterns.', 'Medium');
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
