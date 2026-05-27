/**
 * SEO Scans for AEM Projects
 * Detects: missing meta tags, URL structure issues, canonical tags,
 * structured data, sitemap, robots.txt, heading hierarchy, image optimization
 */
import { ScanContext } from './types';

export function scanSeo(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of htl) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    const isPage = f.includes('page') || f.includes('Page') || content.includes('<html') || content.includes('<!DOCTYPE');

    if (isPage) {
      // Missing title tag
      if (content.includes('<head') && !content.includes('<title') && !content.includes('data-sly-include') && !/<sly\s+data-sly-resource.*head/.test(content)) {
        ctx.add('SEO', mod, f, 1,
          'Missing Title Tag',
          'Page template missing <title> element — critical for search engine ranking',
          '', 'HIGH',
          'Add dynamic <title> tag using page title property: <title>${currentPage.title || currentPage.name}</title>', 'Low',
          'Poor search rankings, unclear SERP display');
      }

      // Missing meta description
      if (content.includes('<head') && !content.includes('meta') && !content.includes('description')) {
        ctx.add('SEO', mod, f, 1,
          'Missing Meta Description',
          'Page template lacks meta description — search engines use this for SERP snippets',
          '', 'MEDIUM',
          'Add <meta name="description" content="${page.description}"> in head. Allow authors to set per-page descriptions.', 'Low',
          'Reduced click-through rates from search results');
      }

      // Missing canonical tag
      if (content.includes('<head') && !content.includes('canonical') && !content.includes('rel="canonical"')) {
        ctx.add('SEO', mod, f, 1,
          'Missing Canonical Tag',
          'No canonical link tag — duplicate content issues possible',
          '', 'MEDIUM',
          'Add <link rel="canonical" href="${currentPage.path}.html"> to prevent duplicate content penalties.', 'Low',
          'Duplicate content penalties, split page authority');
      }

      // Missing Open Graph tags
      if (content.includes('<head') && !content.includes('og:') && !content.includes('property="og:')) {
        ctx.add('SEO', mod, f, 1,
          'Missing Open Graph Tags',
          'No Open Graph meta tags — poor social media sharing preview',
          '', 'LOW',
          'Add og:title, og:description, og:image, og:url meta tags for better social sharing.', 'Medium');
      }

      // Missing viewport meta
      if (content.includes('<head') && !content.includes('viewport')) {
        ctx.add('SEO', mod, f, 1,
          'Missing Viewport Meta Tag',
          'No viewport meta tag — mobile usability issues',
          '', 'HIGH',
          'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile-first indexing.', 'Low',
          'Mobile-first indexing penalties');
      }

      // Missing lang attribute
      if (content.includes('<html') && !content.includes('lang=') && !content.includes('${currentPage.language')) {
        ctx.add('SEO', mod, f, 1,
          'Missing Language Attribute',
          'HTML tag missing lang attribute — affects accessibility and search engines',
          '', 'MEDIUM',
          'Add lang attribute: <html lang="${currentPage.language}"> for proper language detection.', 'Low');
      }
    }

    // Heading hierarchy
    const h1Count = (content.match(/<h1[^>]*>/gi) || []).length;
    if (h1Count > 1) {
      ctx.add('SEO', mod, f, 1,
        'Multiple H1 Tags',
        `Found ${h1Count} H1 elements in template — should have only one per page`,
        '', 'MEDIUM',
        'Ensure only one H1 per page. Use H2-H6 for subsections.', 'Low',
        'Confuses search engine heading structure analysis');
    }

    // Images without alt text
    for (const hit of ctx.grep(f, /<img[^>]*(?!alt=)[^>]*\/?>/)) {
      if (!hit.lineText.includes('alt=') && !hit.lineText.includes('data-sly-attribute.alt')) {
        ctx.add('SEO', mod, f, hit.lineNum,
          'Image Missing Alt Text',
          'Image element without alt attribute — inaccessible and not indexable',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Add descriptive alt text to all images. Use empty alt="" for decorative images.', 'Low',
          'Images not indexed, accessibility violation');
      }
    }

    // Non-descriptive link text
    for (const hit of ctx.grep(f, />(?:click here|read more|learn more|here)<\/a>/i)) {
      ctx.add('SEO', mod, f, hit.lineNum,
        'Non-Descriptive Link Text',
        'Generic link text like "click here" provides no SEO value',
        ctx.context(f, hit.lineNum), 'LOW',
        'Use descriptive anchor text that describes the link destination.', 'Low');
    }
  }

  // XML/Content checks for SEO configuration
  for (const f of xml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Check for URL mapping configuration
    if (f.includes('.content.xml') && content.includes('sling:vanityPath')) {
      for (const hit of ctx.grep(f, /sling:vanityPath/)) {
        // Vanity paths are good for SEO but can cause issues if overused
        const vanityPaths = (content.match(/sling:vanityPath="[^"]*"/g) || []);
        if (vanityPaths.length > 5) {
          ctx.add('SEO', mod, f, hit.lineNum,
            'Excessive Vanity Paths',
            `${vanityPaths.length} vanity paths defined — can cause redirect resolution overhead`,
            '', 'LOW',
            'Use Sling Mapping (/etc/map) or dispatcher rewrites for URL management at scale.', 'Medium');
        }
      }
    }

    // Check for redirect handling
    if (f.includes('sling:redirect') || content.includes('sling:redirect')) {
      for (const hit of ctx.grep(f, /sling:redirectStatus/)) {
        if (hit.lineText.includes('302')) {
          ctx.add('SEO', mod, f, hit.lineNum,
            'Temporary Redirect (302) for Permanent Move',
            'Using 302 redirect — if permanent, use 301 to pass link authority',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Use 301 for permanent redirects to transfer SEO value. Reserve 302 for temporary redirects only.', 'Low',
            'Link authority not transferred');
        }
      }
    }
  }

  // Java checks for SEO
  for (const f of java) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Check for sitemap generation
    if (f.toLowerCase().includes('sitemap')) {
      // Good - has sitemap implementation
      if (!content.includes('lastmod') && !content.includes('lastModified')) {
        ctx.add('SEO', mod, f, 1,
          'Sitemap Missing LastModified',
          'Sitemap generator does not include lastmod — search engines use this for crawl priority',
          '', 'MEDIUM',
          'Include lastmod dates in sitemap XML to help search engines prioritize crawling.', 'Medium');
      }
      if (!content.includes('priority') && !content.includes('changefreq')) {
        ctx.add('SEO', mod, f, 1,
          'Sitemap Missing Priority/ChangeFreq',
          'Sitemap missing priority and changefreq elements',
          '', 'LOW',
          'Add priority and changefreq hints for search engine crawling optimization.', 'Low');
      }
    }

    // Noindex/nofollow configuration
    if (content.includes('noindex') || content.includes('nofollow')) {
      for (const hit of ctx.grep(f, /noindex|nofollow/)) {
        ctx.add('SEO', mod, f, hit.lineNum,
          'Robots Directive Found',
          'noindex/nofollow directive — verify this is intentional for the content',
          ctx.context(f, hit.lineNum), 'INFO',
          'Verify noindex/nofollow is intentional. Accidental blocking can remove pages from search results.', 'Low');
      }
    }
  }
}
