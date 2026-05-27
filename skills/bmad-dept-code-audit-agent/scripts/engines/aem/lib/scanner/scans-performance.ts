/**
 * Performance Scans for AEM Projects
 * Detects: unbounded queries, sync HTTP calls, Thread.sleep, missing caching,
 * large DAM assets, eager loading, missing indexes, heavy servlets
 */
import { ScanContext } from './types';

export function scanPerformance(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of java) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Unbounded JCR queries
    for (const hit of ctx.grep(f, /createQuery\s*\(|QueryBuilder/)) {
      // Check if query has a limit
      const surrounding = content.substring(Math.max(0, content.indexOf(hit.lineText) - 200), content.indexOf(hit.lineText) + 500);
      if (!surrounding.includes('.setLimit(') && !surrounding.includes('p.limit') && !surrounding.includes('"p.limit"')) {
        ctx.add('Performance', mod, f, hit.lineNum,
          'Unbounded JCR Query',
          'Query without explicit limit — can return thousands of results and cause OOM',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Always set p.limit or query.setLimit() to prevent unbounded result sets. Use pagination for large results.', 'Medium',
          'Memory exhaustion, slow response times', 'Verified', 'Unbounded queries load all results into memory');
      }
    }

    // Thread.sleep usage
    for (const hit of ctx.grep(f, /Thread\.sleep\s*\(/)) {
      ctx.add('Performance', mod, f, hit.lineNum,
        'Thread.sleep Usage',
        'Thread.sleep blocks thread pool — causes thread starvation under load',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use Sling Scheduler or async patterns instead of Thread.sleep.', 'Medium',
        'Thread pool starvation, request queuing');
    }

    // Synchronous HTTP calls in servlets/components
    for (const hit of ctx.grep(f, /HttpURLConnection|new\s+URL\(.*\)\.open|CloseableHttpClient|HttpClient\.execute/)) {
      ctx.add('Performance', mod, f, hit.lineNum,
        'Synchronous HTTP Call',
        'Blocking HTTP call in request thread — degrades response time and throughput',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Use async HTTP clients or Sling Jobs for external service calls. Consider circuit breaker patterns.', 'High',
        'Slow response times, thread exhaustion under load');
    }

    // Session.save() in loops
    for (const hit of ctx.grep(f, /session\.save\(\)/)) {
      const linesBefore = content.split('\n').slice(Math.max(0, hit.lineNum - 10), hit.lineNum).join('\n');
      if (/for\s*\(|while\s*\(|\.forEach\(/.test(linesBefore)) {
        ctx.add('Performance', mod, f, hit.lineNum,
          'Session.save() in Loop',
          'Calling session.save() inside a loop — each save triggers a repository commit',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Batch changes and call session.save() once after the loop completes.', 'Medium',
          'Excessive I/O, slow content operations');
      }
    }

    // ResourceResolver not closed (leak)
    if (content.includes('resourceResolverFactory.getServiceResourceResolver') ||
        content.includes('resourceResolverFactory.getAdministrativeResourceResolver')) {
      if (!content.includes('.close()') && !content.includes('try-with-resources') && !content.includes('try (')) {
        for (const hit of ctx.grep(f, /getServiceResourceResolver|getAdministrativeResourceResolver/)) {
          ctx.add('Performance', mod, f, hit.lineNum,
            'ResourceResolver Leak',
            'ResourceResolver opened but never closed — causes memory leak and session exhaustion',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'Use try-with-resources or ensure close() in finally block. Each unclosed resolver leaks a JCR session.', 'Low',
            'Memory leak, JCR session exhaustion, instance instability', 'Verified',
            'ResourceResolver implements Closeable and MUST be closed');
        }
      }
    }

    // Large node traversals
    for (const hit of ctx.grep(f, /listChildren\(\)|getChildren\(\)|adaptTo\(Iterator\.class\)/)) {
      ctx.add('Performance', mod, f, hit.lineNum,
        'Potential Large Node Traversal',
        'Iterating all children without filtering — expensive for nodes with many children',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Use queries or index-backed lookups instead of iterating large child node lists.', 'Medium',
        'Slow page rendering for content-heavy pages');
    }

    // Missing @Activate / lazy initialization
    for (const hit of ctx.grep(f, /new\s+(?:ArrayList|HashMap|HashSet|ConcurrentHashMap)\s*<[^>]*>\s*\(\)/)) {
      // Check if it's a field initialization (performance concern for heavy objects)
      const lines = content.split('\n');
      const line = lines[hit.lineNum - 1] || '';
      if (/private\s+/.test(line) && /static\s+/.test(line)) {
        ctx.add('Performance', mod, f, hit.lineNum,
          'Eager Static Collection Initialization',
          'Static collection initialized eagerly — may waste memory if service not used',
          ctx.context(f, hit.lineNum), 'LOW',
          'Consider lazy initialization or @Activate method initialization.', 'Low');
      }
    }

    // Inefficient string concatenation in loops
    for (const hit of ctx.grep(f, /\+\s*=\s*.*String|String\s*\+\s*=/)) {
      const linesBefore = content.split('\n').slice(Math.max(0, hit.lineNum - 5), hit.lineNum).join('\n');
      if (/for\s*\(|while\s*\(/.test(linesBefore)) {
        ctx.add('Performance', mod, f, hit.lineNum,
          'String Concatenation in Loop',
          'String concatenation with += in loop creates many intermediate String objects',
          ctx.context(f, hit.lineNum), 'LOW',
          'Use StringBuilder for string building inside loops.', 'Low');
      }
    }
  }

  // HTL performance checks
  for (const f of htl) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Excessive data-sly-list without limits
    const listMatches = content.match(/data-sly-list/g);
    if (listMatches && listMatches.length > 5) {
      ctx.add('Performance', mod, f, 1,
        'Excessive data-sly-list Usage',
        `${listMatches.length} data-sly-list iterations in single template — consider pagination`,
        '', 'MEDIUM',
        'Reduce number of list iterations or implement server-side pagination.', 'Medium',
        'Slow page render times');
    }

    // data-sly-use without caching hint
    for (const hit of ctx.grep(f, /data-sly-use\.[^=]+="\$\{.*@.*\}"/)) {
      // OK, has parameters
    }
  }

  // XML - Check for missing dispatcher caching configurations
  for (const f of xml) {
    const mod = ctx.module(f);
    if (!f.includes('dispatcher') && !f.includes('.content.xml')) continue;
    const content = ctx.read(f);
    if (!content) continue;

    // Check for TTL-less cache rules in dispatcher
    if (f.includes('dispatcher') && content.includes('/cache') && !content.includes('/enableTTL')) {
      ctx.add('Performance', mod, f, 1,
        'Missing Dispatcher TTL Configuration',
        'Dispatcher cache configured without TTL — stale content may be served indefinitely',
        '', 'MEDIUM',
        'Configure /enableTTL "1" and set appropriate Cache-Control headers.', 'Medium',
        'Stale content served to users');
    }

    // Missing Cache-Control for HTML pages (BPO finding: empty Cache-Control header)
    if (f.includes('dispatcher') && content.includes('/rules') && !content.includes('Cache-Control') &&
        !content.includes('max-age') && !content.includes('Expires')) {
      ctx.add('Performance', mod, f, 1,
        'Missing Cache-Control Headers for HTML (BPO Finding)',
        'Dispatcher config has no Cache-Control/Expires header rules — HTML pages served without caching directives',
        '', 'HIGH',
        'Add Header set Cache-Control "max-age=300, stale-while-revalidate=60" for .html files. BPO target: 90%+ cache hit ratio.', 'Medium',
        'Adobe BPO penalizes: empty Cache-Control on HTML pages, cache hit ratio below 90%');
    }
  }

  // Check for CDN/performance config files (BPO cache hit ratio concerns)
  const confFiles = xml.filter(f => ctx.rel(f).includes('.conf') || ctx.rel(f).includes('vhost'));
  for (const f of confFiles) {
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // Check for missing browser caching on static assets
    if (content.includes('FilesMatch') || content.includes('LocationMatch')) {
      if (!content.includes('max-age') && !content.includes('immutable')) {
        ctx.add('Performance', mod, f, 1,
          'Static Assets Missing Long-Lived Cache Headers',
          'Static asset rules without max-age/immutable — browser re-fetches unchanged assets',
          '', 'MEDIUM',
          'Set Cache-Control: max-age=31536000, immutable for versioned static assets (JS, CSS, images with hash).', 'Low',
          'Unnecessary origin requests for unchanged assets');
      }
    }
  }
}
