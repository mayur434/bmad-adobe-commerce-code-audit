/**
 * SEO Analyzer — EDS-SEO-001 through EDS-SEO-004
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class SeoAnalyzer implements Analyzer {
  name = 'SEO';
  category = 'SEO';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkMetadata(files, findings);
    this.checkRobotsTxt(files, findings);
    this.checkStructuredData(files, findings);
    this.checkHeadings(files, findings);
    return findings;
  }

  private checkMetadata(files: ProjectFiles, findings: Finding[]): void {
    if (!files.headHtml) {
      findings.push({
        rule: 'EDS-SEO-001',
        severity: 'HIGH',
        category: this.category,
        description: 'No head.html — missing <meta> tags for SEO',
        recommendation: 'Create head.html with viewport, canonical, and Open Graph meta tags',
        score: 7,
      });
      return;
    }

    const content = files.headHtml.content;

    if (!/meta\s+property="og:/.test(content)) {
      findings.push({
        rule: 'EDS-SEO-001',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Missing Open Graph meta tags (og:title, og:description, og:image)',
        file: 'head.html',
        recommendation: 'Add Open Graph tags via Metadata sheet in Word/GDocs (EDS auto-generates them)',
        score: 4,
      });
    }

    if (!/meta\s+name="twitter:/.test(content) && !/meta\s+property="twitter:/.test(content)) {
      findings.push({
        rule: 'EDS-SEO-001',
        severity: 'LOW',
        category: this.category,
        description: 'Missing Twitter Card meta tags',
        file: 'head.html',
        recommendation: 'Add twitter:card, twitter:title via Metadata sheet',
        score: 1,
      });
    }

    if (!/rel="canonical"/.test(content)) {
      findings.push({
        rule: 'EDS-SEO-001',
        severity: 'MEDIUM',
        category: this.category,
        description: 'No canonical link tag in head.html',
        file: 'head.html',
        recommendation: 'EDS auto-adds canonical from page URL — verify in Metadata sheet or head.html',
        score: 4,
      });
    }
  }

  private checkRobotsTxt(files: ProjectFiles, findings: Finding[]): void {
    if (!files.robotsTxt) {
      findings.push({
        rule: 'EDS-SEO-002',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Missing robots.txt file',
        recommendation: 'Create robots.txt with Sitemap reference. EDS serves from /robots.txt endpoint.',
        score: 4,
      });
      return;
    }

    const content = files.robotsTxt.content;

    if (!/Sitemap:\s*https?:\/\//i.test(content)) {
      findings.push({
        rule: 'EDS-SEO-002',
        severity: 'MEDIUM',
        category: this.category,
        description: 'robots.txt missing Sitemap directive',
        file: 'robots.txt',
        recommendation: 'Add: Sitemap: https://yourdomain.com/sitemap.xml',
        score: 4,
      });
    }

    if (/Disallow:\s*\/\s*$/m.test(content)) {
      findings.push({
        rule: 'EDS-SEO-002',
        severity: 'CRITICAL',
        category: this.category,
        description: 'robots.txt blocks all crawlers (Disallow: /)',
        file: 'robots.txt',
        recommendation: 'Remove or restrict Disallow: / to specific paths/bots for staging only',
        score: 10,
      });
    }
  }

  private checkStructuredData(files: ProjectFiles, findings: Finding[]): void {
    const hasLdJson = files.headHtml?.content.includes('application/ld+json');
    const hasLdInBlocks = files.blockJs.some((f) => /application\/ld\+json/.test(f.content));

    if (!hasLdJson && !hasLdInBlocks) {
      findings.push({
        rule: 'EDS-SEO-003',
        severity: 'MEDIUM',
        category: this.category,
        description: 'No JSON-LD structured data found in project',
        recommendation: 'Add Organization, BreadcrumbList, or page-specific schema via metadata or head.html',
        score: 4,
      });
    }
  }

  private checkHeadings(files: ProjectFiles, findings: Finding[]): void {
    // Check HTML files for heading structure
    for (const file of files.html) {
      if (file.path.includes('nav') || file.path.includes('footer')) continue;

      // Check for multiple h1 in a page-level HTML
      const h1Count = (file.content.match(/<h1[\s>]/g) || []).length;
      if (h1Count > 1) {
        findings.push({
          rule: 'EDS-SEO-004',
          severity: 'MEDIUM',
          category: this.category,
          description: `Multiple H1 tags found (${h1Count}) — should be exactly one per page`,
          file: file.path,
          recommendation: 'Ensure single H1 per page. Use H2-H6 for subsections.',
          score: 4,
        });
      }
    }

    // Check blocks that generate headings
    for (const file of files.blockJs) {
      if (/createElement\s*\(\s*['"]h1['"]\s*\)/.test(file.content)) {
        findings.push({
          rule: 'EDS-SEO-004',
          severity: 'MEDIUM',
          category: this.category,
          description: 'Block dynamically creates H1 — risks multiple H1s on page',
          file: file.path,
          recommendation: 'Use H2 or lower in blocks. Page H1 should come from content authoring.',
          score: 4,
        });
      }
    }
  }
}
