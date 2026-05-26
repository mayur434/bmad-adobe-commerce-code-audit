/**
 * Dev Workflow Analyzer — EDS-DEV-001 through EDS-DEV-006
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class DevWorkflowAnalyzer implements Analyzer {
  name = 'Dev Workflow';
  category = 'Dev Workflow';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkPackageJson(files, findings);
    this.checkGitignore(files, findings);
    this.checkBranchProtection(files, findings);
    this.checkCICDSetup(files, findings);
    this.checkDocumentation(files, findings);
    this.checkHlxIgnore(files, findings);
    this.checkBuildTools(files, findings);
    return findings;
  }

  private checkPackageJson(files: ProjectFiles, findings: Finding[]): void {
    if (!files.packageJson) {
      findings.push({
        rule: 'EDS-DEV-001',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Missing package.json — no dependency management or scripts',
        recommendation: 'Run npm init and add lint/test/build scripts',
        score: 4,
      });
      return;
    }

    try {
      const pkg = JSON.parse(files.packageJson.content);

      // Check for useful scripts
      const scripts = pkg.scripts || {};
      const recommended = ['lint', 'test'];
      const missing = recommended.filter((s) => !scripts[s]);

      if (missing.length > 0) {
        findings.push({
          rule: 'EDS-DEV-001',
          severity: 'MEDIUM',
          category: this.category,
          description: `Missing npm scripts: ${missing.join(', ')}`,
          file: 'package.json',
          recommendation: `Add scripts: { ${missing.map((s) => `"${s}": "..."`).join(', ')} }`,
          score: 4,
        });
      }

      // Check for AEM CLI
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (!deps['@adobe/aem-cli']) {
        findings.push({
          rule: 'EDS-DEV-001',
          severity: 'LOW',
          category: this.category,
          description: '@adobe/aem-cli not in devDependencies',
          file: 'package.json',
          recommendation: 'Add: npm install -D @adobe/aem-cli for local development server',
          score: 1,
        });
      }
    } catch {
      findings.push({
        rule: 'EDS-DEV-001',
        severity: 'HIGH',
        category: this.category,
        description: 'package.json contains invalid JSON',
        file: 'package.json',
        recommendation: 'Fix JSON syntax errors in package.json',
        score: 7,
      });
    }
  }

  private checkGitignore(files: ProjectFiles, findings: Finding[]): void {
    const gitignore = files.all.find((f) => f.path === '.gitignore');
    if (!gitignore) {
      findings.push({
        rule: 'EDS-DEV-002',
        severity: 'MEDIUM',
        category: this.category,
        description: 'Missing .gitignore file',
        recommendation: 'Add .gitignore with node_modules/, .env, .DS_Store entries',
        score: 4,
      });
      return;
    }

    const content = gitignore.content;
    const essentials = ['node_modules', '.env'];
    const missing = essentials.filter((e) => !content.includes(e));

    if (missing.length > 0) {
      findings.push({
        rule: 'EDS-DEV-002',
        severity: 'MEDIUM',
        category: this.category,
        description: `.gitignore missing: ${missing.join(', ')}`,
        file: '.gitignore',
        recommendation: `Add missing entries: ${missing.join(', ')}`,
        score: 4,
      });
    }
  }

  private checkBranchProtection(files: ProjectFiles, findings: Finding[]): void {
    // Check for CODEOWNERS
    const codeowners = files.all.find((f) =>
      f.path === 'CODEOWNERS' || f.path === '.github/CODEOWNERS'
    );
    if (!codeowners) {
      findings.push({
        rule: 'EDS-DEV-003',
        severity: 'LOW',
        category: this.category,
        description: 'No CODEOWNERS file — no automated review assignment',
        recommendation: 'Add .github/CODEOWNERS to auto-assign reviewers',
        score: 1,
      });
    }

    // Check for PR template
    if (!files.prTemplate) {
      findings.push({
        rule: 'EDS-DEV-003',
        severity: 'LOW',
        category: this.category,
        description: 'No PR template — inconsistent pull request descriptions',
        recommendation: 'Add .github/PULL_REQUEST_TEMPLATE.md with checklist',
        score: 1,
      });
    }
  }

  private checkCICDSetup(files: ProjectFiles, findings: Finding[]): void {
    const workflows = files.all.filter((f) => f.path.startsWith('.github/workflows/'));
    if (workflows.length === 0) {
      findings.push({
        rule: 'EDS-DEV-004',
        severity: 'MEDIUM',
        category: this.category,
        description: 'No GitHub Actions workflows — no CI/CD automation',
        recommendation: 'Add .github/workflows/main.yml for lint/test on PR',
        score: 4,
      });
      return;
    }

    // Check if any workflow runs on PR
    const hasPRTrigger = workflows.some((f) => /on:\s*\n\s*pull_request|pull_request:/.test(f.content));
    if (!hasPRTrigger) {
      findings.push({
        rule: 'EDS-DEV-004',
        severity: 'LOW',
        category: this.category,
        description: 'No workflow triggers on pull_request — no PR validation',
        recommendation: 'Add pull_request trigger to lint/test workflow',
        score: 1,
      });
    }
  }

  private checkDocumentation(files: ProjectFiles, findings: Finding[]): void {
    const readme = files.all.find((f) => f.path.toLowerCase() === 'readme.md');
    if (!readme) {
      findings.push({
        rule: 'EDS-DEV-005',
        severity: 'LOW',
        category: this.category,
        description: 'Missing README.md',
        recommendation: 'Add README with setup instructions, block inventory, and deployment info',
        score: 1,
      });
    } else if (readme.content.length < 200) {
      findings.push({
        rule: 'EDS-DEV-005',
        severity: 'LOW',
        category: this.category,
        description: 'README.md is minimal — missing setup/contribution instructions',
        file: 'readme.md',
        recommendation: `Document local setup and block inventory:\n\n# Project Name\n## Local Development\n1. Install: \`npm install\`\n2. Start: \`npm start\` (runs \`aem up\`)\n3. Open: http://localhost:3000\n\n## Blocks\n- hero: Full-width hero with image and CTA\n- cards: Grid of content cards\n...`,
        score: 1,
      });
    }
  }

  /** EDS-DEV-006: Missing .hlxignore */
  private checkHlxIgnore(files: ProjectFiles, findings: Finding[]): void {
    const hlxIgnore = files.all.find((f) => f.path === '.hlxignore');
    if (!hlxIgnore) {
      findings.push({
        rule: 'EDS-DEV-006',
        severity: 'LOW',
        category: this.category,
        description: 'Missing .hlxignore — dev files (package.json, README, etc.) served by CDN publicly',
        recommendation: `Create .hlxignore to exclude non-production files from CDN:\n\n# .hlxignore\n.github\n.vscode\n.husky\nnode_modules\ntest\ntools\ndocs\n*.md\npackage.json\npackage-lock.json\n.eslintrc.js\n.stylelintrc.json\n.gitignore`,
        score: 1,
      });
    }
  }

  /** EDS-QUAL-006: Build tools in EDS project (zero-build architecture violation) */
  private checkBuildTools(files: ProjectFiles, findings: Finding[]): void {
    if (!files.packageJson) return;

    try {
      const pkg = JSON.parse(files.packageJson.content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      const buildTools = [
        { name: 'webpack', desc: 'bundler' },
        { name: 'webpack-cli', desc: 'bundler CLI' },
        { name: 'rollup', desc: 'bundler' },
        { name: 'vite', desc: 'bundler/dev server' },
        { name: 'parcel', desc: 'bundler' },
        { name: 'esbuild', desc: 'bundler' },
        { name: '@babel/core', desc: 'transpiler' },
        { name: 'babel-loader', desc: 'transpiler' },
        { name: 'typescript', desc: 'compiler' },
      ];

      const found = buildTools.filter((t) => allDeps[t.name]);
      if (found.length > 0) {
        const toolList = found.map((t) => `${t.name} (${t.desc})`).join(', ');
        findings.push({
          rule: 'EDS-QUAL-006',
          severity: 'HIGH',
          category: this.category,
          description: `Build tools found in EDS project: ${toolList} — EDS is zero-build architecture`,
          file: 'package.json',
          recommendation: `Remove build tools — EDS ships source directly to CDN (no bundling/transpiling needed):\n\n// Remove from devDependencies:\n${found.map(t => `// "${t.name}"`).join('\n')}\n\n// CDN handles minification automatically.\n// package.json should only have: @adobe/aem-cli, eslint, stylelint`,
          score: 7,
        });
      }

      // Check for build scripts
      const scripts = pkg.scripts || {};
      if (scripts.build && !/lint|test/.test(scripts.build)) {
        findings.push({
          rule: 'EDS-QUAL-006',
          severity: 'MEDIUM',
          category: this.category,
          description: `"build" script detected: "${scripts.build}" — EDS doesn't need a build step`,
          file: 'package.json',
          recommendation: `Remove "build" script. EDS CDN serves source directly:\n\n// Remove: "build": "${scripts.build}"\n// Keep: "start": "aem up", "lint": "eslint . && stylelint '**/*.css'"`,
          score: 4,
        });
      }
    } catch {
      // Already flagged by checkPackageJson
    }
  }
}
