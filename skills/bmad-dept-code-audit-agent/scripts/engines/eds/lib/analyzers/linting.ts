/**
 * Linting Analyzer — EDS-LINT-001 through EDS-LINT-004
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class LintingAnalyzer implements Analyzer {
  name = 'Linting';
  category = 'Linting';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkEslintSetup(files, findings);
    this.checkStylelintSetup(files, findings);
    this.checkEditorConfig(files, findings);
    this.checkLintScripts(files, findings);
    return findings;
  }

  private checkEslintSetup(files: ProjectFiles, findings: Finding[]): void {
    if (!files.eslintConfig) {
      findings.push({
        rule: 'EDS-LINT-001',
        severity: 'HIGH',
        category: this.category,
        description: 'No ESLint configuration found',
        recommendation: 'Add .eslintrc.json with airbnb-base + EDS-specific rules (no-param-reassign: off for block param)',
        score: 7,
      });
      return;
    }

    const content = files.eslintConfig.content;

    // Check for essential EDS rules
    if (!/sourceType.*module|ecmaVersion.*2022|ecmaVersion.*latest/i.test(content)) {
      findings.push({
        rule: 'EDS-LINT-001',
        severity: 'MEDIUM',
        category: this.category,
        description: 'ESLint not configured for ESM (sourceType: module)',
        file: files.eslintConfig.path,
        recommendation: 'Set parserOptions: { sourceType: "module", ecmaVersion: "latest" }',
        score: 4,
      });
    }

    // Check for EDS-friendly env
    if (!/browser.*true/i.test(content)) {
      findings.push({
        rule: 'EDS-LINT-001',
        severity: 'LOW',
        category: this.category,
        description: 'ESLint env.browser not enabled — will flag window/document as undefined',
        file: files.eslintConfig.path,
        recommendation: 'Add env: { browser: true } to ESLint config',
        score: 1,
      });
    }
  }

  private checkStylelintSetup(files: ProjectFiles, findings: Finding[]): void {
    if (!files.stylelintConfig) {
      findings.push({
        rule: 'EDS-LINT-002',
        severity: 'MEDIUM',
        category: this.category,
        description: 'No Stylelint configuration found',
        recommendation: 'Add .stylelintrc.json with stylelint-config-standard for consistent CSS',
        score: 4,
      });
      return;
    }

    const content = files.stylelintConfig.content;
    if (!/stylelint-config-standard|stylelint-config-recommended/.test(content)) {
      findings.push({
        rule: 'EDS-LINT-002',
        severity: 'LOW',
        category: this.category,
        description: 'Stylelint config doesn\'t extend a standard preset',
        file: files.stylelintConfig.path,
        recommendation: 'Extend stylelint-config-standard for baseline CSS rules',
        score: 1,
      });
    }
  }

  private checkEditorConfig(files: ProjectFiles, findings: Finding[]): void {
    const hasEditorConfig = files.all.some((f) => f.path === '.editorconfig');
    if (!hasEditorConfig) {
      findings.push({
        rule: 'EDS-LINT-003',
        severity: 'LOW',
        category: this.category,
        description: 'Missing .editorconfig — inconsistent formatting across editors',
        recommendation: 'Add .editorconfig with indent_style=space, indent_size=2, end_of_line=lf',
        score: 1,
      });
    }
  }

  private checkLintScripts(files: ProjectFiles, findings: Finding[]): void {
    if (!files.packageJson) return;

    try {
      const pkg = JSON.parse(files.packageJson.content);
      const scripts = pkg.scripts || {};

      if (!scripts.lint && !scripts['lint:js'] && !scripts['lint:css']) {
        findings.push({
          rule: 'EDS-LINT-004',
          severity: 'MEDIUM',
          category: this.category,
          description: 'No "lint" script in package.json',
          file: 'package.json',
          recommendation: 'Add "lint": "eslint blocks scripts styles" to scripts',
          score: 4,
        });
      }

      // Check for lint-staged
      if (!pkg['lint-staged'] && !pkg.devDependencies?.['lint-staged']) {
        findings.push({
          rule: 'EDS-LINT-004',
          severity: 'LOW',
          category: this.category,
          description: 'lint-staged not configured — lint won\'t run automatically on commit',
          file: 'package.json',
          recommendation: 'Add lint-staged + husky for pre-commit linting of staged files',
          score: 1,
        });
      }
    } catch {
      // Invalid JSON — skip
    }
  }
}
