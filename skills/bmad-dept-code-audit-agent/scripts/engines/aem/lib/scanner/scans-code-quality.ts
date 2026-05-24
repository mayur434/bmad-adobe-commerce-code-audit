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
        'printStackTrace Usage',
        'Using printStackTrace() instead of proper logging — output goes to stderr, not log files',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Replace with LOG.error("message", exception) using SLF4J logger.', 'Low',
        'Lost error tracking, unstructured output');
    }

    // System.out / System.err
    for (const hit of ctx.grep(f, /System\.(out|err)\.(print|println)\s*\(/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'System.out/err Usage',
        'Direct console output — not captured by AEM logging framework',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use SLF4J Logger: private static final Logger LOG = LoggerFactory.getLogger(ClassName.class);', 'Low',
        'Unmanaged log output, no log level control');
    }

    // Generic catch blocks
    for (const hit of ctx.grep(f, /catch\s*\(\s*Exception\s+\w+\s*\)/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Generic Exception Catch',
        'Catching base Exception hides specific error types and makes debugging harder',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Catch specific exceptions first (IOException, RepositoryException, etc). Keep generic catch as final fallback only.', 'Low');
    }

    // Empty catch blocks
    for (const hit of ctx.grep(f, /catch\s*\([^)]+\)\s*\{\s*\}/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Empty Catch Block',
        'Exception caught and silently swallowed — bugs will be invisible',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'At minimum log the exception. Never swallow exceptions silently.', 'Low',
        'Hidden failures, data corruption');
    }

    // WCMUsePojo usage (deprecated pattern)
    for (const hit of ctx.grep(f, /extends\s+WCMUsePojo/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'WCMUsePojo Deprecated',
        'WCMUsePojo is deprecated — use Sling Models with proper annotations instead',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Migrate to @Model annotation with @Inject fields. Sling Models provide better testability and performance.', 'High',
        'Technical debt, harder to unit test, not compatible with AEMaaCS best practices');
    }

    // @SlingServlet deprecated annotation
    for (const hit of ctx.grep(f, /@SlingServlet/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Deprecated @SlingServlet Annotation',
        '@SlingServlet is deprecated since AEM 6.3 — use OSGi DS annotations',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Replace with @Component(service=Servlet.class) + @SlingServletResourceTypes or @SlingServletPaths.', 'Medium',
        'Deprecated API, may break in future AEM versions');
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

    // Unused imports (basic detection)
    const imports: { name: string; line: number }[] = [];
    for (const hit of ctx.grep(f, /^import\s+([\w.]+)\s*;/)) {
      const importPath = hit.match[1];
      const className = importPath.split('.').pop() || '';
      if (className && className !== '*') {
        imports.push({ name: className, line: hit.lineNum });
      }
    }
    // Simplified check - only flag if import name doesn't appear elsewhere
    for (const imp of imports) {
      const occurrences = (content.match(new RegExp(`\\b${imp.name}\\b`, 'g')) || []).length;
      if (occurrences <= 1) { // Only the import itself
        ctx.add('Code Quality', mod, f, imp.line,
          'Unused Import',
          `Import '${imp.name}' appears unused in file`,
          '', 'LOW',
          'Remove unused imports to keep code clean.', 'Low');
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

    // Hardcoded paths
    for (const hit of ctx.grep(f, /"\/content\/[^"]+"|"\/etc\/[^"]+"|"\/apps\/[^"]+"/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Hardcoded Content Path',
        'Hardcoded JCR path — makes code environment-dependent and fragile',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Use OSGi configuration or resource resolver mapping for content paths. Externalize paths to configs.', 'Medium',
        'Breaks across environments, hard to maintain');
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

    // Inline JavaScript in HTL
    for (const hit of ctx.grep(f, /<script[^>]*>(?!.*src=)/)) {
      ctx.add('Code Quality', mod, f, hit.lineNum,
        'Inline JavaScript in HTL',
        'Inline script blocks in HTL templates — violates separation of concerns',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Move JavaScript to client libraries. Use data attributes for component data.', 'Medium');
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
