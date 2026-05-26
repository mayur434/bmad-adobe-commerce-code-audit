/**
 * Git Hooks Analyzer — EDS-HOOKS-001 through EDS-HOOKS-003
 * NOTE: Severities are LOW/advisory — official aem-boilerplate does NOT include husky/lint-staged
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class GitHooksAnalyzer implements Analyzer {
  name = 'Git Hooks';
  category = 'Git Hooks';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkHuskySetup(files, findings);
    this.checkPreCommitHook(files, findings);
    this.checkCommitMsg(files, findings);
    return findings;
  }

  private checkHuskySetup(files: ProjectFiles, findings: Finding[]): void {
    const huskyFiles = files.all.filter((f) => f.path.startsWith('.husky/'));
    const hasHusky = files.packageJson
      ? /husky/.test(files.packageJson.content)
      : false;

    if (!hasHusky && huskyFiles.length === 0) {
      findings.push({
        rule: 'EDS-HOOKS-001',
        severity: 'LOW',
        category: this.category,
        description: 'No Git hooks framework — code quality relies on CI/manual review only',
        recommendation: `Advisory: Consider adding pre-commit hooks for faster feedback (optional — official boilerplate doesn't include this):\n\nnpm install -D husky lint-staged\nnpx husky init\n\n// package.json:\n"lint-staged": { "*.js": "eslint --fix", "*.css": "stylelint --fix" }`,
        score: 1,
      });
      return;
    }

    if (hasHusky && huskyFiles.length === 0) {
      findings.push({
        rule: 'EDS-HOOKS-001',
        severity: 'LOW',
        category: this.category,
        description: 'Husky in package.json but .husky/ directory missing — hooks not active',
        recommendation: `Run: npx husky install\nThis creates .husky/ directory with hook scripts.`,
        score: 1,
      });
    }
  }

  private checkPreCommitHook(files: ProjectFiles, findings: Finding[]): void {
    if (!files.huskyPreCommit) {
      const hasHusky = files.all.some((f) => f.path.startsWith('.husky/'));
      if (hasHusky) {
        findings.push({
          rule: 'EDS-HOOKS-002',
          severity: 'LOW',
          category: this.category,
          description: 'Husky installed but no pre-commit hook — hooks doing nothing',
          file: '.husky/',
          recommendation: `Add pre-commit hook for staged file linting:\n\n# .husky/pre-commit\nnpx lint-staged`,
          score: 1,
        });
      }
      return;
    }

    const content = files.huskyPreCommit.content;

    if (!/lint-staged|eslint|stylelint/.test(content)) {
      findings.push({
        rule: 'EDS-HOOKS-002',
        severity: 'LOW',
        category: this.category,
        description: 'Pre-commit hook doesn\'t run linting — not catching issues before commit',
        file: '.husky/pre-commit',
        recommendation: `Add lint-staged to pre-commit:\n\n# .husky/pre-commit\nnpx lint-staged\n\n// package.json:\n"lint-staged": {\n  "*.js": ["eslint --fix"],\n  "*.css": ["stylelint --fix"]\n}`,
        score: 1,
      });
    }
  }

  private checkCommitMsg(files: ProjectFiles, findings: Finding[]): void {
    const commitMsgHook = files.all.find((f) => f.path === '.husky/commit-msg');
    if (!commitMsgHook) {
      findings.push({
        rule: 'EDS-HOOKS-003',
        severity: 'LOW',
        category: this.category,
        description: 'No commit message validation — inconsistent git history',
        recommendation: `Optional: Add commitlint for consistent messages:\n\nnpm install -D @commitlint/cli @commitlint/config-conventional\n\n// commitlint.config.js:\nmodule.exports = { extends: ['@commitlint/config-conventional'] };\n\n// .husky/commit-msg:\nnpx --no -- commitlint --edit $1`,
        score: 1,
      });
    }
  }
}
