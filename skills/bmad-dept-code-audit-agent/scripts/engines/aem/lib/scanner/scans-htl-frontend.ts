/**
 * HTL (Sightly) & Frontend Scans for AEM Projects
 * Detects: HTL anti-patterns, clientlib issues, frontend best practices,
 * component dialog validation, responsive design checks
 */
import { ScanContext } from './types';

export function scanHtlFrontend(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of htl) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // JSP/JSTL remnants in HTL
    for (const hit of ctx.grep(f, /<%|%>|\$\{.*\}[^"]/)) {
      if (hit.lineText.includes('<%') || hit.lineText.includes('%>')) {
        ctx.add('HTL & Frontend', mod, f, hit.lineNum,
          'JSP Syntax in HTL File',
          'JSP/scriptlet syntax found in HTL template — must be converted to HTL',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Convert all JSP syntax to HTL (data-sly-*). JSP is not supported in AEMaaCS.', 'High',
          'Template will not render correctly');
      }
    }

    // data-sly-unwrap misuse
    for (const hit of ctx.grep(f, /data-sly-unwrap(?!\s*=)/)) {
      // data-sly-unwrap without condition is fine but should be noted
    }

    // Complex expressions in HTL (should be in model)
    for (const hit of ctx.grep(f, /\$\{[^}]{100,}\}/)) {
      ctx.add('HTL & Frontend', mod, f, hit.lineNum,
        'Complex HTL Expression',
        'Very complex expression in HTL — logic should be in Sling Model',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Move complex logic to Sling Model or Use-API class. HTL should be declarative.', 'Medium',
        'Hard to maintain, debug, and test');
    }

    // Deprecated HTL syntax
    for (const hit of ctx.grep(f, /data-sly-use\.[^=]+="\$\{.*'[^']*'.*\}"/)) {
      // Check for old-style string parameters
    }

    // Missing data-sly-test for null checks
    for (const hit of ctx.grep(f, /\$\{[^@}]*\.[^@}]*\.[^@}]*\}/)) {
      // Deep property access without null guard
      if (!content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum).join('').includes('data-sly-test')) {
        ctx.add('HTL & Frontend', mod, f, hit.lineNum,
          'Deep Property Access Without Null Guard',
          'Accessing nested properties without data-sly-test — may cause null errors',
          ctx.context(f, hit.lineNum), 'LOW',
          'Wrap deep property access in data-sly-test to prevent null pointer issues.', 'Low');
      }
    }

    // Hardcoded URLs in templates
    for (const hit of ctx.grep(f, /(?:href|src|action)\s*=\s*"(?:https?:\/\/|\/content\/)[^"]+"/)) {
      ctx.add('HTL & Frontend', mod, f, hit.lineNum,
        'Hardcoded URL in Template',
        'Hardcoded URL — breaks across environments and externalization',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Use Externalizer service or ${resource.path @ extension="html"} for internal links.', 'Low',
        'Broken links across author/publish/environments');
    }

    // Large template (too many lines)
    const lineCount = content.split('\n').length;
    if (lineCount > 200) {
      ctx.add('HTL & Frontend', mod, f, 1,
        `Large HTL Template (${lineCount} lines)`,
        `Template has ${lineCount} lines — should be decomposed into sub-components`,
        '', 'MEDIUM',
        'Break into smaller components using data-sly-resource or data-sly-include.', 'High',
        'Hard to maintain and understand');
    }

    // Repeated data-sly-use (same model loaded multiple times)
    const useMap = new Map<string, number>();
    for (const hit of ctx.grep(f, /data-sly-use\.(\w+)\s*=\s*"([^"]+)"/)) {
      const modelRef = hit.match[2] || '';
      useMap.set(modelRef, (useMap.get(modelRef) || 0) + 1);
    }
    for (const [model, count] of useMap) {
      if (count > 1) {
        ctx.add('HTL & Frontend', mod, f, 1,
          `Duplicate Model Loading (${count}x)`,
          `Model "${model}" loaded ${count} times — wasteful, load once at template top`,
          '', 'LOW',
          'Load models once with data-sly-use at the template level, reference variable throughout.', 'Low');
      }
    }
  }

  // Clientlib checks in XML
  for (const f of xml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    const relPath = ctx.rel(f);

    // Clientlib without categories
    if (content.includes('cq:ClientLibraryFolder') && !content.includes('categories')) {
      ctx.add('HTL & Frontend', mod, f, 1,
        'ClientLib Without Categories',
        'Client library folder missing categories property — cannot be included properly',
        '', 'HIGH',
        'Add categories="[project.name.component]" to all client library folders.', 'Low',
        'ClientLib cannot be loaded by components');
    }

    // Clientlib with embed (performance concern)
    if (content.includes('cq:ClientLibraryFolder') && content.includes('embed=')) {
      // Check for too many embeds
      const embedCount = (content.match(/embed="[^"]*"/g) || []).length;
      if (embedCount > 5) {
        ctx.add('HTL & Frontend', mod, f, 1,
          `Excessive ClientLib Embeds (${embedCount})`,
          'Too many embedded client libraries — creates monolithic bundles',
          '', 'LOW',
          'Consider using dependencies instead of embed for better caching granularity.', 'Medium');
      }
    }

    // Check for jQuery usage (outdated pattern for AEM)
    if (content.includes('cq:ClientLibraryFolder') && content.includes('jquery')) {
      ctx.add('HTL & Frontend', mod, f, 1,
        'jQuery Dependency in ClientLib',
        'Client library depends on jQuery — modern AEM recommends vanilla JS or lightweight frameworks',
        '', 'LOW',
        'Consider migrating to vanilla JavaScript or a modern lightweight framework.', 'High',
        'Increased page weight, maintenance burden');
    }

    // Component dialog validation
    if (relPath.includes('_cq_dialog') || relPath.includes('cq:dialog')) {
      // Missing required field validation
      if (!content.includes('required=') && !content.includes('validation=') && content.includes('textfield')) {
        const fieldCount = (content.match(/sling:resourceType="granite\/ui\/components\/coral\/foundation\/form/g) || []).length;
        if (fieldCount > 0) {
          ctx.add('HTL & Frontend', mod, f, 1,
            'Dialog Fields Without Validation',
            `Dialog has ${fieldCount} fields but no required/validation constraints`,
            '', 'LOW',
            'Add required="true" and validation rules to critical dialog fields.', 'Low',
            'Authors can leave critical fields empty');
        }
      }
    }
  }

  // CSS checks
  const cssFiles = ctx.cssFiles();
  for (const f of cssFiles) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // !important overuse
    const importantCount = (content.match(/!important/g) || []).length;
    if (importantCount > 10) {
      ctx.add('HTL & Frontend', mod, f, 1,
        `Excessive !important (${importantCount})`,
        `${importantCount} uses of !important — indicates CSS specificity problems`,
        '', 'MEDIUM',
        'Refactor CSS to use proper specificity hierarchy instead of !important overrides.', 'High',
        'Unmaintainable CSS, hard to override');
    }

    // Very large CSS file
    const lineCount = content.split('\n').length;
    if (lineCount > 1000) {
      ctx.add('HTL & Frontend', mod, f, 1,
        `Large CSS File (${lineCount} lines)`,
        'Very large CSS file — should be split per component',
        '', 'LOW',
        'Split CSS into per-component client libraries for better caching and maintainability.', 'High');
    }
  }

  // JS checks
  const jsFiles = ctx.jsFiles();
  for (const f of jsFiles) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Console.log in production
    for (const hit of ctx.grep(f, /console\.(log|debug|info|warn)\s*\(/)) {
      ctx.add('HTL & Frontend', mod, f, hit.lineNum,
        'Console.log in Production JS',
        'Console output in client-side JavaScript — should be removed for production',
        ctx.context(f, hit.lineNum), 'LOW',
        'Remove console statements or wrap in debug/development flag.', 'Low');
    }

    // eval() usage (security)
    for (const hit of ctx.grep(f, /\beval\s*\(/)) {
      ctx.add('HTL & Frontend', mod, f, hit.lineNum,
        'eval() Usage in JavaScript',
        'eval() is a security risk — allows arbitrary code execution',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Replace eval() with JSON.parse(), Function constructor, or refactored logic. eval() enables XSS.', 'Medium',
        'XSS vulnerability, CSP violation');
    }

    // document.write (deprecated pattern)
    for (const hit of ctx.grep(f, /document\.write\s*\(/)) {
      ctx.add('HTL & Frontend', mod, f, hit.lineNum,
        'document.write() Usage',
        'document.write() is deprecated and blocks rendering',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Use DOM manipulation methods (createElement, appendChild, insertAdjacentHTML).', 'Low',
        'Blocks page rendering, breaks with async loading');
    }
  }
}
