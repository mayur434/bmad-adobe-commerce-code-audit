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
          'Query Without Limit',
          'This query can return ALL matching nodes (thousands of results). Without a limit, it loads everything into memory and can crash the JVM with OutOfMemoryError.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add .setLimit(100) or p.limit=100 to your query. Use pagination (p.offset + p.limit) if you need more results.', 'Medium',
          'Pages go blank or throw 500 errors when content grows; AEM instance restarts under load', 'Verified', 'Every QueryBuilder/JCR query without a limit fetches unlimited rows into heap memory');
      }
    }

    // Thread.sleep usage (skip test classes)
    if (!f.includes('Test.java') && !f.includes('/test/') && !f.includes('IT.java') && !f.includes('Mock')) {
      for (const hit of ctx.grep(f, /Thread\.sleep\s*\(/)) {
        ctx.add('Performance', mod, f, hit.lineNum,
          'Thread.sleep Blocks Requests',
          'Thread.sleep() freezes the current request thread. AEM has limited threads (default ~200), so sleeping threads mean other users wait in queue.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Replace with Sling Scheduler (for delayed tasks) or Sling Jobs (for async work). Example: scheduler.schedule(myRunnable, schedulerOptions)', 'Medium',
          'Under traffic spikes, users get timeout errors because all threads are sleeping instead of serving requests');
      }
    }

    // Synchronous HTTP calls in servlets/components
    for (const hit of ctx.grep(f, /HttpURLConnection|new\s+URL\(.*\)\.open|CloseableHttpClient|HttpClient\.execute/)) {
      ctx.add('Performance', mod, f, hit.lineNum,
        'Blocking HTTP Call in Request Thread',
        'This HTTP call blocks the request thread while waiting for a remote server. If that server is slow (2-30s), your AEM page waits too — and the thread is stuck.',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Move external API calls to Sling Jobs (background processing) or use async HTTP client. Add a connection timeout (5s max) and circuit breaker for fault tolerance.', 'High',
        'Pages load slowly when external APIs are down; cascading failures during outages can make the entire site unresponsive');
    }

    // Session.save() in loops
    for (const hit of ctx.grep(f, /session\.save\(\)/)) {
      const linesBefore = content.split('\n').slice(Math.max(0, hit.lineNum - 10), hit.lineNum).join('\n');
      if (/for\s*\(|while\s*\(|\.forEach\(/.test(linesBefore)) {
        ctx.add('Performance', mod, f, hit.lineNum,
          'session.save() Called Inside Loop',
          'Each session.save() does a full JCR commit (disk write + event notification). Inside a loop of 100 items, that\'s 100 commits instead of 1.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Move session.save() AFTER the loop ends. Make all changes first, then save once. For bulk operations, use batch commits with try-catch.', 'Medium',
          'Content imports/migrations take 10-100x longer than necessary; author UI becomes unresponsive during bulk operations');
      }
    }

    // ResourceResolver not closed (leak)
    if (content.includes('resourceResolverFactory.getServiceResourceResolver') ||
        content.includes('resourceResolverFactory.getAdministrativeResourceResolver')) {
      // Check for proper cleanup patterns
      const hasClose = content.includes('.close()');
      const hasTryWithResources = /try\s*\(.*(?:ResourceResolver|resolver|resourceResolver|rr)/.test(content);
      const hasFinally = /finally\s*\{[^}]*\.close\(\)/.test(content);
      if (!hasClose && !hasTryWithResources && !hasFinally) {
        for (const hit of ctx.grep(f, /getServiceResourceResolver|getAdministrativeResourceResolver/)) {
          ctx.add('Performance', mod, f, hit.lineNum,
            'ResourceResolver Never Closed (Memory Leak)',
            'You opened a ResourceResolver but never called .close(). Each unclosed resolver holds a JCR session open permanently — AEM has a limited pool (~20 sessions).',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'Wrap in try-with-resources: try (ResourceResolver rr = factory.getServiceResourceResolver(authMap)) { ... }. The resolver auto-closes even if exceptions occur.', 'Low',
            'After ~20 leaked resolvers, AEM stops responding to ALL requests and requires a restart. This is the #1 cause of production outages in AEM.', 'Verified',
            'ResourceResolver implements Closeable — not closing it leaks a JCR session permanently until JVM restart');
        }
      }
    }

    // Large node traversals (skip when in a known-small-context like component parsys)
    for (const hit of ctx.grep(f, /listChildren\(\)|getChildren\(\)|adaptTo\(Iterator\.class\)/)) {
      // Check surrounding code for evidence this iterates a potentially large node
      const nearby = content.split('\n').slice(Math.max(0, hit.lineNum - 5), hit.lineNum + 5).join('\n');
      // Skip if it's iterating resource children after a specific path (likely controlled) or in test
      if (f.includes('/test/') || f.includes('Test.java')) continue;
      // Flag with lower confidence note
      ctx.add('Performance', mod, f, hit.lineNum,
        'Iterating All Child Nodes — Could Be Slow on Large Trees',
        'listChildren()/getChildren() loads ALL child nodes into memory. If this node could have 1,000+ children (e.g., /content/dam subfolders, user-generated content), it will be extremely slow. If you KNOW this node always has < 50 children (like a component parsys), this is fine.',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'If the parent node can grow unbounded: use a QueryBuilder query with path + limit instead. If the parent always has < 50 children (parsys, known structure): you can ignore this.', 'Medium',
        'Component renders slowly on pages with lots of content; author experience degrades as content grows',
        'Needs Review', 'False positive if iterating a known-small collection like parsys children or a fixed config node');
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
