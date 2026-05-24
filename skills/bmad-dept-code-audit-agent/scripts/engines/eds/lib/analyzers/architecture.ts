/**
 * Architecture Analyzer — EDS-ARCH-001 through EDS-ARCH-007
 */
import * as path from 'path';
import { Finding, ProjectFiles, EDSConfig, Analyzer, FileContent } from '../types';

export class ArchitectureAnalyzer implements Analyzer {
  name = 'Architecture';
  category = 'Architecture';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];

    // EDS-ARCH-001: Block Structure Violation
    this.checkBlockStructure(files, findings);

    // EDS-ARCH-002: Direct DOM Manipulation Outside Block Scope
    this.checkDomScope(files, findings);

    // EDS-ARCH-003: Missing Eager/Lazy Loading Strategy
    this.checkLoadingStrategy(files, findings);

    // EDS-ARCH-004: Improper Block Variant Pattern
    this.checkBlockVariants(files, findings);

    // EDS-ARCH-005: Improper head.html Structure
    this.checkHeadHtml(files, findings);

    // EDS-ARCH-006: Auto-Blocking Not Implemented
    this.checkAutoBlocking(files, findings);

    // EDS-ARCH-007: Section Metadata Misuse
    this.checkSectionMetadata(files, findings);

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
        recommendation: 'Create head.html with viewport meta, favicon, and preconnects only',
        score: 7,
      });
      return;
    }

    const content = files.headHtml.content;

    // Check for render-blocking scripts
    const scriptMatches = content.match(/<script\s+(?!.*type="application\/ld\+json")[^>]*src=/gi);
    if (scriptMatches) {
      for (const match of scriptMatches) {
        if (!/async|defer/.test(match)) {
          findings.push({
            rule: 'EDS-ARCH-005',
            severity: 'HIGH',
            category: this.category,
            description: 'Render-blocking script in head.html',
            file: 'head.html',
            code: match.substring(0, 120),
            recommendation: 'Move to scripts/delayed.js or add async/defer attribute',
            score: 7,
          });
        }
      }
    }

    // Check for inline styles
    if (/<style>/.test(content)) {
      findings.push({
        rule: 'EDS-ARCH-005',
        severity: 'HIGH',
        category: this.category,
        description: 'Inline <style> block in head.html',
        file: 'head.html',
        recommendation: 'Move styles to styles/styles.css',
        score: 7,
      });
    }

    // Check for external stylesheets (non-preconnect)
    const extStylesheets = content.match(/<link\s+rel="stylesheet"\s+href="https:\/\//gi);
    if (extStylesheets) {
      findings.push({
        rule: 'EDS-ARCH-005',
        severity: 'HIGH',
        category: this.category,
        description: 'External stylesheet loaded in head.html (render-blocking)',
        file: 'head.html',
        recommendation: 'Use preconnect + load font CSS in scripts/delayed.js or use @font-face in styles.css',
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
      // Check for heavy section metadata processing
      const sectionDataAccess = (file.content.match(/section\.dataset\.\w+/g) || []).length;
      if (sectionDataAccess > 5) {
        findings.push({
          rule: 'EDS-ARCH-007',
          severity: 'MEDIUM',
          category: this.category,
          description: `Excessive section metadata access (${sectionDataAccess} references) — may indicate business logic in section metadata`,
          file: file.path,
          recommendation: 'Section metadata should only drive styling/behavior, not business logic. Move data to block content rows.',
          score: 4,
        });
      }
    }
  }
}
