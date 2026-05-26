/**
 * PageSpeed Insights Checker
 * Calls Google PSI API to get real Core Web Vitals per page.
 * Derives EDS live URLs from GitHub repo info.
 */
import * as https from 'https';

export interface PageSpeedMetrics {
  lcp: number;       // Largest Contentful Paint (ms)
  cls: number;       // Cumulative Layout Shift
  inp: number;       // Interaction to Next Paint (ms)
  fcp: number;       // First Contentful Paint (ms)
  ttfb: number;      // Time to First Byte (ms)
  tbt: number;       // Total Blocking Time (ms)
  si: number;        // Speed Index (ms)
}

export interface PageSpeedResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  score: number;             // 0-100
  metrics: PageSpeedMetrics;
  opportunities: PageSpeedOpportunity[];
  diagnostics: string[];
}

export interface PageSpeedOpportunity {
  title: string;
  description: string;
  savings: string;           // e.g. "1.2s", "200KB"
}

export interface PageSpeedConfig {
  enabled: boolean;
  apiKey?: string;
  pages: string[];
  strategy: ('mobile' | 'desktop')[];
  threshold: number;         // Score below this triggers finding
  maxPages: number;
  domain?: string;           // Override auto-detected domain
}

/**
 * Derive the AEM EDS live URL from a GitHub URL.
 * Pattern: https://main--{repo}--{owner}.aem.live/
 */
export function deriveEDSUrl(githubUrl: string): string | null {
  const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/\s]+?)(?:\.git)?(?:\/|$)/);
  if (!match) return null;
  const owner = match[1].toLowerCase();
  const repo = match[2].toLowerCase();
  return `https://main--${repo}--${owner}.aem.live`;
}

/**
 * Derive the AEM EDS preview URL from a GitHub URL.
 */
export function deriveEDSPreviewUrl(githubUrl: string): string | null {
  const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/\s]+?)(?:\.git)?(?:\/|$)/);
  if (!match) return null;
  const owner = match[1].toLowerCase();
  const repo = match[2].toLowerCase();
  return `https://main--${repo}--${owner}.aem.page`;
}

function httpsGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'BMAD-EDS-Audit/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`PSI API returned HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse PSI response')); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Run PageSpeed Insights check for a single URL + strategy.
 */
async function checkSinglePage(
  pageUrl: string,
  strategy: 'mobile' | 'desktop',
  apiKey?: string
): Promise<PageSpeedResult> {
  const encodedUrl = encodeURIComponent(pageUrl);
  let apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodedUrl}&strategy=${strategy}&category=performance`;
  if (apiKey) apiUrl += `&key=${apiKey}`;

  const data = await httpsGetJson(apiUrl);

  const lighthouse = data.lighthouseResult;
  const audits = lighthouse?.audits || {};
  const categories = lighthouse?.categories || {};

  const score = Math.round((categories.performance?.score || 0) * 100);

  const metrics: PageSpeedMetrics = {
    lcp: Math.round(audits['largest-contentful-paint']?.numericValue || 0),
    cls: parseFloat((audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3)),
    inp: Math.round(audits['interaction-to-next-paint']?.numericValue || audits['max-potential-fid']?.numericValue || 0),
    fcp: Math.round(audits['first-contentful-paint']?.numericValue || 0),
    ttfb: Math.round(audits['server-response-time']?.numericValue || 0),
    tbt: Math.round(audits['total-blocking-time']?.numericValue || 0),
    si: Math.round(audits['speed-index']?.numericValue || 0),
  };

  // Extract top opportunities
  const opportunities: PageSpeedOpportunity[] = [];
  const opportunityAudits = [
    'render-blocking-resources',
    'unused-css-rules',
    'unused-javascript',
    'modern-image-formats',
    'offscreen-images',
    'unminified-css',
    'unminified-javascript',
    'efficient-animated-content',
    'third-party-summary',
    'lcp-lazy-loaded',
    'prioritize-lcp-image',
    'uses-responsive-images',
  ];

  for (const auditId of opportunityAudits) {
    const audit = audits[auditId];
    if (audit && audit.score !== null && audit.score < 1) {
      const savings = audit.numericValue
        ? `${(audit.numericValue / 1000).toFixed(1)}s`
        : audit.details?.overallSavingsBytes
          ? `${Math.round(audit.details.overallSavingsBytes / 1024)}KB`
          : '';
      opportunities.push({
        title: audit.title || auditId,
        description: audit.description?.split('.')[0] || '',
        savings,
      });
    }
  }

  // Extract diagnostics
  const diagnostics: string[] = [];
  const diagnosticAudits = ['dom-size', 'critical-request-chains', 'font-display', 'uses-passive-event-listeners'];
  for (const auditId of diagnosticAudits) {
    const audit = audits[auditId];
    if (audit && audit.score !== null && audit.score < 1) {
      diagnostics.push(audit.displayValue || audit.title || auditId);
    }
  }

  return { url: pageUrl, strategy, score, metrics, opportunities, diagnostics };
}

/**
 * Discover pages to check from project files.
 */
export function discoverPages(githubUrl: string, userPages?: string[]): string[] {
  const baseUrl = deriveEDSUrl(githubUrl);
  if (!baseUrl) return [];

  // Always check homepage
  const pages = new Set<string>(['/']);

  // Add user-specified pages
  if (userPages && userPages.length > 0) {
    for (const p of userPages) {
      pages.add(p.startsWith('/') ? p : `/${p}`);
    }
  }

  return Array.from(pages).map((p) => `${baseUrl}${p}`);
}

/**
 * Run PageSpeed checks on all configured pages.
 */
export async function runPageSpeedChecks(
  config: PageSpeedConfig,
  githubUrl: string
): Promise<PageSpeedResult[]> {
  const baseUrl = config.domain || deriveEDSUrl(githubUrl);
  if (!baseUrl) {
    console.log('  ⚠️  Could not derive EDS URL from GitHub URL. Skipping PageSpeed checks.');
    return [];
  }

  const pages = config.pages.length > 0
    ? config.pages.map((p) => p.startsWith('http') ? p : `${baseUrl}${p.startsWith('/') ? p : `/${p}`}`)
    : [`${baseUrl}/`];

  // Limit pages to maxPages
  const pagesToCheck = pages.slice(0, config.maxPages);
  const strategies = config.strategy || ['mobile'];

  console.log(`  PageSpeed: Checking ${pagesToCheck.length} page(s) × ${strategies.length} strategy(ies)...`);

  const results: PageSpeedResult[] = [];

  for (const pageUrl of pagesToCheck) {
    for (const strategy of strategies) {
      try {
        console.log(`    → ${strategy}: ${pageUrl}`);
        const result = await checkSinglePage(pageUrl, strategy, config.apiKey);
        results.push(result);
        console.log(`      Score: ${result.score}/100 | LCP: ${(result.metrics.lcp / 1000).toFixed(1)}s | CLS: ${result.metrics.cls} | TBT: ${result.metrics.tbt}ms`);

        // Rate limit: PSI API has ~1 req/sec for free tier
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (err: any) {
        console.log(`    ⚠️  Failed: ${pageUrl} (${strategy}) — ${err.message}`);
        results.push({
          url: pageUrl,
          strategy,
          score: -1,
          metrics: { lcp: 0, cls: 0, inp: 0, fcp: 0, ttfb: 0, tbt: 0, si: 0 },
          opportunities: [],
          diagnostics: [`Error: ${err.message}`],
        });
      }
    }
  }

  return results;
}
