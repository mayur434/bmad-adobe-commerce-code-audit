/**
 * CSS Analyzer — EDS-CSS-001 through EDS-CSS-005
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
    return findings;
  }

  private checkScopingConventions(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockCss) {
      const blockName = path.basename(path.dirname(file.path));
      // Check that selectors are scoped to .blockName
      const selectorPattern = /^([^@/{}\n][^{]*)\{/gm;
      let match;
      let unscopedCount = 0;

      while ((match = selectorPattern.exec(file.content)) !== null) {
        const selector = match[1].trim();
        // Skip :root, html, body, *, @media, @keyframes
        if (/^[:*@]|^html|^body|^:root/.test(selector)) continue;
        // Should start with .blockName
        if (!selector.startsWith(`.${blockName}`) && !selector.includes(`.${blockName} `) && !selector.includes(`.${blockName}.`)) {
          unscopedCount++;
        }
      }

      if (unscopedCount > 3) {
        findings.push({
          rule: 'EDS-CSS-001',
          severity: 'HIGH',
          category: this.category,
          description: `${unscopedCount} selectors not scoped to .${blockName} — may leak styles`,
          file: file.path,
          recommendation: `Prefix all selectors with .${blockName} to prevent style conflicts`,
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
          description: `${importants}x !important usage — indicates specificity battles`,
          file: file.path,
          recommendation: 'Fix specificity with proper selectors instead of !important overrides',
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
        // Fixed pixel widths (not max-width, not inside @media)
        if (/^\s*width:\s*\d{4,}px/.test(lines[i])) {
          fixedWidthCount++;
        }
      }

      if (fixedWidthCount > 0) {
        findings.push({
          rule: 'EDS-CSS-003',
          severity: 'MEDIUM',
          category: this.category,
          description: `${fixedWidthCount} fixed pixel width(s) > 999px — breaks responsiveness`,
          file: file.path,
          recommendation: 'Use max-width, percentage, or clamp() for responsive layouts',
          score: 4,
        });
      }

      // Check for px font sizes
      const pxFonts = (file.content.match(/font-size:\s*\d+px/g) || []).length;
      if (pxFonts > 3) {
        findings.push({
          rule: 'EDS-CSS-003',
          severity: 'LOW',
          category: this.category,
          description: `${pxFonts} fixed px font-size declarations — not accessible for zoom`,
          file: file.path,
          recommendation: 'Use rem/em units for font-size to respect user zoom preferences',
          score: 1,
        });
      }
    }
  }

  private checkCustomProperties(files: ProjectFiles, findings: Finding[]): void {
    // Check if project uses CSS custom properties at all
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
          recommendation: 'Define color, font, spacing tokens in :root { --color-primary: ...; }',
          score: 4,
        });
      }
    }

    // Check blocks for hardcoded colors instead of variables
    for (const file of files.blockCss) {
      const hexColors = file.content.match(/#[a-f0-9]{3,8}\b/gi) || [];
      const uniqueColors = new Set(hexColors.map((c) => c.toLowerCase()));
      if (uniqueColors.size > 5) {
        findings.push({
          rule: 'EDS-CSS-004',
          severity: 'LOW',
          category: this.category,
          description: `${uniqueColors.size} unique color values — should reference CSS variables`,
          file: file.path,
          recommendation: 'Use var(--color-xxx) tokens defined in styles.css :root',
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

    // EDS standard breakpoints: 600px (tablet), 900px (desktop)
    if (breakpoints.size > 5) {
      findings.push({
        rule: 'EDS-CSS-005',
        severity: 'LOW',
        category: this.category,
        description: `${breakpoints.size} different breakpoints used — inconsistent responsive behavior`,
        recommendation: `Standardize on EDS breakpoints (600px, 900px) or use CSS custom properties for breakpoints. Found: ${[...breakpoints].join(', ')}`,
        score: 1,
      });
    }
  }
}
