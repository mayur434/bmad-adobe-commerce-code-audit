/**
 * AEM Audit Scanner - Main scanner class.
 * Orchestrates all scan categories and produces findings.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Finding, FindingsMap, StatsMap, ScannerOptions, DEFAULT_THRESHOLDS, ScanContext } from './types';
import { AemScannerContext } from './context';

// Scan modules
import { scanPerformance } from './scans-performance';
import { scanCodeQuality } from './scans-code-quality';
import { scanSecurity } from './scans-security';
import { scanSeo } from './scans-seo';
import { scanAccessibility } from './scans-accessibility';
import { scanArchitecture, scanSlingOsgi } from './scans-architecture';
import { scanCloudReadiness, scanDispatcher } from './scans-cloud-readiness';
import { scanTestCoverage, scanMaintainability } from './scans-testing';
import { scanHtlFrontend } from './scans-htl-frontend';
import { scanFrontendFramework } from './scans-frontend-framework';
import { scanAmsSpecific } from './scans-ams-specific';

export { Finding, FindingsMap, StatsMap, ScannerOptions, DEFAULT_THRESHOLDS, ScanContext };

export class AemAuditScanner {
  private ctx: AemScannerContext;
  private options: ScannerOptions;

  constructor(options: ScannerOptions) {
    this.options = options;
    this.ctx = new AemScannerContext(options);
  }

  /**
   * Run the full scan pipeline.
   * Returns findings map and stats.
   */
  async scan(): Promise<{ findings: FindingsMap; stats: StatsMap }> {
    const { root } = this.options;
    if (!root || !fs.existsSync(root)) {
      throw new Error(`Root path does not exist: ${root}`);
    }

    console.log('[AEM Scanner] Collecting project files...');
    const java = this.ctx.javaFiles();
    const xml = this.ctx.xmlFiles();
    const htl = this.ctx.htlFiles();
    const js = this.ctx.jsFiles();
    const css = this.ctx.cssFiles();
    const frontendSrc = this.ctx.frontendSrcFiles();
    const frontendInfo = this.ctx.detectFrontendFramework();

    console.log(`[AEM Scanner] Java: ${java.length}, XML: ${xml.length}, HTL: ${htl.length}, JS: ${js.length}, CSS: ${css.length}`);
    if (frontendSrc.length > 0) {
      console.log(`[AEM Scanner] Frontend Src: ${frontendSrc.length} files (${frontendInfo?.framework || 'vanilla'}${frontendInfo?.version ? ' ' + frontendInfo.version : ''})`);
    }

    const startTime = Date.now();

    // 1. Performance
    this.runSafe('Performance', () => scanPerformance(this.ctx, java, xml, htl));

    // 2. Code Quality
    this.runSafe('Code Quality', () => scanCodeQuality(this.ctx, java, xml, htl));

    // 3. Security
    this.runSafe('Security', () => scanSecurity(this.ctx, java, xml, htl));

    // 4. SEO
    this.runSafe('SEO', () => scanSeo(this.ctx, java, xml, htl));

    // 5. Accessibility
    this.runSafe('Accessibility', () => scanAccessibility(this.ctx, java, xml, htl));

    // 6. Architecture
    this.runSafe('Architecture', () => scanArchitecture(this.ctx, java, xml, htl));

    // 7. Sling & OSGi
    this.runSafe('Sling & OSGi', () => scanSlingOsgi(this.ctx, java, xml, htl));

    // 8. Cloud Readiness
    this.runSafe('Cloud Readiness', () => scanCloudReadiness(this.ctx, java, xml, htl));

    // 9. Dispatcher
    this.runSafe('Dispatcher', () => scanDispatcher(this.ctx, java, xml, htl));

    // 10. Test Coverage
    this.runSafe('Test Coverage', () => scanTestCoverage(this.ctx, java, xml, htl));

    // 11. Maintainability
    this.runSafe('Maintainability', () => scanMaintainability(this.ctx, java, xml, htl));

    // 12. HTL & Frontend
    this.runSafe('HTL & Frontend', () => scanHtlFrontend(this.ctx, java, xml, htl));

    // 13. Frontend Framework (React/Angular/Vue)
    this.runSafe('Frontend Framework', () => scanFrontendFramework(this.ctx, frontendSrc, frontendInfo));

    // 14. AMS-Specific Rules
    this.runSafe('AMS Specific', () => scanAmsSpecific(this.ctx, java, xml, htl));

    const duration = Date.now() - startTime;

    return {
      findings: this.ctx.findings,
      stats: this.buildStats(java, xml, htl, js, css, frontendSrc, duration),
    };
  }

  private runSafe(label: string, fn: () => void): void {
    try {
      console.log(`[AEM Scanner] Scanning: ${label}...`);
      fn();
      const count = this.ctx.findings[label]?.length || 0;
      if (count > 0) console.log(`[AEM Scanner]   → ${count} findings`);
    } catch (err: any) {
      console.error(`[AEM Scanner] Error in ${label}: ${err.message}`);
    }
  }

  private buildStats(java: string[], xml: string[], htl: string[], js: string[], css: string[], frontendSrc: string[], duration: number): StatsMap {
    const totalFindings = Object.values(this.ctx.findings).reduce((sum, arr) => sum + arr.length, 0);
    const severityCounts: Record<string, number> = {};
    for (const arr of Object.values(this.ctx.findings)) {
      for (const f of arr) {
        severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
      }
    }

    return {
      totalFiles: java.length + xml.length + htl.length + js.length + css.length + frontendSrc.length,
      javaFiles: java.length,
      xmlFiles: xml.length,
      htlFiles: htl.length,
      jsFiles: js.length,
      cssFiles: css.length,
      totalFindings,
      categories: Object.keys(this.ctx.findings).length,
      severityCounts,
      scanDuration: duration,
    };
  }
}
