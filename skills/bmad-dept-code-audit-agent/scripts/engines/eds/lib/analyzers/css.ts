/**
 * CSS Analyzer — EDS-CSS-001 through EDS-CSS-006
 */
import * as path from 'path';
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class CssAnalyzer implements Analyzer {
  name = 'CSS';
  category = 'CSS';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkScopingConventions(files, findings);
    this.checkImportantOveruse(files, findings);
    this.checkFixedDimensions(files, findings);
    this.checkCustomProperties(files, findings);
    this.checkMediaQueries(files, findings);
    this.checkBreakpointConsistency(files, findings);
    return findings;
  }

  private checkScopingConventions(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockCss) {
      const blockName = path.basename(path.dirname(file.path));
      const selectorPattern = /^([^@/{}\n][^{]*)\{/gm;
      let match;
      let unscopedCount = 0;

      while ((match = selectorPattern.exec(file.content)) !== null) {
        const selector = match[1].trim();
        if (/^[:*@]|^html|^body|^:root/.test(selector)) continue;
        if (!selector.startsWith(`.${blockName}`) && !selector.includes(`.${blockName} `) && !selector.includes(`.${blockName}.`)) {
          unscopedCount++;
        }
      }

      if (unscopedCount > 3) {
        findings.push({
          rule: 'EDS-CSS-001',
          severity: 'HIGH',
          category: this.category,
          description: `${unscopedCount} selectors not scoped to .${blockName} — styles will leak to other blocks`,
          file: file.path,
          recommendation: `Scope all selectors to the block class:\n\n// Before:\n.card { ... }\n.title { ... }\n\n// After:\n.${blockName} .card { ... }\n.${blockName} .title { ... }\n\n// Or use the block wrapper directly:\n.${blockName} { ... }\n.${blockName} > div { ... }`,
          score: 7,
        });
      }
    }
  }

  private checkImportantOveruse(files: ProjectFiles, findings: Finding[]): void {
    const allCss = [...files.css, ...files.blockCss];
    for (const file of allCss) {
      const importants = (file.content.match(/!important/g) || []).length;
      if (importants > 3) {
        findings.push({
          rule: 'EDS-CSS-002',
          severity: 'MEDIUM',
          category: this.category,
          description: `${importants}x !important — indicates specificity wars (hard to maintain)`,
          file: file.path,
          recommendation: `Fix specificity with proper selectors instead of !important:\n\n// BAD: .card .title { color: red !important; }\n// GOOD: .cards .card .title { color: red; }\n\n// Or use :where() to reduce specificity of overridden styles:\n:where(.cards) .title { color: gray; } /* 0 specificity */\n.cards.dark .title { color: white; } /* easy to override */`,
          score: 4,
        });
      }
    }
  }

  private checkFixedDimensions(files: ProjectFiles, findings: Finding[]): void {
    const allCss = [...files.css, ...files.blockCss];
    for (const file of allCss) {
      const lines = file.content.split('\n');
      let fixedWidthCount = 0;

      for (let i = 0; i < lines.length; i++) {
        if (/^\s*width:\s*\d{4,}px/.test(lines[i])) {
          fixedWidthCount++;
        }
      }

      if (fixedWidthCount > 0) {
        findings.push({
          rule: 'EDS-CSS-003',
          severity: 'MEDIUM',
          category: this.category,
          description: `${fixedWidthCount} fixed pixel width(s) > 999px — breaks on mobile/tablet`,
          file: file.path,
          recommendation: `Use responsive units instead of fixed pixel widths:\n\n// Before: width: 1200px;\n// After:  max-width: 1200px; width: 100%;\n// Or:     width: min(1200px, 100%);\n// Or:     width: clamp(300px, 80vw, 1200px);`,
          score: 4,
        });
      }

      const pxFonts = (file.content.match(/font-size:\s*\d+px/g) || []).length;
      if (pxFonts > 3) {
        findings.push({
          rule: 'EDS-CSS-003',
          severity: 'LOW',
          category: this.category,
          description: `${pxFonts} fixed px font-size values — breaks accessibility zoom`,
          file: file.path,
          recommendation: `Use rem units for font-size (respects user zoom):\n\n// Before: font-size: 16px;\n// After:  font-size: 1rem;\n\n// Before: font-size: 24px;\n// After:  font-size: 1.5rem;\n\n// 1rem = user's preferred font size (usually 16px)`,
          score: 1,
        });
      }
    }
  }

  private checkCustomProperties(files: ProjectFiles, findings: Finding[]): void {
    const mainCss = files.css.find((f) => f.path.includes('styles/styles.css'));
    if (mainCss) {
      const hasRootVars = /:root\s*\{[^}]*--/.test(mainCss.content);
      if (!hasRootVars) {
        findings.push({
          rule: 'EDS-CSS-004',
          severity: 'MEDIUM',
          category: this.category,
          description: 'styles.css missing :root CSS custom properties (design tokens)',
          file: mainCss.path,
          recommendation: `Define design tokens in :root for consistency:\n\n:root {\n  /* Colors */\n  --color-brand: #0045ff;\n  --color-text: #202020;\n  --color-background: #ffffff;\n\n  /* Typography */\n  --body-font-family: system-ui, sans-serif;\n  --heading-font-family: var(--body-font-family);\n\n  /* Spacing */\n  --section-padding: 64px 16px;\n}`,
          score: 4,
        });
      }
    }

    for (const file of files.blockCss) {
      const hexColors = file.content.match(/#[a-f0-9]{3,8}\b/gi) || [];
      const uniqueColors = new Set(hexColors.map((c) => c.toLowerCase()));
      if (uniqueColors.size > 5) {
        findings.push({
          rule: 'EDS-CSS-004',
          severity: 'LOW',
          category: this.category,
          description: `${uniqueColors.size} unique hardcoded colors — should use design tokens`,
          file: file.path,
          recommendation: `Replace hardcoded colors with CSS variables:\n\n// Before: color: #0045ff;\n// After:  color: var(--color-brand);\n\n// Before: background: #f5f5f5;\n// After:  background: var(--color-background-alt);`,
          score: 1,
        });
      }
    }
  }

  private checkMediaQueries(files: ProjectFiles, findings: Finding[]): void {
    const allCss = [...files.css, ...files.blockCss];
    const breakpoints = new Set<string>();

    for (const file of allCss) {
      const mqMatches = file.content.match(/@media[^{]*/g) || [];
      for (const mq of mqMatches) {
        const widthMatch = mq.match(/(?:min|max)-width:\s*(\d+(?:px|em|rem))/);
        if (widthMatch) breakpoints.add(widthMatch[1]);
      }
    }

    if (breakpoints.size > 5) {
      findings.push({
        rule: 'EDS-CSS-005',
        severity: 'LOW',
        category: this.category,
        description: `${breakpoints.size} different breakpoints — inconsistent responsive behavior`,
        recommendation: `Standardize on EDS breakpoints (600px tablet, 900px desktop):\n\n/* Mobile-first base styles */\n.block { ... }\n\n@media (min-width: 600px) { /* tablet */ }\n@media (min-width: 900px) { /* desktop */ }\n\nFound: ${[...breakpoints].join(', ')}`,
        score: 1,
      });
    }
  }

  /** EDS-CSS-006: Inconsistent breakpoint values across blocks */
  private checkBreakpointConsistency(files: ProjectFiles, findings: Finding[]): void {
    const blockBreakpoints: Map<string, Set<string>> = new Map();
    const standardBreakpoints = ['600px', '900px', '1200px'];

    for (const file of files.blockCss) {
      const bps = new Set<string>();
      const mqMatches = file.content.match(/@media[^{]*/g) || [];
      for (const mq of mqMatches) {
        const widthMatch = mq.match(/(?:min|max)-width:\s*(\d+px)/);
        if (widthMatch) bps.add(widthMatch[1]);
      }
      if (bps.size > 0) blockBreakpoints.set(file.path, bps);

      // Check for mixing max-width and min-width in same file (paradigm mixing)
      const hasMinWidth = /@media[^{]*min-width/.test(file.content);
      const hasMaxWidth = /@media[^{]*max-width/.test(file.content);
      if (hasMinWidth && hasMaxWidth) {
        findings.push({
          rule: 'EDS-CSS-006',
          severity: 'LOW',
          category: this.category,
          description: 'Mixing min-width and max-width media queries — inconsistent approach',
          file: file.path,
          recommendation: `Use mobile-first (min-width only) for consistency:\n\n// Before (mixed):\n@media (max-width: 768px) { ... } /* desktop-down */\n@media (min-width: 900px) { ... } /* mobile-up */\n\n// After (mobile-first only):\n.block { /* mobile styles */ }\n@media (min-width: 600px) { /* tablet */ }\n@media (min-width: 900px) { /* desktop */ }`,
          score: 1,
        });
      }

      // Check for non-standard breakpoints
      for (const bp of bps) {
        const pxValue = parseInt(bp, 10);
        if (![600, 900, 1200].includes(pxValue) && ![768, 1024].includes(pxValue)) {
          // Non-standard and not common alternative
          if (pxValue > 400 && pxValue < 1600) {
            findings.push({
              rule: 'EDS-CSS-006',
              severity: 'LOW',
              category: this.category,
              description: `Non-standard breakpoint ${bp} — may conflict with other blocks`,
              file: file.path,
              recommendation: `Use standard EDS breakpoints for consistency:\n\n// Standard: 600px (tablet), 900px (desktop), 1200px (wide)\n// Your value: ${bp} → Consider using ${pxValue < 750 ? '600px' : pxValue < 1050 ? '900px' : '1200px'}`,
              score: 1,
            });
            break; // One per file
          }
        }
      }
    }
  }
}
