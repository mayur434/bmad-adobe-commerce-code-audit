/**
 * Git Hooks Analyzer — EDS-HOOKS-001 through EDS-HOOKS-003
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
        severity: 'MEDIUM',
        category: this.category,
        description: 'No Git hooks framework (husky) installed',
        recommendation: 'Install: npx husky-init && npm install; Add lint-staged for pre-commit linting',
        score: 4,
      });
      return;
    }

    if (hasHusky && huskyFiles.length === 0) {
      findings.push({
        rule: 'EDS-HOOKS-001',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Husky in package.json but no .husky/ directory — hooks not set up',
        recommendation: 'Run: npx husky install to create .husky/ directory with hook scripts',
        score: 4,
      });
    }
  }

  private checkPreCommitHook(files: ProjectFiles, findings: Finding[]): void {
    if (!files.huskyPreCommit) {
      // Only warn if husky is present
      const hasHusky = files.all.some((f) => f.path.startsWith('.husky/'));
      if (hasHusky) {
        findings.push({
          rule: 'EDS-HOOKS-002',
          severity: 'MEDIUM',
          category: this.category,
          description: 'Husky set up but no pre-commit hook file',
          recommendation: 'Add .husky/pre-commit: npx lint-staged',
          score: 4,
        });
      }
      return;
    }

    const content = files.huskyPreCommit.content;

    // Check what runs in pre-commit
    if (!/lint-staged|eslint|stylelint/.test(content)) {
      findings.push({
        rule: 'EDS-HOOKS-002',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Pre-commit hook doesn\'t run linting',
        file: '.husky/pre-commit',
        recommendation: 'Add "npx lint-staged" to pre-commit hook for staged file linting',
        score: 4,
      });
    }
  }

  private checkCommitMsg(files: ProjectFiles, findings: Finding[]): void {
    const commitMsgHook = files.all.find((f) => f.path === '.husky/commit-msg');
    if (!commitMsgHook) {
      // Informational only
      findings.push({
        rule: 'EDS-HOOKS-003',
        severity: 'LOW',
        category: this.category,
        description: 'No commit-msg hook — commit message format not enforced',
        recommendation: 'Add commitlint with conventional-commits preset for consistent messages',
        score: 1,
      });
    }
  }
}
