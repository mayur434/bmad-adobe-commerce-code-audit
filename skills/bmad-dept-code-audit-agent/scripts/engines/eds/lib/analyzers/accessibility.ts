/**
 * Accessibility Analyzer — EDS-A11Y-001 through EDS-A11Y-005
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class AccessibilityAnalyzer implements Analyzer {
  name = 'Accessibility';
  category = 'Accessibility';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkAriaAttributes(files, findings);
    this.checkKeyboardNav(files, findings);
    this.checkColorContrast(files, findings);
    this.checkImageAlts(files, findings);
    this.checkFocusManagement(files, findings);
    return findings;
  }

  private checkAriaAttributes(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      // Role without required ARIA attributes
      if (/role\s*=\s*['"]tab['"]/.test(file.content) && !/aria-selected/.test(file.content)) {
        findings.push({
          rule: 'EDS-A11Y-001',
          severity: 'HIGH',
          category: this.category,
          description: 'role="tab" used without aria-selected attribute',
          file: file.path,
          recommendation: 'Add aria-selected="true|false" to tabs and aria-controls to link tab-panel',
          score: 7,
        });
      }

      if (/role\s*=\s*['"]tabpanel['"]/.test(file.content) && !/aria-labelledby/.test(file.content)) {
        findings.push({
          rule: 'EDS-A11Y-001',
          severity: 'HIGH',
          category: this.category,
          description: 'role="tabpanel" without aria-labelledby',
          file: file.path,
          recommendation: 'Add aria-labelledby pointing to the associated tab element ID',
          score: 7,
        });
      }

      // Dialog without aria-label or aria-labelledby
      if (/role\s*=\s*['"]dialog['"]/.test(file.content)) {
        if (!/aria-label|aria-labelledby/.test(file.content)) {
          findings.push({
            rule: 'EDS-A11Y-001',
            severity: 'HIGH',
            category: this.category,
            description: 'role="dialog" without aria-label or aria-labelledby',
            file: file.path,
            recommendation: 'Add aria-label or aria-labelledby to name the dialog',
            score: 7,
          });
        }
      }

      // Check for click handler without role
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/addEventListener\s*\(\s*['"]click['"]/.test(lines[i]) || /\.onclick\s*=/.test(lines[i])) {
          // Check if near a div/span (not button/a)
          const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
          if (/createElement\s*\(\s*['"](?:div|span)['"]/.test(context) && !/role\s*=/.test(context)) {
            findings.push({
              rule: 'EDS-A11Y-001',
              severity: 'HIGH',
              category: this.category,
              description: 'Click handler on non-interactive element without ARIA role',
              file: file.path,
              line: i + 1,
              recommendation: 'Use <button> or add role="button" + tabindex="0" + keydown handler',
              score: 7,
            });
            break; // Once per file
          }
        }
      }
    }
  }

  private checkKeyboardNav(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const hasClick = /addEventListener\s*\(\s*['"]click['"]/.test(file.content);
      const hasKeydown = /addEventListener\s*\(\s*['"]keydown['"]/.test(file.content);
      const hasKeyup = /addEventListener\s*\(\s*['"]keyup['"]/.test(file.content);

      // Interactive blocks (carousel, tabs, accordion) should have keyboard support
      const blockName = file.path.split('/').slice(-2, -1)[0] || '';
      const interactiveBlocks = ['carousel', 'tabs', 'accordion', 'modal', 'dropdown', 'menu', 'slider'];

      if (hasClick && !hasKeydown && !hasKeyup) {
        if (interactiveBlocks.some((b) => blockName.includes(b))) {
          findings.push({
            rule: 'EDS-A11Y-002',
            severity: 'HIGH',
            category: this.category,
            description: `Interactive block "${blockName}" has click handlers but no keyboard navigation`,
            file: file.path,
            recommendation: 'Add keydown listener for Enter/Space (activation) and Arrow keys (navigation)',
            score: 7,
          });
        } else if (file.content.split('\n').length > 50) {
          findings.push({
            rule: 'EDS-A11Y-002',
            severity: 'MEDIUM',
            category: this.category,
            description: 'Click handlers present without keyboard event handlers',
            file: file.path,
            recommendation: 'Add keyboard support (Enter/Space) for interactive elements',
            score: 4,
          });
        }
      }
    }
  }

  private checkColorContrast(files: ProjectFiles, findings: Finding[]): void {
    // Check CSS for low-contrast patterns (basic heuristic)
    const allCss = [...files.css, ...files.blockCss];
    for (const file of allCss) {
      // color: #999 or lighter on white background
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/color:\s*#[a-f0-9]{3,6}/i.test(lines[i])) {
          const match = lines[i].match(/color:\s*#([a-f0-9]{3,6})/i);
          if (match) {
            const hex = match[1].length === 3
              ? match[1].split('').map(c => c + c).join('')
              : match[1];
            const luminance = this.getRelativeLuminance(hex);
            // Very light colors (likely low contrast against white)
            if (luminance > 0.5 && !/background/.test(lines[Math.max(0, i - 2)] + lines[i])) {
              findings.push({
                rule: 'EDS-A11Y-003',
                severity: 'MEDIUM',
                category: this.category,
                description: `Potentially low contrast text color: #${hex}`,
                file: file.path,
                line: i + 1,
                recommendation: 'Ensure 4.5:1 contrast ratio for normal text, 3:1 for large text (WCAG AA)',
                score: 4,
              });
              break; // Once per file
            }
          }
        }
      }
    }
  }

  private checkImageAlts(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // createElement('img') without alt being set nearby
        if (/createElement\s*\(\s*['"]img['"]\s*\)/.test(lines[i])) {
          const context = lines.slice(i, Math.min(lines.length, i + 5)).join('\n');
          if (!/\.alt\s*=/.test(context) && !/setAttribute\s*\(\s*['"]alt['"]/.test(context)) {
            findings.push({
              rule: 'EDS-A11Y-004',
              severity: 'HIGH',
              category: this.category,
              description: 'Image element created without alt attribute',
              file: file.path,
              line: i + 1,
              recommendation: 'Always set img.alt — use descriptive text or empty string for decorative images',
              score: 7,
            });
            break;
          }
        }
      }
    }
  }

  private checkFocusManagement(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      // Modals/dialogs should trap focus
      if (/role\s*=\s*['"]dialog['"]|modal|overlay/i.test(file.content)) {
        if (!/focus\s*\(\s*\)|focusTrap|inert/.test(file.content)) {
          findings.push({
            rule: 'EDS-A11Y-005',
            severity: 'HIGH',
            category: this.category,
            description: 'Dialog/modal without focus management',
            file: file.path,
            recommendation: 'Trap focus inside modal: set inert on background or implement focus-trap loop',
            score: 7,
          });
        }
      }

      // tabindex > 0
      if (/tabindex\s*=\s*['"][2-9]|tabindex\s*=\s*['"]1[0-9]/.test(file.content)) {
        findings.push({
          rule: 'EDS-A11Y-005',
          severity: 'MEDIUM',
          category: this.category,
          description: 'tabindex > 1 disrupts natural tab order',
          file: file.path,
          recommendation: 'Use tabindex="0" (natural order) or tabindex="-1" (programmatic focus only)',
          score: 4,
        });
      }
    }
  }

  private getRelativeLuminance(hex: string): number {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
}
