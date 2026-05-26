/**
 * Security Analyzer — EDS-SEC-001 through EDS-SEC-005
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class SecurityAnalyzer implements Analyzer {
  name = 'Security';
  category = 'Security';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkInnerHtml(files, findings);
    this.checkHardcodedSecrets(files, findings);
    this.checkExternalScripts(files, findings);
    this.checkCorsHeaders(files, findings);
    this.checkEvalUsage(files, findings);
    return findings;
  }

  private checkInnerHtml(files: ProjectFiles, findings: Finding[]): void {
    const allJs = [...files.blockJs, ...files.scriptJs];
    for (const file of allJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // innerHTML with user-controlled data or template literals
        if (/\.innerHTML\s*[+=]/.test(line)) {
          // Allow simple static HTML assignments
          if (/\.innerHTML\s*=\s*['"]<[^`$]*['"];?\s*$/.test(line)) continue;
          // Flag template literals or variable assignments as potential XSS
          if (/\.innerHTML\s*[+=]\s*[`$]/.test(line) || /\.innerHTML\s*[+=]\s*\w/.test(line)) {
            findings.push({
              rule: 'EDS-SEC-001',
              severity: 'CRITICAL',
              category: this.category,
              description: 'Potential XSS: innerHTML set with dynamic/template content',
              file: file.path,
              line: i + 1,
              code: line.trim().substring(0, 120),
              recommendation: 'Use DOM API (createElement/textContent) or sanitize input. Avoid innerHTML with user data.',
              score: 10,
            });
          }
        }
      }
    }
  }

  private checkHardcodedSecrets(files: ProjectFiles, findings: Finding[]): void {
    const secretPatterns = [
      { regex: /['"](?:sk|pk)[-_](?:live|test)[-_]\w{20,}['"]/, name: 'API key (Stripe-like)' },
      { regex: /['"][A-Za-z0-9]{32,}['"]/, name: null }, // generic long string, check context
      { regex: /(?:api[_-]?key|apikey|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, name: 'Hardcoded credential' },
      { regex: /AIza[0-9A-Za-z\\-_]{35}/, name: 'Google API Key' },
      { regex: /ghp_[A-Za-z0-9_]{36}/, name: 'GitHub Personal Token' },
    ];

    const allFiles = [...files.blockJs, ...files.scriptJs];
    for (const file of allFiles) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const sp of secretPatterns) {
          if (sp.regex.test(lines[i])) {
            // Skip 32-char strings that look like CSS classes, function names
            if (!sp.name && /class|function|import|export|const\s+\w+\s*=/.test(lines[i])) continue;
            if (!sp.name) continue; // Skip generic matches — too noisy
            findings.push({
              rule: 'EDS-SEC-002',
              severity: 'CRITICAL',
              category: this.category,
              description: `Potential hardcoded secret: ${sp.name}`,
              file: file.path,
              line: i + 1,
              recommendation: 'Use environment variables or AEM configuration. Never commit secrets to source control.',
              score: 10,
            });
            break;
          }
        }
      }
    }
  }

  private checkExternalScripts(files: ProjectFiles, findings: Finding[]): void {
    if (!files.headHtml) return;
    const content = files.headHtml.content;

    // EDS-SEC-003: Check for nonce-based CSP (2025 standard)
    const hasCSP = /Content-Security-Policy/.test(content);
    const hasNonce = /nonce-aem/.test(content);
    const hasStrictDynamic = /strict-dynamic/.test(content);
    const hasMoveToHeader = /move-to-http-header/.test(content);

    if (!hasCSP) {
      findings.push({
        rule: 'EDS-SEC-003',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Missing Content Security Policy — no XSS protection',
        file: 'head.html',
        recommendation: `Add nonce-based CSP (2025 aem-boilerplate standard):\n\n<meta http-equiv="Content-Security-Policy"\n  content="script-src 'nonce-aem' 'strict-dynamic' 'unsafe-inline' http: https:; base-uri 'self'; object-src 'none';"\n  move-to-http-header="true">`,
        score: 4,
      });
    } else {
      if (!hasNonce) {
        findings.push({
          rule: 'EDS-SEC-003',
          severity: 'MEDIUM',
          category: this.category,
          description: 'CSP present but missing nonce — using outdated allowlist pattern',
          file: 'head.html',
          recommendation: `Upgrade to nonce-based CSP:\n\n<meta http-equiv="Content-Security-Policy"\n  content="script-src 'nonce-aem' 'strict-dynamic' 'unsafe-inline' http: https:; base-uri 'self'; object-src 'none';"\n  move-to-http-header="true">\n\nAdd nonce="aem" to all <script> tags in head.html.`,
          score: 4,
        });
      }
      if (hasNonce && !hasStrictDynamic) {
        findings.push({
          rule: 'EDS-SEC-003',
          severity: 'LOW',
          category: this.category,
          description: 'CSP has nonce but missing strict-dynamic — dynamically loaded scripts may be blocked',
          file: 'head.html',
          recommendation: `Add 'strict-dynamic' to script-src directive — allows nonce'd scripts to load additional scripts.`,
          score: 1,
        });
      }
      if (!hasMoveToHeader) {
        findings.push({
          rule: 'EDS-SEC-003',
          severity: 'LOW',
          category: this.category,
          description: 'CSP meta tag missing move-to-http-header="true" — weaker than HTTP header',
          file: 'head.html',
          recommendation: `Add move-to-http-header="true" attribute so CDN promotes CSP to HTTP header:\n\n<meta http-equiv="Content-Security-Policy" ... move-to-http-header="true">`,
          score: 1,
        });
      }
      if (/unsafe-eval/.test(content)) {
        findings.push({
          rule: 'EDS-SEC-003',
          severity: 'HIGH',
          category: this.category,
          description: 'CSP contains unsafe-eval — allows eval()-based XSS attacks',
          file: 'head.html',
          recommendation: `Remove 'unsafe-eval' from CSP. If a library needs eval(), replace that library.`,
          score: 7,
        });
      }
    }

    // Check for external scripts without nonce in head.html
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/<script\s+(?!.*nonce).*src="https:\/\//.test(line) && !/type="application\/ld\+json"/.test(line)) {
        findings.push({
          rule: 'EDS-SEC-003',
          severity: 'HIGH',
          category: this.category,
          description: 'External script without nonce attribute — blocked by CSP',
          file: 'head.html',
          line: i + 1,
          code: line.trim().substring(0, 120),
          recommendation: `Either add nonce="aem" (for first-party) or move to delayed.js (for third-party):\n\n// First-party: <script nonce="aem" src="/scripts/..." type="module">\n// Third-party: move to scripts/delayed.js`,
          score: 7,
        });
      }
    }
  }

  private checkCorsHeaders(files: ProjectFiles, findings: Finding[]): void {
    // Check for permissive CORS in fetch calls
    for (const file of [...files.blockJs, ...files.scriptJs]) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/mode:\s*['"]no-cors['"]/.test(lines[i])) {
          findings.push({
            rule: 'EDS-SEC-004',
            severity: 'MEDIUM',
            category: this.category,
            description: 'Fetch with mode: "no-cors" — response body is opaque/unreadable',
            file: file.path,
            line: i + 1,
            recommendation: 'Use proper CORS headers on the target server or proxy through AEM',
            score: 4,
          });
        }
      }
    }
  }

  private checkEvalUsage(files: ProjectFiles, findings: Finding[]): void {
    for (const file of [...files.blockJs, ...files.scriptJs]) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\beval\s*\(/.test(lines[i]) || /new\s+Function\s*\(/.test(lines[i])) {
          findings.push({
            rule: 'EDS-SEC-005',
            severity: 'CRITICAL',
            category: this.category,
            description: 'eval() or new Function() used — code injection risk',
            file: file.path,
            line: i + 1,
            code: lines[i].trim().substring(0, 120),
            recommendation: 'Remove eval/Function constructor. Use JSON.parse, template literals, or safe alternatives.',
            score: 10,
          });
        }
      }
    }
  }
}
