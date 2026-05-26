/**
 * Architecture Analyzer — EDS-ARCH-001 through EDS-ARCH-012
 */
import * as path from 'path';
import { Finding, ProjectFiles, EDSConfig, Analyzer, FileContent } from '../types';

export class ArchitectureAnalyzer implements Analyzer {
  name = 'Architecture';
  category = 'Architecture';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];

    this.checkBlockStructure(files, findings);
    this.checkDomScope(files, findings);
    this.checkLoadingStrategy(files, findings);
    this.checkBlockVariants(files, findings);
    this.checkHeadHtml(files, findings);
    this.checkAutoBlocking(files, findings);
    this.checkSectionMetadata(files, findings);
    this.checkLangAttribute(files, findings);
    this.checkBodyHidden(files, findings);
    this.checkReservedClasses(files, findings);
    this.checkWaitForFirstImage(files, findings);
    this.checkFragmentLoading(files, findings);

    return findings;
  }

  private checkBlockStructure(files: ProjectFiles, findings: Finding[]): void {
    const blockDirs = new Map<string, FileContent[]>();

    for (const file of files.blockJs) {
      const dir = path.dirname(file.path);
      if (!blockDirs.has(dir)) blockDirs.set(dir, []);
      blockDirs.get(dir)!.push(file);
    }

    for (const [dir, jsFiles] of blockDirs) {
      const dirName = path.basename(dir);
      for (const file of jsFiles) {
        const fileName = path.basename(file.path, '.js');

        // Check filename matches folder
        if (fileName !== dirName && !file.path.includes('shared/')) {
          findings.push({
            rule: 'EDS-ARCH-001',
            severity: 'HIGH',
            category: this.category,
            description: `Block filename "${fileName}.js" doesn't match folder name "${dirName}/"`,
            file: file.path,
            recommendation: `Rename to ${dirName}.js or move to blocks/${fileName}/`,
            score: 7,
          });
        }

        // Check for export default function decorate
        const hasDecorate = /export\s+default\s+(async\s+)?function\s+decorate\s*\(\s*block\s*\)/.test(file.content);
        const hasNamedExport = /function\s+decorate\s*\(\s*block\s*\)[\s\S]*export\s+default\s+decorate/.test(file.content);
        const hasArrowExport = /export\s+default\s+(async\s+)?\(\s*block\s*\)\s*=>/.test(file.content);

        if (!hasDecorate && !hasNamedExport && !hasArrowExport) {
          // Skip utility files
          if (!file.path.includes('shared/') && !file.path.includes('utils')) {
            findings.push({
              rule: 'EDS-ARCH-001',
              severity: 'HIGH',
              category: this.category,
              description: `Block missing "export default function decorate(block)" signature`,
              file: file.path,
              recommendation: 'Add: export default function decorate(block) { ... }',
              score: 7,
            });
          }
        }

        // Check for CJS
        if (/module\.exports/.test(file.content)) {
          findings.push({
            rule: 'EDS-ARCH-001',
            severity: 'HIGH',
            category: this.category,
            description: 'Block uses CommonJS (module.exports) instead of ESM',
            file: file.path,
            recommendation: 'Use: export default function decorate(block) { ... }',
            score: 7,
          });
        }
      }
    }
  }

  private checkDomScope(files: ProjectFiles, findings: Finding[]): void {
    const badPatterns = [
      { regex: /document\.querySelector\s*\(\s*['"](?!meta|link|head|html|body)/g, msg: 'document.querySelector() used outside block scope' },
      { regex: /document\.querySelectorAll\s*\(\s*['"](?!meta|link)/g, msg: 'document.querySelectorAll() used outside block scope' },
      { regex: /document\.getElementById\s*\(/g, msg: 'document.getElementById() used — breaks block isolation' },
      { regex: /document\.getElementsByClassName\s*\(/g, msg: 'document.getElementsByClassName() used — breaks block isolation' },
    ];

    for (const file of files.blockJs) {
      // Skip header/footer/nav blocks (legitimately global)
      const blockName = path.basename(path.dirname(file.path));
      if (['header', 'footer', 'nav', 'navigation'].includes(blockName)) continue;

      for (const pattern of badPatterns) {
        const matches = file.content.match(pattern.regex);
        if (matches) {
          const lines = file.content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (pattern.regex.test(lines[i])) {
              // Reset lastIndex since we reuse the regex
              pattern.regex.lastIndex = 0;
              findings.push({
                rule: 'EDS-ARCH-002',
                severity: 'MEDIUM',
                category: this.category,
                description: pattern.msg,
                file: file.path,
                line: i + 1,
                code: lines[i].trim().substring(0, 120),
                recommendation: 'Use block.querySelector() to stay within block scope',
                score: 4,
              });
              break; // One finding per pattern per file
            }
          }
        }
        pattern.regex.lastIndex = 0;
      }
    }
  }

  private checkLoadingStrategy(files: ProjectFiles, findings: Finding[]): void {
    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    const delayedJs = files.scriptJs.find((f) => f.path === 'scripts/delayed.js');

    if (scriptsJs) {
      // Check for LCP_BLOCKS definition
      if (!/LCP_BLOCKS|waitForLCP/i.test(scriptsJs.content)) {
        findings.push({
          rule: 'EDS-ARCH-003',
          severity: 'MEDIUM',
          category: this.category,
          description: 'No LCP_BLOCKS definition or waitForLCP usage found in scripts.js',
          file: 'scripts/scripts.js',
          recommendation: 'Define LCP_BLOCKS array and use waitForLCP() for above-fold blocks',
          score: 4,
        });
      }

      // Check for loadDelayed / delayed import
      if (!/loadDelayed|import\s*\(\s*['"].*delayed/i.test(scriptsJs.content)) {
        findings.push({
          rule: 'EDS-ARCH-003',
          severity: 'MEDIUM',
          category: this.category,
          description: 'No delayed loading phase found in scripts.js',
          file: 'scripts/scripts.js',
          recommendation: 'Add loadDelayed() function that imports delayed.js for non-critical scripts',
          score: 4,
        });
      }
    }

    if (!delayedJs) {
      findings.push({
        rule: 'EDS-ARCH-003',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Missing scripts/delayed.js — no delayed loading phase',
        recommendation: 'Create scripts/delayed.js for analytics, chat widgets, and non-critical third-party scripts',
        score: 4,
      });
    }
  }

  private checkBlockVariants(files: ProjectFiles, findings: Finding[]): void {
    const blockDirs = new Set<string>();
    for (const file of files.blockJs) {
      blockDirs.add(path.basename(path.dirname(file.path)));
    }

    // Detect variant-as-separate-block pattern
    const potentialVariants: Map<string, string[]> = new Map();
    for (const dir of blockDirs) {
      const parts = dir.split('-');
      if (parts.length >= 2) {
        const base = parts[0];
        if (blockDirs.has(base) && base !== dir) {
          if (!potentialVariants.has(base)) potentialVariants.set(base, []);
          potentialVariants.get(base)!.push(dir);
        }
      }
    }

    for (const [base, variants] of potentialVariants) {
      findings.push({
        rule: 'EDS-ARCH-004',
        severity: 'MEDIUM',
        category: this.category,
        description: `Possible variant blocks as separate folders: ${variants.join(', ')} (base: ${base})`,
        recommendation: `Use CSS variants via block class: "${base} (${variants.map(v => v.replace(base + '-', '')).join(', ')})" in authoring table`,
        score: 4,
      });
    }
  }

  private checkHeadHtml(files: ProjectFiles, findings: Finding[]): void {
    if (!files.headHtml) {
      findings.push({
        rule: 'EDS-ARCH-005',
        severity: 'HIGH',
        category: this.category,
        description: 'Missing head.html file',
        recommendation: `Create head.html with nonce-based scripts (2025 pattern):\n\n<meta http-equiv="Content-Security-Policy"\n  content="script-src 'nonce-aem' 'strict-dynamic' 'unsafe-inline' http: https:; base-uri 'self'; object-src 'none';"\n  move-to-http-header="true">\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<script nonce="aem" src="/scripts/aem.js" type="module"></script>\n<script nonce="aem" src="/scripts/scripts.js" type="module"></script>\n<link rel="stylesheet" href="/styles/styles.css"/>`,
        score: 7,
      });
      return;
    }

    const content = files.headHtml.content;
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Allow nonce-based first-party scripts (this is CORRECT in 2025 boilerplate)
      if (/nonce="aem"/.test(line)) continue;
      // Allow JSON-LD structured data
      if (/type="application\/ld\+json"/.test(line)) continue;

      // Flag third-party scripts without nonce
      if (/<script\s+(?!.*nonce).*src="https?:\/\//.test(line)) {
        findings.push({
          rule: 'EDS-ARCH-005',
          severity: 'HIGH',
          category: this.category,
          description: 'Third-party script in head.html without nonce — move to delayed.js',
          file: 'head.html',
          line: i + 1,
          code: line.trim().substring(0, 120),
          recommendation: `Remove third-party scripts from head.html. Load in delayed.js:\n\n// scripts/delayed.js\nimport { loadScript } from './aem.js';\nexport default async function loadDelayed() {\n  await loadScript('...');\n}`,
          score: 7,
        });
      }

      // Flag inline scripts (not nonce'd)
      if (/<script>/.test(line)) {
        findings.push({
          rule: 'EDS-ARCH-005',
          severity: 'HIGH',
          category: this.category,
          description: 'Inline <script> in head.html — not allowed by nonce-based CSP',
          file: 'head.html',
          line: i + 1,
          code: line.trim().substring(0, 120),
          recommendation: `Move inline script logic to scripts/scripts.js:\n\n// Instead of <script>window.dataLayer=[]</script>\n// Put in scripts/scripts.js or delayed.js`,
          score: 7,
        });
      }
    }

    // Check for inline styles
    if (/<style>/.test(content)) {
      findings.push({
        rule: 'EDS-ARCH-005',
        severity: 'HIGH',
        category: this.category,
        description: 'Inline <style> block in head.html — move to styles.css',
        file: 'head.html',
        recommendation: `Move all styles to styles/styles.css. head.html should have no <style> blocks.`,
        score: 7,
      });
    }

    // Check for external stylesheets from third-party CDNs
    if (/<link\s+rel="stylesheet"\s+href="https:\/\//.test(content)) {
      findings.push({
        rule: 'EDS-ARCH-005',
        severity: 'HIGH',
        category: this.category,
        description: 'External third-party stylesheet in head.html — adds second-origin penalty',
        file: 'head.html',
        recommendation: `Move external CSS to delayed.js:\n\n// scripts/delayed.js\nimport { loadCSS } from './aem.js';\nloadCSS('https://fonts.googleapis.com/...');`,
        score: 7,
      });
    }
  }

  private checkAutoBlocking(files: ProjectFiles, findings: Finding[]): void {
    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    if (!scriptsJs) return;

    if (!/buildAutoBlocks|autoBlock/i.test(scriptsJs.content)) {
      findings.push({
        rule: 'EDS-ARCH-006',
        severity: 'LOW',
        category: this.category,
        description: 'No auto-blocking implementation found in scripts.js',
        file: 'scripts/scripts.js',
        recommendation: 'Consider buildAutoBlocks() for common patterns (hero, embeds)',
        score: 1,
      });
    }
  }

  private checkSectionMetadata(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const sectionDataAccess = (file.content.match(/section\.dataset\.\w+/g) || []).length;
      if (sectionDataAccess > 5) {
        findings.push({
          rule: 'EDS-ARCH-007',
          severity: 'MEDIUM',
          category: this.category,
          description: `Excessive section metadata access (${sectionDataAccess} references) — business logic in section metadata`,
          file: file.path,
          recommendation: `Section metadata should only drive styling/presentation. Move data to block content rows:\n\n// BAD: section.dataset.apiEndpoint, section.dataset.maxItems\n// GOOD: Read config from block's own table rows via readBlockConfig(block)`,
          score: 4,
        });
      }
    }
  }

  /** EDS-ARCH-008: Missing lang attribute */
  private checkLangAttribute(files: ProjectFiles, findings: Finding[]): void {
    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    if (!scriptsJs) return;

    if (!/documentElement\.lang|\.lang\s*=/.test(scriptsJs.content)) {
      // Check if aem.js sets it
      const aemJs = files.scriptJs.find((f) => f.path === 'scripts/aem.js');
      if (!aemJs || !/documentElement\.lang|\.lang\s*=/.test(aemJs.content)) {
        findings.push({
          rule: 'EDS-ARCH-008',
          severity: 'MEDIUM',
          category: this.category,
          description: 'No mechanism to set document lang attribute — accessibility issue (WCAG 3.1.1)',
          file: 'scripts/scripts.js',
          recommendation: `Set lang from page metadata in scripts.js:\n\nfunction buildPage() {\n  const lang = getMetadata('lang') || 'en';\n  document.documentElement.lang = lang;\n}`,
          score: 4,
        });
      }
    }
  }

  /** EDS-ARCH-009: Missing body-hidden anti-flicker */
  private checkBodyHidden(files: ProjectFiles, findings: Finding[]): void {
    const mainCss = files.css.find((f) => f.path === 'styles/styles.css');
    if (!mainCss) return;

    const hasBodyHidden = /body\s*\{[^}]*display:\s*none/.test(mainCss.content) ||
                          /body\s*\{[^}]*visibility:\s*hidden/.test(mainCss.content);
    const hasAppear = /\.appear|body\.appear/.test(mainCss.content);

    if (!hasBodyHidden && !hasAppear) {
      findings.push({
        rule: 'EDS-ARCH-009',
        severity: 'MEDIUM',
        category: this.category,
        description: 'No body-hidden/appear pattern — users see unstyled flash (FOUC)',
        file: 'styles/styles.css',
        recommendation: `Add FOUC prevention pattern:\n\n/* styles/styles.css */\nbody { display: none; }\nbody.appear { display: block; }\n\n/* scripts/scripts.js */\nasync function loadEager(doc) {\n  decorateMain(doc.querySelector('main'));\n  document.body.classList.add('appear');\n}`,
        score: 4,
      });
    }
  }

  /** EDS-ARCH-010: Using reserved/framework CSS class names */
  private checkReservedClasses(files: ProjectFiles, findings: Finding[]): void {
    const reserved = ['section', 'block', 'button-container', 'default-content-wrapper'];

    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const cls of reserved) {
          if (new RegExp(`classList\\.(add|toggle)\\(\\s*['"]${cls}['"]`).test(lines[i])) {
            findings.push({
              rule: 'EDS-ARCH-010',
              severity: 'MEDIUM',
              category: this.category,
              description: `Manually adding reserved framework class "${cls}" — conflicts with aem.js`,
              file: file.path,
              line: i + 1,
              code: lines[i].trim().substring(0, 120),
              recommendation: `Don't manually add framework classes. Use your own block-specific names:\n\n// BAD:  el.classList.add('${cls}')\n// GOOD: el.classList.add('${path.basename(path.dirname(file.path))}-wrapper')`,
              score: 4,
            });
            break;
          }
        }
      }
    }
  }

  /** EDS-ARCH-011: Missing waitForFirstImage pattern */
  private checkWaitForFirstImage(files: ProjectFiles, findings: Finding[]): void {
    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    if (!scriptsJs) return;

    if (!/waitForFirstImage|waitForLCP/.test(scriptsJs.content)) {
      // Check aem.js too
      const aemJs = files.scriptJs.find((f) => f.path === 'scripts/aem.js');
      if (!aemJs || !/waitForFirstImage|waitForLCP/.test(aemJs.content)) {
        findings.push({
          rule: 'EDS-ARCH-011',
          severity: 'LOW',
          category: this.category,
          description: 'No waitForFirstImage pattern — page may appear before LCP image loads',
          file: 'scripts/scripts.js',
          recommendation: `Add waitForFirstImage before showing the page:\n\nasync function waitForFirstImage(section) {\n  const img = section.querySelector('img');\n  await new Promise((resolve) => {\n    if (img && !img.complete) {\n      img.addEventListener('load', resolve);\n      img.addEventListener('error', resolve);\n    } else resolve();\n  });\n}\n\n// In loadEager:\nawait loadSection(main.querySelector('.section'), waitForFirstImage);\ndocument.body.classList.add('appear');`,
          score: 1,
        });
      }
    }
  }

  /** EDS-ARCH-012: Fragment loading without .plain.html */
  private checkFragmentLoading(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // fetch('/some-path') followed by innerHTML or append (without .plain.html)
        const fetchMatch = lines[i].match(/fetch\s*\(\s*[`'"](\/[^'"`.]+)[`'"]\s*\)/);
        if (fetchMatch) {
          const fetchedPath = fetchMatch[1];
          // If it doesn't end in .plain.html, .json, or have a file extension, it's likely a page fragment
          if (!fetchedPath.includes('.plain.html') && !fetchedPath.includes('.json') && !fetchedPath.match(/\.\w{2,4}$/)) {
            // Check if the response is used as HTML
            const nextLines = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
            if (/\.text\(\)|\.innerHTML|fragment|append/.test(nextLines)) {
              findings.push({
                rule: 'EDS-ARCH-012',
                severity: 'LOW',
                category: this.category,
                description: `Fragment fetched without .plain.html suffix — may get full page with header/footer`,
                file: file.path,
                line: i + 1,
                code: lines[i].trim().substring(0, 120),
                recommendation: `Append .plain.html to get content fragment only:\n\n// Before: fetch('${fetchedPath}')\n// After:  fetch('${fetchedPath}.plain.html')\n\n// .plain.html returns ONLY the content without page wrapper, header, footer`,
                score: 1,
              });
            }
          }
        }
      }
    }
  }
}
