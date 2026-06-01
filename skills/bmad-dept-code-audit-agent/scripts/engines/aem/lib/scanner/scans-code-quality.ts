/**
 * Code Quality Scans for AEM Projects
 * Detects: printStackTrace, System.out, generic catches, WCMUsePojo,
 * deprecated APIs, coding standards, naming conventions, dead code
 */
import { ScanContext } from './types';

export function scanCodeQuality(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of java) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // printStackTrace usage
    for (const hit of ctx.grep(f, /\.printStackTrace\s*\(\)/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Using printStackTrace() Instead of Logger',
        'printStackTrace() dumps to System.err which is NOT captured in AEM\'s error.log. When this code fails in production, you won\'t find the error in Splunk/ELK/Cloud Manager logs.',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Replace with: LOG.error("Description of what failed", exception); — where LOG is a SLF4J Logger. This gives you log level control, timestamps, and searchable output.', 'Low',
        'Production errors become invisible — you can\'t diagnose issues without connecting directly to the server');
    }

    // System.out / System.err
    for (const hit of ctx.grep(f, /System\.(out|err)\.(print|println)\s*\(/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'System.out.println (Not Logged Properly)',
        'System.out goes to stdout, not AEM\'s logging system. You can\'t set log levels, filter, or search these messages in production log tools.',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Replace with SLF4J logger: private static final Logger LOG = LoggerFactory.getLogger(YourClass.class); then use LOG.debug()/info()/error() as appropriate.', 'Low',
        'Debug output clutters server stdout with no way to turn it off; log management tools can\'t capture or alert on these messages');
    }

    // Generic catch blocks (skip test files — tests often catch broadly for assertion purposes)
    if (!f.includes('/test/') && !f.includes('Test.java') && !f.includes('IT.java')) {
      for (const hit of ctx.grep(f, /catch\s*\(\s*Exception\s+\w+\s*\)/)) {
        // Skip if this is a top-level servlet/service catch (intentional safety net with logging)
        const catchBlock = content.split('\n').slice(hit.lineNum - 1, hit.lineNum + 5).join('\n');
        const hasLogging = /LOG\.|log\.|logger\.|LOGGER\./i.test(catchBlock);
        if (!hasLogging) {
          ctx.add('Code Quality', mod, f, hit.lineNum,
            'Catching Generic Exception (Hides Real Errors)',
            'Catching the base Exception class hides what actually went wrong. A NullPointerException (bug) and an IOException (network issue) need different handling but both get swallowed the same way here.',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Catch specific exceptions: catch (RepositoryException e) for JCR issues, catch (IOException e) for I/O. Add a final catch (Exception e) only as a last-resort safety net with LOG.error().', 'Low');
        }
      }
    }

    // Empty catch blocks
    for (const hit of ctx.grep(f, /catch\s*\([^)]+\)\s*\{\s*\}/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Empty Catch Block (Error Silently Ignored)',
        'An exception is caught and completely ignored. If something goes wrong in this code, you\'ll never know — no error in logs, no alert, the page just silently breaks.',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'At minimum: LOG.error("Failed to [describe operation]", e); If you intentionally want to ignore, add a comment explaining why: // Expected when resource doesn\'t exist', 'Low',
        'Bugs become impossible to diagnose. Features fail silently and users report broken pages with no error trail to follow.');
    }

    // WCMUsePojo usage (deprecated pattern)
    for (const hit of ctx.grep(f, /extends\s+WCMUsePojo/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'WCMUsePojo (Deprecated — Use Sling Models)',
        'WCMUsePojo is the old way to write component logic. It\'s tightly coupled to the request, can\'t be unit tested easily, and is not supported in AEM as a Cloud Service.',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Rewrite as a Sling Model: @Model(adaptables=Resource.class) with @ValueMapValue/@ChildResource injections. This gives you unit testability with AEM Mocks and is future-proof for Cloud.', 'High',
        'Cannot unit test without a full AEM instance running; blocks Cloud Service migration; new AEM features (Content Fragments, headless) don\'t support WCMUsePojo');
    }

    // @SlingServlet deprecated annotation
    for (const hit of ctx.grep(f, /@SlingServlet/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        '@SlingServlet Annotation (Deprecated Since AEM 6.3)',
        '@SlingServlet uses Felix SCR which is removed in newer AEM versions. This code won\'t compile against AEM as a Cloud Service SDK.',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Replace with OSGi DS: @Component(service = Servlet.class, property = {"sling.servlet.resourceTypes=myapp/components/mycomp", "sling.servlet.methods=GET"})', 'Medium',
        'Blocks AEM Cloud Service migration; Felix SCR plugin is no longer maintained and will stop working in future AEM versions');
    }

    // @SlingFilter deprecated
    for (const hit of ctx.grep(f, /@SlingFilter/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Deprecated @SlingFilter Annotation',
        '@SlingFilter is deprecated — use OSGi DS annotations',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Replace with @Component(service=Filter.class) and proper OSGi DS annotations.', 'Medium');
    }

    // SCR annotations (Felix)
    for (const hit of ctx.grep(f, /import\s+org\.apache\.felix\.scr\.annotations\./)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Felix SCR Annotations (Deprecated)',
        'Using Apache Felix SCR annotations — should use OSGi DS (R7) annotations',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Migrate to org.osgi.service.component.annotations (OSGi DS R7). Use bnd-maven-plugin.', 'Medium',
        'Felix SCR plugin removed in AEMaaCS');
    }

    // God class detection
    const lineCount = content.split('\n').length;
    if (lineCount > ctx.thresholds.god_class_lines) {
      ctx.add('Code Quality', mod, f, 1,
        `God Class (${lineCount} lines)`,
        `File has ${lineCount} lines — exceeds threshold of ${ctx.thresholds.god_class_lines}. Likely has too many responsibilities.`,
        '', 'MEDIUM',
        'Refactor into smaller, focused classes following Single Responsibility Principle.', 'High',
        'Hard to maintain, test, and understand');
    }

    // Too many methods
    const methodMatches = content.match(/\b(public|private|protected)\s+\w+[\s<].*\([^)]*\)\s*(throws\s+[\w,\s]+)?\s*\{/g);
    if (methodMatches && methodMatches.length > ctx.thresholds.max_methods_per_class) {
      ctx.add('Code Quality', mod, f, 1,
        `Too Many Methods (${methodMatches.length})`,
        `Class has ${methodMatches.length} methods — exceeds threshold of ${ctx.thresholds.max_methods_per_class}`,
        '', 'LOW',
        'Consider splitting into focused classes with fewer responsibilities.', 'High');
    }

    // Unused imports (basic detection — skip wildcard, annotations, and common FP cases)
    const imports: { name: string; line: number }[] = [];
    for (const hit of ctx.grep(f, /^import\s+([\w.]+)\s*;/)) {
      const importPath = hit.match[1];
      const className = importPath.split('.').pop() || '';
      // Skip wildcard imports, annotations (often only used in annotations not caught by word boundary)
      if (className && className !== '*' && !importPath.includes('.annotation.')) {
        imports.push({ name: className, line: hit.lineNum });
      }
    }
    // Check usage — require at least 2 occurrences (import line + actual use)
    // Use word boundary but also check for usage in annotations and generics
    for (const imp of imports) {
      const nameRegex = new RegExp(`(?:@${imp.name}|<${imp.name}|\\b${imp.name}\\b)`, 'g');
      const occurrences = (content.match(nameRegex) || []).length;
      if (occurrences <= 1) { // Only the import statement itself
        ctx.add('Code Quality', mod, f, imp.line,
          'Unused Import',
          `Import '${imp.name}' appears unused in file`,
          '', 'LOW',
          'Remove unused imports to keep code clean. IDEs can auto-fix this (Ctrl+Shift+O in Eclipse, Ctrl+Alt+O in IntelliJ).', 'Low',
          undefined, 'Needs Review', 'May be a false positive if used only in Javadoc @link, generics type erasure, or reflection');
      }
    }

    // TODO/FIXME/HACK comments
    for (const hit of ctx.grep(f, /\/\/\s*(TODO|FIXME|HACK|XXX|TEMP)[:.]?\s*(.*)/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Technical Debt Marker',
        `${hit.match[1]}: ${(hit.match[2] || '').substring(0, 100)}`,
        ctx.context(f, hit.lineNum), 'LOW',
        'Address TODO/FIXME comments or create backlog tickets to track them.', 'Low');
    }

    // Hardcoded paths (skip OSGi config classes, constants classes, and test fixtures)
    if (!f.includes('/test/') && !f.includes('Test.java') && !f.includes('Constants.java') && !f.includes('Config.java')) {
      for (const hit of ctx.grep(f, /"\/content\/[^"]+"|"\/etc\/[^"]+"|"\/apps\/[^"]+"/)) {
        // Skip if it's a constant definition meant to be configurable (has final static)
        const line = content.split('\n')[hit.lineNum - 1] || '';
        if (/static\s+final|final\s+static/.test(line) && /String\s+[A-Z_]+/.test(line)) continue;
        ctx.add('Code Quality', mod, f, hit.lineNum,
          'Hardcoded Content Path',
          'JCR path is hardcoded directly in logic. If this path differs between environments (dev/stage/prod) or changes during a content migration, this code breaks.',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Externalize to an OSGi configuration property so it can be changed per environment without code changes. Use @Designate + @ObjectClassDefinition for type-safe config.', 'Medium',
          'Breaks across environments; hard to maintain during content restructuring',
          'Needs Review', 'False positive if the path is a well-known AEM system path that never changes (e.g., /content/dam root)');
      }
    }

    // Magic numbers
    for (const hit of ctx.grep(f, /\b(?:timeout|limit|max|size|count|capacity)\s*[=<>]+\s*\d{2,}/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Magic Number',
        'Hardcoded numeric value — should be an OSGi configuration or constant',
        ctx.context(f, hit.lineNum), 'LOW',
        'Extract to named constant or OSGi configuration property.', 'Low');
    }
  }

  // HTL code quality
  for (const f of htl) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Inline JavaScript in HTL (only flag scripts WITHOUT src — the regex already excludes src but double-check)
    for (const hit of ctx.grep(f, /<script[^>]*>/)) {
      // Skip external scripts (have src attribute) and HTL-generated JSON (type="application/json")
      if (hit.lineText.includes('src=') || hit.lineText.includes('type="application/json"') ||
          hit.lineText.includes('type="application/ld+json"')) continue;
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Inline JavaScript in HTL',
        'Inline <script> block in an HTL template. This mixes logic with markup, can\'t be cached separately by the browser, and violates Content Security Policy (CSP) if enabled.',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Move JavaScript to a client library (ui.frontend). Pass data from HTL to JS using data-attributes: <div data-config="${model.jsonConfig}"> then read in JS with element.dataset.config.', 'Medium');
    }

    // Inline CSS styles
    for (const hit of ctx.grep(f, /style\s*=\s*"/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Inline CSS Style',
        'Inline styles reduce maintainability and cacheability',
        ctx.context(f, hit.lineNum), 'LOW',
        'Move styles to CSS client libraries.', 'Low');
    }

    // data-sly-use with Java class path (should use Sling Model)
    for (const hit of ctx.grep(f, /data-sly-use\.\w+\s*=\s*"[^"]*\.java"/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Direct Java Class Reference in HTL',
        'HTL using direct Java class reference instead of Sling Model',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Use Sling Models with @Model annotation. Reference by resource type.', 'Medium');
    }
  }
}
