/**
 * Performance Analyzer — EDS-PERF-001 through EDS-PERF-020
 * Covers: render-blocking, images, bundles, CLS, resource hints,
 * fonts, TBT, INP, payload budget, second-origin, preloads,
 * font strategy, lazy LCP, eager loading, image formats,
 * long tasks, CSS containment, unused CSS, tag managers, video autoplay.
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
    this.checkUnnecessaryResourceHints(files, findings);
    this.checkFontLoading(files, findings);
    this.checkTBT(files, findings);
    this.checkINP(files, findings);
    this.checkPayloadBudget(files, findings);
    this.checkSecondOrigin(files, findings);
    this.checkUnnecessaryPreloads(files, findings);
    this.checkFontLoadingStrategy(files, findings);
    // New EDS-PERF-013 through EDS-PERF-020
    this.checkLazyLCPImage(files, findings);
    this.checkMissingEagerLoading(files, findings);
    this.checkImageFormat(files, findings);
    this.checkLongTasks(files, findings);
    this.checkCSSContainment(files, findings);
    this.checkUnusedCSS(files, findings);
    this.checkTagManagers(files, findings);
    this.checkVideoAutoplay(files, findings);
    return findings;
  }

  private checkRenderBlockingScripts(files: ProjectFiles, findings: Finding[]): void {
    if (files.headHtml) {
      const lines = files.headHtml.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Allow nonce-based first-party scripts (EDS 2025 pattern)
        if (/nonce="aem"/.test(line)) continue;
        if (/<script\s+src="https?:\/\//.test(line) && !/async|defer|type="application\/ld\+json"/.test(line)) {
          findings.push({
            rule: 'EDS-PERF-001',
            severity: 'CRITICAL',
            category: this.category,
            description: 'Render-blocking third-party script in head.html',
            file: 'head.html',
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: `Move third-party script to scripts/delayed.js:\n\n// scripts/delayed.js\nimport { loadScript } from './aem.js';\nexport default async function loadDelayed() {\n  await loadScript('${line.match(/src="([^"]+)"/)?.[1] || 'https://...'}');\n}`,
            score: 10,
          });
        }
      }
    }

    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    if (scriptsJs) {
      const lines = scriptsJs.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/import\s+.*from\s+['"]https:\/\//.test(lines[i])) {
          const url = lines[i].match(/['"]https:\/\/[^'"]+['"]/)?.[0] || '';
          findings.push({
            rule: 'EDS-PERF-001',
            severity: 'CRITICAL',
            category: this.category,
            description: 'Third-party import in scripts.js critical path',
            file: 'scripts/scripts.js',
            line: i + 1,
            code: lines[i].trim().substring(0, 120),
            recommendation: `Move to delayed.js or dynamically import in the specific block that needs it:\n\n// In block file:\nconst module = await import(${url});`,
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
        if (/createElement\s*\(\s*['"]img['"]\s*\)/.test(line)) {
          if (!/createOptimizedPicture/.test(file.content)) {
            findings.push({
              rule: 'EDS-PERF-002',
              severity: 'HIGH',
              category: this.category,
              description: 'Image created without createOptimizedPicture utility',
              file: file.path,
              line: i + 1,
              code: line.trim().substring(0, 120),
              recommendation: `Replace manual img creation with createOptimizedPicture from aem.js:\n\nimport { createOptimizedPicture } from '../../scripts/aem.js';\n\n// Instead of: document.createElement('img')\nconst picture = createOptimizedPicture(src, alt, eager, [{ width: '750' }]);`,
              score: 7,
            });
            break;
          }
        }

        if (/backgroundImage.*url\(/.test(line) && !/\?width=/.test(line)) {
          findings.push({
            rule: 'EDS-PERF-002',
            severity: 'HIGH',
            category: this.category,
            description: 'Background image without width optimization parameter',
            file: file.path,
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: `Append optimization params to image URL:\n\n// Before:\nel.style.backgroundImage = \`url(\${src})\`;\n\n// After:\nel.style.backgroundImage = \`url(\${src}?width=1200&format=webply)\`;`,
            score: 7,
          });
          break;
        }
      }
    }
  }

  private checkLargeBundles(files: ProjectFiles, findings: Finding[]): void {
    const heavyLibs = [
      { pattern: /import\s+.*from\s+['"]jquery/i, name: 'jQuery', size: '87KB', alt: 'native DOM APIs (querySelector, addEventListener)' },
      { pattern: /import\s+.*from\s+['"]lodash/i, name: 'Lodash', size: '72KB', alt: 'native Array/Object methods (map, filter, reduce, structuredClone)' },
      { pattern: /import\s+.*from\s+['"]moment/i, name: 'Moment.js', size: '67KB', alt: 'Intl.DateTimeFormat or day.js (2KB)' },
      { pattern: /import\s+.*from\s+['"]react/i, name: 'React', size: '40KB', alt: 'vanilla DOM manipulation (createElement, appendChild)' },
      { pattern: /import\s+.*from\s+['"]vue/i, name: 'Vue', size: '33KB', alt: 'vanilla DOM with event delegation' },
      { pattern: /import\s+.*from\s+['"]@angular/i, name: 'Angular', size: '100KB+', alt: 'vanilla Web Components if needed' },
      { pattern: /import\s+.*from\s+['"]swiper/i, name: 'Swiper', size: '140KB', alt: 'CSS scroll-snap with minimal JS' },
      { pattern: /import\s+.*from\s+['"]axios/i, name: 'Axios', size: '13KB', alt: 'native fetch() API' },
      { pattern: /import\s+.*from\s+['"]gsap/i, name: 'GSAP', size: '60KB', alt: 'CSS animations + Web Animations API' },
      { pattern: /import\s+.*from\s+['"]three/i, name: 'Three.js', size: '150KB+', alt: 'lazy-load in delayed.js only when 3D block is visible' },
      { pattern: /import\s+.*from\s+['"]chart\.?js/i, name: 'Chart.js', size: '65KB', alt: 'CSS charts or lazy-load after LCP' },
      { pattern: /import\s+.*from\s+['"]d3/i, name: 'D3', size: '80KB+', alt: 'vanilla SVG manipulation or lazy-load after LCP' },
      { pattern: /import\s+.*from\s+['"]animate\.?css/i, name: 'Animate.css', size: '80KB', alt: 'CSS @keyframes (only animate what you need)' },
      { pattern: /import\s+.*from\s+['"]bootstrap/i, name: 'Bootstrap', size: '60KB', alt: 'EDS native CSS grid/flexbox (already responsive)' },
      { pattern: /import\s+.*from\s+['"]tailwindcss/i, name: 'Tailwind CSS', size: '300KB+', alt: 'EDS block-scoped CSS (styles/styles.css + block CSS)' },
    ];

    for (const file of files.blockJs) {
      for (const lib of heavyLibs) {
        if (lib.pattern.test(file.content)) {
          findings.push({
            rule: 'EDS-PERF-003',
            severity: 'HIGH',
            category: this.category,
            description: `Heavy library import: ${lib.name} (~${lib.size})`,
            file: file.path,
            recommendation: `Remove ${lib.name} and use ${lib.alt}. EDS blocks should be < 10KB. The 100KB pre-LCP budget doesn't allow large libraries.`,
            score: 7,
          });
        }
      }

      const lineCount = file.content.split('\n').length;
      if (lineCount > 200) {
        findings.push({
          rule: 'EDS-PERF-003',
          severity: 'MEDIUM',
          category: this.category,
          description: `Block JS file is ${lineCount} lines — likely exceeds 10KB target`,
          file: file.path,
          recommendation: `Split into smaller modules:\n\n// ${file.path} — keep only decorate()\nexport default function decorate(block) { ... }\n\n// Extract helpers to:\n// scripts/utils.js or blocks/${file.path.split('/')[1]}/helpers.js`,
          score: 4,
        });
      }
    }
  }

  private checkCLS(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\.innerHTML\s*=.*<img\s+(?!.*width=)(?!.*height=)/.test(lines[i])) {
          findings.push({
            rule: 'EDS-PERF-004',
            severity: 'HIGH',
            category: this.category,
            description: 'Image injected via innerHTML without width/height (causes CLS)',
            file: file.path,
            line: i + 1,
            code: lines[i].trim().substring(0, 120),
            recommendation: `Add width/height to prevent layout shift:\n\n// Before: <img src="...">\n// After:  <img src="..." width="400" height="300" loading="lazy">\n\n// Or use createOptimizedPicture() which handles this automatically`,
            score: 7,
          });
          break;
        }
      }
    }

    for (const file of files.blockCss) {
      if (/height:\s*auto/.test(file.content) && !/aspect-ratio/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-004',
          severity: 'MEDIUM',
          category: this.category,
          description: 'CSS height:auto without aspect-ratio — potential CLS',
          file: file.path,
          recommendation: `Add aspect-ratio to maintain layout stability:\n\n.block img {\n  width: 100%;\n  height: auto;\n  aspect-ratio: 16 / 9; /* prevents CLS during load */\n}`,
          score: 4,
        });
      }
    }
  }

  /** EDS-PERF-005: Preconnects/resource hints HURT performance before LCP */
  private checkUnnecessaryResourceHints(files: ProjectFiles, findings: Finding[]): void {
    if (!files.headHtml) return;
    const lines = files.headHtml.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Flag preconnects as HARMFUL (per Adobe keeping-it-100)
      if (/<link\s+rel="preconnect"/i.test(line)) {
        const href = line.match(/href="([^"]+)"/)?.[1] || '';
        findings.push({
          rule: 'EDS-PERF-005',
          severity: 'HIGH',
          category: this.category,
          description: `Preconnect to ${href} hurts mobile LCP — consumes 100KB bandwidth budget`,
          file: 'head.html',
          line: i + 1,
          code: line.trim().substring(0, 120),
          recommendation: `Remove preconnect and load external resources in delayed.js (after LCP):\n\n// Remove from head.html:\n// ${line.trim()}\n\n// Instead, in scripts/delayed.js:\nimport { loadCSS } from './aem.js';\nloadCSS('${href.includes('fonts') ? href.replace(/^https:\/\/[^/]+/, 'https://fonts.googleapis.com/css2?family=...') : href}');`,
          score: 7,
        });
      }

      // Flag fetchpriority="high" as counterproductive
      if (/fetchpriority\s*=\s*["']high["']/i.test(line)) {
        findings.push({
          rule: 'EDS-PERF-005',
          severity: 'HIGH',
          category: this.category,
          description: 'fetchpriority="high" does NOT improve LCP but has negative mobile impact',
          file: 'head.html',
          line: i + 1,
          code: line.trim().substring(0, 120),
          recommendation: `Remove fetchpriority="high" — Adobe research shows it hurts more than helps.\nThe browser already prioritizes LCP images discovered in HTML.`,
          score: 7,
        });
      }
    }
  }

  private checkFontLoading(files: ProjectFiles, findings: Finding[]): void {
    const allCss = [...files.css, ...files.blockCss];
    for (const file of allCss) {
      const fontFaces = file.content.match(/@font-face\s*\{[^}]+\}/g) || [];
      for (const ff of fontFaces) {
        if (!/font-display/.test(ff)) {
          findings.push({
            rule: 'EDS-PERF-006',
            severity: 'MEDIUM',
            category: this.category,
            description: '@font-face missing font-display property (causes FOIT)',
            file: file.path,
            recommendation: `Add font-display: swap to prevent invisible text:\n\n@font-face {\n  font-family: 'YourFont';\n  src: url('/fonts/your-font.woff2') format('woff2');\n  font-display: swap; /* Show fallback immediately, swap when loaded */\n}`,
            score: 4,
          });
          break;
        }
        if (/font-display:\s*block/.test(ff)) {
          findings.push({
            rule: 'EDS-PERF-006',
            severity: 'MEDIUM',
            category: this.category,
            description: 'font-display: block causes invisible text (FOIT) until font loads',
            file: file.path,
            recommendation: `Change to swap or optional:\n\n// font-display: block  → text invisible for 3s\n// font-display: swap   → shows fallback immediately\n// font-display: optional → best for non-critical fonts`,
            score: 4,
          });
          break;
        }
      }

      if (/wght@(\d+;){5,}/.test(file.content) || /wght@\d{3},\d{3},\d{3},\d{3},\d{3}/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-006',
          severity: 'MEDIUM',
          category: this.category,
          description: 'Loading 5+ font weights — each adds ~20-50KB download',
          file: file.path,
          recommendation: `Limit to 2-3 weights actually used:\n\n// Before: family=Roboto:wght@100;200;300;400;500;600;700;800;900\n// After:  family=Roboto:wght@400;700 (only regular + bold)`,
          score: 4,
        });
      }
    }
  }

  private checkTBT(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      let appendCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/\.appendChild\(/.test(lines[i])) appendCount++;
      }
      if (appendCount > 5 && !/createDocumentFragment|replaceChildren/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-007',
          severity: 'HIGH',
          category: this.category,
          description: `${appendCount} appendChild calls without DocumentFragment — causes DOM thrashing/reflows`,
          file: file.path,
          recommendation: `[WHAT] Batch DOM mutations into a single reflow\n[WHY] Each appendChild triggers layout recalculation — ${appendCount} reflows blocks main thread\n[HOW]\n// Before (causes ${appendCount} reflows):\nitems.forEach(item => container.appendChild(item));\n\n// After (single reflow):\nconst fragment = document.createDocumentFragment();\nitems.forEach(item => fragment.appendChild(item));\ncontainer.replaceChildren(fragment);\n[IMPACT] Reduces TBT by ~${appendCount * 5}ms, prevents jank during page load`,
          score: 7,
        });
      }

      // Detect querySelectorAll inside scroll/resize handlers (layout thrashing)
      if (/addEventListener\s*\(\s*['"](?:scroll|resize)['"][\s\S]{0,200}querySelectorAll/.test(file.content)) {
        if (!/requestAnimationFrame|throttle|IntersectionObserver/.test(file.content)) {
          findings.push({
            rule: 'EDS-PERF-007',
            severity: 'HIGH',
            category: this.category,
            description: 'querySelectorAll inside scroll/resize handler without throttle — layout thrashing',
            file: file.path,
            recommendation: `[WHAT] Throttle scroll/resize handlers or use IntersectionObserver\n[WHY] querySelectorAll forces layout recalculation on every scroll frame (60fps = 60 forced layouts/sec)\n[HOW]\n// Before:\nwindow.addEventListener('scroll', () => {\n  document.querySelectorAll('.item').forEach(...);\n});\n\n// After (IntersectionObserver):\nconst observer = new IntersectionObserver((entries) => {\n  entries.forEach(entry => { if (entry.isIntersecting) { /* ... */ } });\n});\ndocument.querySelectorAll('.item').forEach(el => observer.observe(el));\n[IMPACT] Eliminates forced reflows, reduces TBT by 100-500ms on scroll-heavy pages`,
            score: 7,
          });
        }
      }
    }
  }

  private checkINP(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      if (/addEventListener\s*\(\s*['"]input['"][\s\S]{0,50}fetch\(/.test(file.content)) {
        if (!/debounce|setTimeout|clearTimeout/.test(file.content)) {
          findings.push({
            rule: 'EDS-PERF-008',
            severity: 'HIGH',
            category: this.category,
            description: 'Fetch on every input keystroke without debounce — INP failure',
            file: file.path,
            recommendation: `[WHAT] Debounce input handlers that trigger network requests\n[WHY] Every keystroke fires fetch → blocks main thread → INP > 200ms\n[HOW]\nlet timer;\ninput.addEventListener('input', (e) => {\n  clearTimeout(timer);\n  timer = setTimeout(async () => {\n    const results = await fetch(\`/api/search?q=\${e.target.value}\`);\n    renderResults(await results.json());\n  }, 300);\n});\n[IMPACT] Reduces INP from 500ms+ to < 100ms on search inputs`,
            score: 7,
          });
        }
      }

      // Detect scroll/resize without requestAnimationFrame
      const scrollResizePattern = /addEventListener\s*\(\s*['"](?:scroll|resize)['"]/;
      if (scrollResizePattern.test(file.content) && !/requestAnimationFrame|IntersectionObserver|ResizeObserver/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-008',
          severity: 'MEDIUM',
          category: this.category,
          description: 'Scroll/resize handler without requestAnimationFrame — causes input delay',
          file: file.path,
          recommendation: `[WHAT] Wrap scroll/resize handlers in requestAnimationFrame\n[WHY] Unthrottled handlers fire 60+ times/sec, blocking input processing\n[HOW]\nlet ticking = false;\nwindow.addEventListener('scroll', () => {\n  if (!ticking) {\n    requestAnimationFrame(() => {\n      // Your scroll logic here\n      ticking = false;\n    });\n    ticking = true;\n  }\n});\n[IMPACT] Reduces INP by 50-200ms on pages with scroll interactions`,
          score: 4,
        });
      }
    }
  }

  /** EDS-PERF-009: 100KB pre-LCP payload budget */
  private checkPayloadBudget(files: ProjectFiles, findings: Finding[]): void {
    let totalSize = 0;
    const criticalFiles: { path: string; size: number }[] = [];

    // Check styles.css, scripts.js, aem.js sizes
    for (const file of files.scriptJs) {
      if (file.path === 'scripts/scripts.js' || file.path === 'scripts/aem.js') {
        const size = file.content.length;
        totalSize += size;
        criticalFiles.push({ path: file.path, size });
      }
    }
    for (const file of files.css) {
      if (file.path === 'styles/styles.css') {
        const size = file.content.length;
        totalSize += size;
        criticalFiles.push({ path: file.path, size });
      }
    }

    // Include head.html inline content in budget
    if (files.headHtml) {
      const inlineScripts = files.headHtml.content.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
      const inlineStyles = files.headHtml.content.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [];
      const inlineSize = [...inlineScripts, ...inlineStyles].reduce((sum, s) => sum + s.length, 0);
      if (inlineSize > 0) {
        totalSize += inlineSize;
        criticalFiles.push({ path: 'head.html (inline)', size: inlineSize });
      }
    }

    if (totalSize > 100000) {
      const breakdown = criticalFiles.map(f => `${f.path}: ${Math.round(f.size / 1024)}KB`).join(', ');
      findings.push({
        rule: 'EDS-PERF-009',
        severity: 'CRITICAL',
        category: this.category,
        description: `Pre-LCP payload ${Math.round(totalSize / 1024)}KB exceeds 100KB budget (${breakdown})`,
        recommendation: `[WHAT] Reduce critical path payload to < 100KB\n[WHY] Adobe's "keeping-it-100" rule: everything before LCP must fit in 100KB for mobile 3G users\n[HOW]\n// styles.css: Remove unused styles, extract block-specific CSS to block folders\n// scripts.js: Keep minimal orchestration only, move logic to individual blocks\n// head.html: Remove inline scripts/styles, defer to delayed.js\n// aem.js: Should be < 15KB (don't modify)\n\nCurrent: ${Math.round(totalSize / 1024)}KB → Target: < 100KB\nBreakdown: ${breakdown}\n[IMPACT] Each KB over budget adds ~10ms to LCP on mobile 3G`,
        score: 10,
      });
    } else if (totalSize > 80000) {
      const breakdown = criticalFiles.map(f => `${f.path}: ${Math.round(f.size / 1024)}KB`).join(', ');
      findings.push({
        rule: 'EDS-PERF-009',
        severity: 'MEDIUM',
        category: this.category,
        description: `Pre-LCP payload ${Math.round(totalSize / 1024)}KB approaching 100KB budget limit (${breakdown})`,
        recommendation: `[WHAT] Pre-LCP payload at ${Math.round(totalSize / 1024)}KB — close to 100KB limit\n[WHY] Only 20KB headroom left. Adding one more block CSS could push over budget\n[HOW] Audit styles.css for unused rules, ensure no block-specific styles leak into global CSS\n[IMPACT] Preventive — keeps LCP stable as project grows`,
        score: 4,
      });
    }
  }

  /** EDS-PERF-010: Second-origin resources before LCP */
  private checkSecondOrigin(files: ProjectFiles, findings: Finding[]): void {
    // Check styles.css for external @import
    for (const file of files.css) {
      if (file.path === 'styles/styles.css') {
        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (/@import\s+url\s*\(\s*['"]https:\/\//.test(lines[i])) {
            const url = lines[i].match(/url\s*\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] || '';
            findings.push({
              rule: 'EDS-PERF-010',
              severity: 'HIGH',
              category: this.category,
              description: `External @import in styles.css — second-origin penalty adds 1-3s on mobile`,
              file: file.path,
              line: i + 1,
              code: lines[i].trim().substring(0, 120),
              recommendation: `Move external CSS to delayed.js (loads after LCP):\n\n// Remove from styles.css:\n// @import url('${url}');\n\n// Add to scripts/delayed.js:\nimport { loadCSS } from './aem.js';\nexport default async function loadDelayed() {\n  loadCSS('${url}');\n}`,
              score: 7,
            });
          }
        }
      }
    }

    // Check head.html for external resources (non-CSP)
    if (files.headHtml) {
      const lines = files.headHtml.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip CSP meta (contains URLs but doesn't fetch them)
        if (/Content-Security-Policy/.test(line)) continue;
        // Skip nonce-based first-party scripts
        if (/nonce="aem"/.test(line)) continue;
        // Skip same-origin stylesheets
        if (/<link\s+rel="stylesheet"\s+href="\//.test(line)) continue;

        if (/<link\s+rel="stylesheet"\s+href="https:\/\//.test(line)) {
          const href = line.match(/href="([^"]+)"/)?.[1] || '';
          findings.push({
            rule: 'EDS-PERF-010',
            severity: 'HIGH',
            category: this.category,
            description: `External stylesheet in head.html adds second-origin penalty`,
            file: 'head.html',
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: `Move to delayed.js:\n\n// Remove from head.html\n// Add to scripts/delayed.js:\nimport { loadCSS } from './aem.js';\nloadCSS('${href}');`,
            score: 7,
          });
        }
      }
    }
  }

  /** EDS-PERF-011: Unnecessary preloads */
  private checkUnnecessaryPreloads(files: ProjectFiles, findings: Finding[]): void {
    if (!files.headHtml) return;
    const lines = files.headHtml.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (/<link\s+rel="preload"/i.test(lines[i])) {
        const href = lines[i].match(/href="([^"]+)"/)?.[1] || '';
        findings.push({
          rule: 'EDS-PERF-011',
          severity: 'MEDIUM',
          category: this.category,
          description: `Preload "${href}" wastes mobile bandwidth — browser discovers linked resources automatically`,
          file: 'head.html',
          line: i + 1,
          code: lines[i].trim().substring(0, 120),
          recommendation: `Remove the preload — EDS resources are already discoverable by the HTML parser:\n\n// Remove: ${lines[i].trim()}\n// The browser finds <link rel="stylesheet"> and <script src="..."> without preload hints.`,
          score: 4,
        });
      }
    }
  }

  /** EDS-PERF-012: Non-conditional font loading */
  private checkFontLoadingStrategy(files: ProjectFiles, findings: Finding[]): void {
    // Check if fonts are loaded in styles.css (eager) instead of delayed.js
    for (const file of files.css) {
      if (file.path === 'styles/styles.css' || file.path === 'styles/fonts.css') {
        const fontFaceCount = (file.content.match(/@font-face/g) || []).length;
        if (fontFaceCount > 3) {
          findings.push({
            rule: 'EDS-PERF-012',
            severity: 'MEDIUM',
            category: this.category,
            description: `${fontFaceCount} @font-face declarations loaded eagerly — blocks rendering`,
            file: file.path,
            recommendation: `Load fonts conditionally in delayed.js (after LCP):\n\n// Move @font-face declarations to styles/fonts.css\n// Load in scripts/delayed.js:\nexport default async function loadDelayed() {\n  loadCSS('/styles/fonts.css');\n}`,
            score: 4,
          });
        }
      }
    }

    // Check for Google Fonts in CSS (not via delayed.js)
    for (const file of files.css) {
      if (/@import.*fonts\.googleapis\.com/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-012',
          severity: 'HIGH',
          category: this.category,
          description: 'Google Fonts @import in CSS — blocks rendering and adds second-origin penalty',
          file: file.path,
          recommendation: `[WHAT] Remove Google Fonts @import from CSS\n[WHY] @import is render-blocking AND adds second-origin DNS+TLS penalty (1-3s on mobile)\n[HOW]\n// Option 1: Self-host (best performance)\n// Download .woff2 files to /fonts/ and use local @font-face\n\n// Option 2: Load after LCP in scripts/delayed.js:\nimport { loadCSS } from './aem.js';\nexport default async function loadDelayed() {\n  loadCSS('https://fonts.googleapis.com/css2?family=...');\n}\n[IMPACT] Removes 1-3s render-blocking penalty on mobile`,
          score: 7,
        });
      }
    }
  }

  /** EDS-PERF-013: Lazy-loaded LCP image kills Largest Contentful Paint */
  private checkLazyLCPImage(files: ProjectFiles, findings: Finding[]): void {
    // Hero block is typically the LCP element — check if it uses loading="lazy"
    const heroBlocks = files.blockJs.filter((f) =>
      /blocks\/hero\/|blocks\/banner\/|blocks\/marquee\/|blocks\/teaser\//.test(f.path)
    );

    for (const file of heroBlocks) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Detect loading="lazy" on images in hero/above-the-fold blocks
        if (/loading\s*[=:]\s*['"]lazy['"]/.test(line) || /\.loading\s*=\s*['"]lazy['"]/.test(line)) {
          findings.push({
            rule: 'EDS-PERF-013',
            severity: 'CRITICAL',
            category: this.category,
            description: `LCP image in ${file.path.split('/')[1]} block uses loading="lazy" — destroys LCP score`,
            file: file.path,
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: `[WHAT] Remove loading="lazy" from hero/above-the-fold images\n[WHY] Lazy-loaded LCP images are delayed until after layout — adds 2-5s to LCP on mobile\n[HOW]\n// In your hero block decorate():\nconst img = block.querySelector('img');\nimg.removeAttribute('loading'); // Let browser load eagerly\nimg.setAttribute('fetchpriority', 'high'); // Prioritize LCP image\n\n// Or use createOptimizedPicture with eager=true:\nimport { createOptimizedPicture } from '../../scripts/aem.js';\nconst picture = createOptimizedPicture(src, alt, true); // 3rd arg = eager\n[IMPACT] LCP improvement of 2-5s on mobile — single biggest performance win`,
            score: 10,
          });
          break;
        }
      }
    }

    // Also check if scripts.js forces lazy on all images (common mistake)
    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    if (scriptsJs) {
      const lines = scriptsJs.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/querySelectorAll\s*\(\s*['"]img['"]/.test(lines[i])) {
          // Look ahead for loading=lazy being set on all images
          const context = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
          if (/loading\s*=\s*['"]lazy['"]/.test(context) && !/above.*fold|eager|lcp/i.test(context)) {
            findings.push({
              rule: 'EDS-PERF-013',
              severity: 'HIGH',
              category: this.category,
              description: 'All images forced to loading="lazy" in scripts.js — LCP image affected',
              file: scriptsJs.path,
              line: i + 1,
              code: lines[i].trim().substring(0, 120),
              recommendation: `[WHAT] Exclude above-the-fold images from blanket lazy loading\n[WHY] First visible image (hero/banner) is usually LCP — lazy-loading it adds seconds\n[HOW]\n// Only lazy-load images below the fold:\ndocument.querySelectorAll('img').forEach((img, idx) => {\n  if (idx > 0) img.loading = 'lazy'; // Skip first image (likely LCP)\n});\n[IMPACT] Preserves fast LCP while still lazy-loading off-screen images`,
              score: 7,
            });
            break;
          }
        }
      }
    }
  }

  /** EDS-PERF-014: First block image should use eager loading */
  private checkMissingEagerLoading(files: ProjectFiles, findings: Finding[]): void {
    const heroBlocks = files.blockJs.filter((f) =>
      /blocks\/hero\/|blocks\/banner\/|blocks\/marquee\/|blocks\/teaser\//.test(f.path)
    );

    for (const file of heroBlocks) {
      // Check if the hero block handles eager loading
      if (!/eager|fetchpriority/.test(file.content) && /img|picture|image/i.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-014',
          severity: 'HIGH',
          category: this.category,
          description: `${file.path.split('/')[1]} block doesn't set eager loading on its primary image`,
          file: file.path,
          recommendation: `[WHAT] Set eager loading on the hero/banner primary image\n[WHY] EDS auto-applies loading="lazy" — hero blocks must explicitly override to "eager"\n[HOW]\nexport default function decorate(block) {\n  const img = block.querySelector('img');\n  if (img) {\n    img.loading = 'eager';\n    img.fetchPriority = 'high'; // Tell browser this is the LCP image\n  }\n}\n\n// Or with createOptimizedPicture:\nconst picture = createOptimizedPicture(src, alt, true); // eager=true\n[IMPACT] LCP improves by 1-3s when hero image loads without lazy delay`,
          score: 7,
        });
      }
    }

    // Check scripts/aem.js for default eager behavior on first image
    const aemJs = files.scriptJs.find((f) => f.path === 'scripts/aem.js');
    if (aemJs && !/decorateBlock[\s\S]{0,500}eager/.test(aemJs.content)) {
      // Check if scripts.js handles first section eager
      const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
      if (scriptsJs && !/first.*section.*eager|section\[0\].*eager|eager.*first/i.test(scriptsJs.content)) {
        findings.push({
          rule: 'EDS-PERF-014',
          severity: 'MEDIUM',
          category: this.category,
          description: 'No eager loading strategy for first visible section images',
          file: 'scripts/scripts.js',
          recommendation: `[WHAT] Mark first section images as eager in loadEager()\n[WHY] EDS loadEager() phase should ensure LCP images aren't lazy-loaded\n[HOW]\n// In scripts/scripts.js loadEager():\nasync function loadEager(doc) {\n  // ...\n  const firstSection = doc.querySelector('.section');\n  if (firstSection) {\n    firstSection.querySelectorAll('img').forEach(img => {\n      img.loading = 'eager';\n    });\n  }\n}\n[IMPACT] Ensures LCP image always loads immediately regardless of block implementation`,
          score: 4,
        });
      }
    }
  }

  /** EDS-PERF-015: Unoptimized image formats (PNG/JPEG/GIF without ?format=webply) */
  private checkImageFormat(files: ProjectFiles, findings: Finding[]): void {
    const allJs = [...files.blockJs, ...files.scriptJs];
    for (const file of allJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Detect hardcoded image references without format optimization
        const imgUrlMatch = line.match(/['"`](https?:\/\/[^'"`]+\.(?:png|jpg|jpeg|gif))[^?]*['"`]/i);
        if (imgUrlMatch && !/format=webp|format=avif|createOptimizedPicture/.test(line)) {
          findings.push({
            rule: 'EDS-PERF-015',
            severity: 'MEDIUM',
            category: this.category,
            description: `Image URL uses legacy format without WebP/AVIF optimization`,
            file: file.path,
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: `[WHAT] Use AEM image optimization parameters for WebP delivery\n[WHY] WebP is 25-35% smaller than JPEG, AVIF is 50% smaller than JPEG\n[HOW]\n// Before:\nconst img = '${imgUrlMatch[1]}';\n\n// After (AEM CDN auto-converts):\nconst img = '${imgUrlMatch[1]}?width=750&format=webply&optimize=medium';\n\n// Best: Use createOptimizedPicture() which handles this automatically:\nimport { createOptimizedPicture } from '../../scripts/aem.js';\nconst picture = createOptimizedPicture(src, alt, false, [{ width: '750' }]);\n[IMPACT] 25-50% smaller images → faster LCP and reduced bandwidth`,
            score: 4,
          });
          break;
        }
      }
    }

    // Check CSS for background images without optimization
    for (const file of files.blockCss) {
      const bgImageMatches = file.content.match(/url\(['"]?(https?:\/\/[^)'"]+\.(?:png|jpg|jpeg|gif))[^)]*['"]?\)/gi) || [];
      if (bgImageMatches.length > 0 && !/format=webp|format=avif/.test(file.content)) {
        findings.push({
          rule: 'EDS-PERF-015',
          severity: 'MEDIUM',
          category: this.category,
          description: `CSS background-image uses unoptimized format (${bgImageMatches.length} instance${bgImageMatches.length > 1 ? 's' : ''})`,
          file: file.path,
          recommendation: `[WHAT] Add format optimization to CSS background-image URLs\n[WHY] CSS images bypass <picture> element — must manually request WebP format\n[HOW]\n/* Before: */\nbackground-image: url('image.jpg');\n\n/* After: */\nbackground-image: url('image.jpg?width=1200&format=webply&optimize=medium');\n[IMPACT] 25-35% smaller background images on every page load`,
          score: 4,
        });
      }
    }
  }

  /** EDS-PERF-016: Long tasks / synchronous heavy operations */
  private checkLongTasks(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');

      // Detect large inline JSON.parse / data processing
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // JSON.parse on potentially large data without chunking
        if (/JSON\.parse\s*\(/.test(line) && /fetch|response|data/i.test(lines.slice(Math.max(0, i - 3), i + 1).join('\n'))) {
          const context = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
          if (/\.forEach|\.map|\.filter/.test(context) && !/requestIdleCallback|setTimeout|queueMicrotask/.test(context)) {
            findings.push({
              rule: 'EDS-PERF-016',
              severity: 'HIGH',
              category: this.category,
              description: 'JSON.parse + immediate iteration on fetched data — potential long task (> 50ms)',
              file: file.path,
              line: i + 1,
              code: line.trim().substring(0, 120),
              recommendation: `[WHAT] Defer heavy data processing to avoid blocking main thread\n[WHY] JSON.parse + iteration on large datasets creates long tasks (> 50ms) that block INP\n[HOW]\n// Before:\nconst data = JSON.parse(await response.text());\ndata.forEach(item => renderItem(item)); // Blocks main thread\n\n// After (chunked processing):\nconst data = JSON.parse(await response.text());\nconst CHUNK = 50;\nfor (let i = 0; i < data.length; i += CHUNK) {\n  await new Promise(r => requestAnimationFrame(r));\n  data.slice(i, i + CHUNK).forEach(item => renderItem(item));\n}\n[IMPACT] Eliminates long tasks, keeps INP < 200ms even with large datasets`,
              score: 7,
            });
            break;
          }
        }
      }

      // Detect synchronous loops that could be heavy
      for (let i = 0; i < lines.length; i++) {
        if (/for\s*\(\s*let\s+\w+\s*=\s*0;\s*\w+\s*<\s*\w+\.length/.test(lines[i])) {
          const loopBody = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
          if (/DOM|querySelector|innerHTML|insertAdjacentHTML|appendChild/.test(loopBody) && loopBody.split('\n').length > 8) {
            findings.push({
              rule: 'EDS-PERF-016',
              severity: 'MEDIUM',
              category: this.category,
              description: 'For-loop with DOM manipulation — potential long task if collection is large',
              file: file.path,
              line: i + 1,
              recommendation: `[WHAT] Batch DOM operations or use DocumentFragment\n[WHY] DOM manipulation in loops forces synchronous layout/paint per iteration\n[HOW]\nconst fragment = document.createDocumentFragment();\nfor (const item of items) {\n  const el = document.createElement('div');\n  el.textContent = item.title;\n  fragment.appendChild(el);\n}\ncontainer.appendChild(fragment); // Single DOM write\n[IMPACT] Converts N reflows to 1, reducing TBT proportionally`,
              score: 4,
            });
            break;
          }
        }
      }
    }
  }

  /** EDS-PERF-017: Missing CSS containment for off-screen blocks */
  private checkCSSContainment(files: ProjectFiles, findings: Finding[]): void {
    // Check if any block CSS uses contain property
    let hasAnyContain = false;
    for (const file of files.blockCss) {
      if (/contain\s*:/.test(file.content)) {
        hasAnyContain = true;
        break;
      }
    }

    // Check global styles for content-visibility
    let hasContentVisibility = false;
    for (const file of files.css) {
      if (/content-visibility\s*:/.test(file.content)) {
        hasContentVisibility = true;
        break;
      }
    }

    // Only flag if project has 5+ blocks and uses neither technique
    if (files.blockCss.length >= 5 && !hasAnyContain && !hasContentVisibility) {
      findings.push({
        rule: 'EDS-PERF-017',
        severity: 'LOW',
        category: this.category,
        description: `${files.blockCss.length} blocks without CSS containment or content-visibility — browser renders all blocks upfront`,
        recommendation: `[WHAT] Add content-visibility: auto to off-screen sections\n[WHY] Browser skips rendering off-screen blocks until user scrolls near them\n[HOW]\n/* In styles/styles.css — apply to sections below the fold: */\nmain .section:nth-child(n+3) {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 500px; /* Estimated height for scroll bar accuracy */\n}\n\n/* Or per-block in block CSS: */\n.block-name {\n  contain: content; /* Isolates layout/paint from rest of page */\n}\n[IMPACT] 30-50% faster initial render on long pages (skips off-screen work)`,
        score: 1,
      });
    }
  }

  /** EDS-PERF-018: Block CSS with potentially unused selectors */
  private checkUnusedCSS(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockCss) {
      const blockName = file.path.match(/blocks\/([^\/]+)\//)?.[1];
      if (!blockName) continue;

      const cssLines = file.content.split('\n').length;
      // Flag oversized block CSS (EDS blocks should have minimal CSS)
      if (cssLines > 150) {
        findings.push({
          rule: 'EDS-PERF-018',
          severity: 'MEDIUM',
          category: this.category,
          description: `Block CSS "${blockName}" is ${cssLines} lines — likely contains unused rules or should be split`,
          file: file.path,
          recommendation: `[WHAT] Audit and trim block CSS to only used selectors\n[WHY] Block CSS loads when block appears — oversized CSS delays that block's render\n[HOW]\n// 1. Check for dead selectors (media queries for breakpoints never hit)\n// 2. Remove duplicate properties inherited from styles.css\n// 3. Split into variants if block has multiple appearances:\n//    blocks/${blockName}/${blockName}.css (base)\n//    blocks/${blockName}/${blockName}-hero.css (variant)\n\n// Target: Block CSS should be < 50 lines / < 3KB\nCurrent: ${cssLines} lines → Target: < 150 lines\n[IMPACT] Reduces per-block render time, keeps page payload lean`,
          score: 4,
        });
      }
    }

    // Check global styles.css for block-specific selectors that should be in block CSS
    for (const file of files.css) {
      if (file.path === 'styles/styles.css') {
        const blockSelectors = file.content.match(/\.(?:block-|hero|banner|carousel|tabs|accordion|cards|columns)[^{]*/g) || [];
        if (blockSelectors.length > 5) {
          findings.push({
            rule: 'EDS-PERF-018',
            severity: 'MEDIUM',
            category: this.category,
            description: `styles.css contains ${blockSelectors.length} block-specific selectors — increases critical CSS payload`,
            file: file.path,
            recommendation: `[WHAT] Move block-specific styles from styles.css to respective block CSS files\n[WHY] styles.css loads on EVERY page (pre-LCP). Block-specific styles only needed when that block appears.\n[HOW]\n// Move from styles/styles.css:\n// .hero { ... }\n// .cards { ... }\n\n// To respective block folders:\n// blocks/hero/hero.css\n// blocks/cards/cards.css\n\n// styles.css should only contain: typography, colors, layout grid, default spacing\n[IMPACT] Reduces pre-LCP payload — directly improves LCP on pages without those blocks`,
            score: 4,
          });
        }
      }
    }
  }

  /** EDS-PERF-019: Tag manager loaded before delayed.js phase */
  private checkTagManagers(files: ProjectFiles, findings: Finding[]): void {
    const tagManagerPatterns = [
      { pattern: /googletagmanager\.com\/gtm\.js/, name: 'Google Tag Manager', size: '80-100KB' },
      { pattern: /google-analytics\.com\/analytics\.js/, name: 'Google Analytics (legacy)', size: '45KB' },
      { pattern: /googletagmanager\.com\/gtag/, name: 'Google Analytics 4 (gtag)', size: '50KB' },
      { pattern: /assets\.adobedtm\.com|launch-\w+\.adoberesources\.net/, name: 'Adobe Launch/DTM', size: '60-150KB' },
      { pattern: /cdn\.segment\.com/, name: 'Segment', size: '70KB' },
      { pattern: /js\.hs-scripts\.com|js\.hs-analytics\.net/, name: 'HubSpot Tracking', size: '50KB' },
      { pattern: /connect\.facebook\.net\/en_US\/fbevents\.js/, name: 'Meta Pixel', size: '60KB' },
      { pattern: /snap\.licdn\.com\/li\.lms-analytics/, name: 'LinkedIn Insight', size: '40KB' },
    ];

    // Check head.html for tag managers (CRITICAL — render-blocking)
    if (files.headHtml) {
      const lines = files.headHtml.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/nonce="aem"/.test(line)) continue; // Skip AEM first-party
        for (const tm of tagManagerPatterns) {
          if (tm.pattern.test(line)) {
            findings.push({
              rule: 'EDS-PERF-019',
              severity: 'CRITICAL',
              category: this.category,
              description: `${tm.name} (~${tm.size}) loaded in head.html — blocks rendering, exceeds 100KB budget`,
              file: 'head.html',
              line: i + 1,
              code: line.trim().substring(0, 120),
              recommendation: `[WHAT] Move ${tm.name} to scripts/delayed.js (post-LCP phase)\n[WHY] Tag managers in head.html are render-blocking and blow the 100KB budget. Adobe's own recommendation: "zero third-party JS before LCP"\n[HOW]\n// Remove from head.html completely\n\n// Add to scripts/delayed.js:\nimport { loadScript } from './aem.js';\nexport default async function loadDelayed() {\n  // Load ${tm.name} after LCP (3-5s delay is standard)\n  await loadScript('...');\n}\n[IMPACT] Removes ${tm.size} from critical path → LCP improves by 2-5s on mobile`,
              score: 10,
            });
            break;
          }
        }
      }
    }

    // Check scripts.js for tag managers (HIGH — still in critical path)
    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    if (scriptsJs) {
      const lines = scriptsJs.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const tm of tagManagerPatterns) {
          if (tm.pattern.test(lines[i])) {
            findings.push({
              rule: 'EDS-PERF-019',
              severity: 'HIGH',
              category: this.category,
              description: `${tm.name} loaded in scripts.js (critical path) instead of delayed.js`,
              file: 'scripts/scripts.js',
              line: i + 1,
              code: lines[i].trim().substring(0, 120),
              recommendation: `[WHAT] Move ${tm.name} from scripts.js to delayed.js\n[WHY] scripts.js runs before LCP — tag manager adds ${tm.size} to critical path\n[HOW]\n// Remove from scripts/scripts.js\n// Add to scripts/delayed.js:\nexport default async function loadDelayed() {\n  await loadScript('...');\n}\n[IMPACT] Removes ${tm.size} from pre-LCP execution, improves TBT and LCP`,
              score: 7,
            });
            break;
          }
        }
      }
    }

    // Verify delayed.js exists and loads tag managers properly
    const delayedJs = files.scriptJs.find((f) => f.path === 'scripts/delayed.js');
    if (!delayedJs) {
      // Check if any block has third-party analytics
      const hasAnalytics = files.blockJs.some((f) =>
        tagManagerPatterns.some((tm) => tm.pattern.test(f.content))
      );
      if (hasAnalytics) {
        findings.push({
          rule: 'EDS-PERF-019',
          severity: 'HIGH',
          category: this.category,
          description: 'Analytics/tag manager found in block files instead of delayed.js',
          recommendation: `[WHAT] Create scripts/delayed.js to load all analytics post-LCP\n[WHY] Block JS runs during decorate phase — analytics there blocks content rendering\n[HOW]\n// Create scripts/delayed.js:\nimport { loadScript } from './aem.js';\n\nexport default async function loadDelayed() {\n  // All analytics load here (3-5s after page load)\n  await loadScript('https://www.googletagmanager.com/gtag/js?id=G-...');\n}\n[IMPACT] Moves all tracking to post-LCP phase — zero impact on user experience`,
          score: 7,
        });
      }
    }
  }

  /** EDS-PERF-020: Video autoplay without poster image */
  private checkVideoAutoplay(files: ProjectFiles, findings: Finding[]): void {
    const allJs = [...files.blockJs, ...files.scriptJs];
    for (const file of allJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect video element creation with autoplay
        if (/createElement\s*\(\s*['"]video['"]/.test(line) || /\.autoplay\s*=\s*true/.test(line)) {
          const context = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
          if (/autoplay/.test(context) && !/poster/.test(context)) {
            findings.push({
              rule: 'EDS-PERF-020',
              severity: 'HIGH',
              category: this.category,
              description: 'Video with autoplay but no poster — delays FCP until video frame renders',
              file: file.path,
              line: i + 1,
              code: line.trim().substring(0, 120),
              recommendation: `[WHAT] Add poster attribute to autoplay videos\n[WHY] Without poster, browser shows nothing until first video frame decodes — delays FCP/LCP\n[HOW]\nconst video = document.createElement('video');\nvideo.autoplay = true;\nvideo.muted = true; // Required for autoplay\nvideo.playsInline = true;\nvideo.poster = '/media_1234.jpeg?width=750&format=webply'; // Shows immediately\nvideo.innerHTML = '<source src="video.mp4" type="video/mp4">';\n\n// Also: lazy-load video if below the fold:\nif (!isAboveFold) {\n  video.preload = 'none';\n  // Use IntersectionObserver to start loading when visible\n}\n[IMPACT] FCP/LCP shows poster immediately instead of waiting for video decode (saves 1-3s)`,
              score: 7,
            });
            break;
          }
        }

        // Detect innerHTML with video autoplay
        if (/innerHTML[\s\S]{0,100}video[\s\S]{0,50}autoplay/.test(line) && !/poster/.test(line)) {
          findings.push({
            rule: 'EDS-PERF-020',
            severity: 'HIGH',
            category: this.category,
            description: 'Video autoplay via innerHTML without poster attribute',
            file: file.path,
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: `[WHAT] Add poster to video element for immediate visual feedback\n[WHY] Autoplay without poster = blank space until video loads and decodes first frame\n[HOW]\n// Add poster attribute:\n<video autoplay muted playsinline poster="/path/to/poster.jpg?width=750&format=webply">\n  <source src="video.mp4" type="video/mp4">\n</video>\n[IMPACT] Immediate visual content instead of blank space — improves FCP by 1-3s`,
            score: 7,
          });
          break;
        }
      }
    }
  }
}
