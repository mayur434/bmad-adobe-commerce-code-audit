/**
 * Performance Analyzer — EDS-PERF-001 through EDS-PERF-008
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class PerformanceAnalyzer implements Analyzer {
  name = 'Performance';
  category = 'Performance';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkRenderBlockingScripts(files, findings);
    this.checkUnoptimizedImages(files, findings);
    this.checkLargeBundles(files, findings);
    this.checkCLS(files, findings);
    this.checkResourceHints(files, findings);
    this.checkFontLoading(files, findings);
    this.checkTBT(files, findings);
    this.checkINP(files, findings);
    return findings;
  }

  private checkRenderBlockingScripts(files: ProjectFiles, findings: Finding[]): void {
    // Check head.html for blocking scripts
    if (files.headHtml) {
      const lines = files.headHtml.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/<script\s+src="https?:\/\//.test(line) && !/async|defer|type="application\/ld\+json"/.test(line)) {
          findings.push({
            rule: 'EDS-PERF-001',
            severity: 'CRITICAL',
            category: this.category,
            description: 'Render-blocking third-party script in head.html',
            file: 'head.html',
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: 'Move to scripts/delayed.js using loadScript() with async option',
            score: 10,
          });
        }
      }
    }

    // Check scripts.js for eager third-party imports
    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    if (scriptsJs) {
      const lines = scriptsJs.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/import\s+.*from\s+['"]https:\/\//.test(lines[i])) {
          findings.push({
            rule: 'EDS-PERF-001',
            severity: 'CRITICAL',
            category: this.category,
            description: 'Third-party import in scripts.js critical path',
            file: 'scripts/scripts.js',
            line: i + 1,
            code: lines[i].trim().substring(0, 120),
            recommendation: 'Move to delayed.js or dynamically import in specific block',
            score: 10,
          });
        }
      }
    }
  }

  private checkUnoptimizedImages(files: ProjectFiles, findings: Finding[]): void {
    const allJs = [...files.blockJs, ...files.scriptJs];
    for (const file of allJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // createElement('img') without createOptimizedPicture nearby
        if (/createElement\s*\(\s*['"]img['"]\s*\)/.test(line)) {
          // Check if createOptimizedPicture is imported or used in file
          if (!/createOptimizedPicture/.test(file.content)) {
            findings.push({
              rule: 'EDS-PERF-002',
              severity: 'HIGH',
              category: this.category,
              description: 'Image created without createOptimizedPicture utility',
              file: file.path,
              line: i + 1,
              recommendation: 'Use createOptimizedPicture() from aem.js for responsive WebP/AVIF images',
              score: 7,
            });
            break; // One per file
          }
        }

        // background-image with full URL (no width param)
        if (/backgroundImage.*url\(/.test(line) && !/\?width=/.test(line)) {
          findings.push({
            rule: 'EDS-PERF-002',
            severity: 'HIGH',
            category: this.category,
            description: 'Background image without width optimization parameter',
            file: file.path,
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: 'Append ?width=N&format=webply to image URLs for CDN optimization',
            score: 7,
          });
          break;
        }
      }
    }
  }

  private checkLargeBundles(files: ProjectFiles, findings: Finding[]): void {
    const heavyLibs = [
      { pattern: /import\s+.*from\s+['"]jquery/i, name: 'jQuery (~87KB)' },
      { pattern: /import\s+.*from\s+['"]lodash/i, name: 'Lodash (~72KB)' },
      { pattern: /import\s+.*from\s+['"]moment/i, name: 'Moment.js (~67KB)' },
      { pattern: /import\s+.*from\s+['"]react/i, name: 'React (~40KB)' },
      { pattern: /import\s+.*from\s+['"]vue/i, name: 'Vue (~33KB)' },
      { pattern: /import\s+.*from\s+['"]@angular/i, name: 'Angular (100KB+)' },
      { pattern: /import\s+.*from\s+['"]swiper/i, name: 'Swiper (~140KB)' },
      { pattern: /import\s+.*from\s+['"]axios/i, name: 'Axios (~13KB, use native fetch)' },
    ];

    for (const file of files.blockJs) {
      for (const lib of heavyLibs) {
        if (lib.pattern.test(file.content)) {
          findings.push({
            rule: 'EDS-PERF-003',
            severity: 'HIGH',
            category: this.category,
            description: `Heavy library import: ${lib.name}`,
            file: file.path,
            recommendation: 'Use native browser APIs or tiny purpose-built utilities. Block JS should be < 10KB gzipped.',
            score: 7,
          });
        }
      }

      // Check file size (rough heuristic: > 200 lines = potentially too large)
      const lineCount = file.content.split('\n').length;
      if (lineCount > 200) {
        findings.push({
          rule: 'EDS-PERF-003',
          severity: 'MEDIUM',
          category: this.category,
          description: `Block JS file is ${lineCount} lines — may exceed 10KB gzipped target`,
          file: file.path,
          recommendation: 'Consider splitting into smaller modules or extracting shared utilities to scripts/',
          score: 4,
        });
      }
    }
  }

  private checkCLS(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // innerHTML with img but no width/height
        if (/\.innerHTML\s*=.*<img\s+(?!.*width=)(?!.*height=)/.test(lines[i])) {
          findings.push({
            rule: 'EDS-PERF-004',
            severity: 'HIGH',
            category: this.category,
            description: 'Image injected via innerHTML without width/height attributes (causes CLS)',
            file: file.path,
            line: i + 1,
            recommendation: 'Add explicit width and height attributes to prevent layout shift',
            score: 7,
          });
          break;
        }
      }
    }

    // Check CSS for height:auto without aspect-ratio
    for (const file of files.blockCss) {
      if (/height:\s*auto/.test(file.content) && !/aspect-ratio/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-004',
          severity: 'MEDIUM',
          category: this.category,
          description: 'CSS height:auto without aspect-ratio — potential CLS',
          file: file.path,
          recommendation: 'Add aspect-ratio property to maintain layout stability',
          score: 4,
        });
      }
    }
  }

  private checkResourceHints(files: ProjectFiles, findings: Finding[]): void {
    if (!files.headHtml) return;
    const headContent = files.headHtml.content;

    // Collect all third-party origins used
    const originPattern = /https:\/\/([^\/'">\s]+)/g;
    const usedOrigins = new Set<string>();
    const preconnected = new Set<string>();

    // Find preconnected origins
    const preconnects = headContent.match(/<link\s+rel="preconnect"\s+href="https:\/\/([^"]+)"/g) || [];
    for (const pc of preconnects) {
      const m = pc.match(/href="https:\/\/([^"]+)"/);
      if (m) preconnected.add(m[1]);
    }

    // Find origins used in JS
    for (const file of [...files.blockJs, ...files.scriptJs]) {
      let m;
      while ((m = originPattern.exec(file.content)) !== null) {
        if (!m[1].includes('aem.page') && !m[1].includes('aem.live') && !m[1].includes('hlx.page')) {
          usedOrigins.add(m[1]);
        }
      }
    }

    // Check for fonts without preconnect
    if (headContent.includes('fonts.googleapis.com') && !preconnected.has('fonts.gstatic.com')) {
      findings.push({
        rule: 'EDS-PERF-005',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Google Fonts used without preconnect to fonts.gstatic.com',
        file: 'head.html',
        recommendation: 'Add: <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        score: 4,
      });
    }
  }

  private checkFontLoading(files: ProjectFiles, findings: Finding[]): void {
    const allCss = [...files.css, ...files.blockCss];
    for (const file of allCss) {
      // Check for @font-face without font-display
      const fontFaces = file.content.match(/@font-face\s*\{[^}]+\}/g) || [];
      for (const ff of fontFaces) {
        if (!/font-display/.test(ff)) {
          findings.push({
            rule: 'EDS-PERF-006',
            severity: 'MEDIUM',
            category: this.category,
            description: '@font-face missing font-display property (causes FOIT)',
            file: file.path,
            recommendation: 'Add font-display: swap; to @font-face declarations',
            score: 4,
          });
          break;
        }
        if (/font-display:\s*block/.test(ff)) {
          findings.push({
            rule: 'EDS-PERF-006',
            severity: 'MEDIUM',
            category: this.category,
            description: 'font-display: block causes invisible text until font loads',
            file: file.path,
            recommendation: 'Use font-display: swap or optional instead of block',
            score: 4,
          });
          break;
        }
      }

      // Check for excessive font weights
      if (/wght@(\d+;){5,}/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-006',
          severity: 'MEDIUM',
          category: this.category,
          description: 'Loading 5+ font weights — excessive download size',
          file: file.path,
          recommendation: 'Limit to 2-3 weights actually used in the design',
          score: 4,
        });
      }
    }
  }

  private checkTBT(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      // Check for multiple sequential appendChild calls in loops
      let appendCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/\.appendChild\(/.test(lines[i])) {
          appendCount++;
        }
      }
      if (appendCount > 5 && !/createDocumentFragment|replaceChildren/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-007',
          severity: 'HIGH',
          category: this.category,
          description: `${appendCount} appendChild calls without DocumentFragment — DOM thrashing`,
          file: file.path,
          recommendation: 'Build DOM in a DocumentFragment, then append once with block.replaceChildren(fragment)',
          score: 7,
        });
      }
    }
  }

  private checkINP(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      // Check for fetch on every input keystroke
      if (/addEventListener\s*\(\s*['"]input['"][\s\S]{0,50}fetch\(/.test(file.content)) {
        if (!/debounce|setTimeout|clearTimeout/.test(file.content)) {
          findings.push({
            rule: 'EDS-PERF-008',
            severity: 'HIGH',
            category: this.category,
            description: 'Fetch on every input event without debounce — INP risk',
            file: file.path,
            recommendation: 'Debounce input handlers: clearTimeout + setTimeout(fn, 300)',
            score: 7,
          });
        }
      }
    }
  }
}
