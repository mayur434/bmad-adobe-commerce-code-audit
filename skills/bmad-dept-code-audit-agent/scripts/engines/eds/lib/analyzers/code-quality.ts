/**
 * Code Quality Analyzer — EDS-QUAL-001, 002, 004, 005
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class CodeQualityAnalyzer implements Analyzer {
  name = 'Code Quality';
  category = 'Code Quality';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkConsoleStatements(files, config, findings);
    this.checkErrorHandling(files, findings);
    this.checkCodeDuplication(files, findings);
    this.checkNaming(files, findings);
    return findings;
  }

  private checkConsoleStatements(files: ProjectFiles, config: EDSConfig, findings: Finding[]): void {
    if (!config.defaults.production) return; // Only flag in production mode

    const allJs = [...files.blockJs, ...files.scriptJs];
    for (const file of allJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/console\.(log|debug|info|warn|trace)\s*\(/.test(lines[i])) {
          // Skip if inside a catch block or error handler
          const prevContext = lines.slice(Math.max(0, i - 3), i).join('\n');
          if (/catch\s*\(|\.catch\(/.test(prevContext)) continue;

          findings.push({
            rule: 'EDS-QUAL-001',
            severity: 'LOW',
            category: this.category,
            description: 'console statement left in production code',
            file: file.path,
            line: i + 1,
            code: lines[i].trim().substring(0, 120),
            recommendation: 'Remove console statements or use a conditional debug flag',
            score: 1,
          });
        }
      }
    }
  }

  private checkErrorHandling(files: ProjectFiles, findings: Finding[]): void {
    const allJs = [...files.blockJs, ...files.scriptJs];
    for (const file of allJs) {
      // Fetch without catch
      if (/\bfetch\s*\(/.test(file.content)) {
        if (!/\.catch\(|try\s*\{/.test(file.content)) {
          findings.push({
            rule: 'EDS-QUAL-002',
            severity: 'HIGH',
            category: this.category,
            description: 'fetch() call without error handling (no .catch or try/catch)',
            file: file.path,
            recommendation: 'Wrap fetch in try/catch or chain .catch() to handle network failures gracefully',
            score: 7,
          });
        }
      }

      // Empty catch blocks
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(lines[i]) || 
            (i + 1 < lines.length && /catch\s*\([^)]*\)\s*\{/.test(lines[i]) && /^\s*\}/.test(lines[i + 1]))) {
          findings.push({
            rule: 'EDS-QUAL-002',
            severity: 'MEDIUM',
            category: this.category,
            description: 'Empty catch block — errors silently swallowed',
            file: file.path,
            line: i + 1,
            recommendation: 'At minimum log the error: catch(e) { console.error(e); }',
            score: 4,
          });
        }
      }
    }
  }

  private checkCodeDuplication(files: ProjectFiles, findings: Finding[]): void {
    // Detect common duplicated patterns across blocks
    const fetchPatterns: Map<string, string[]> = new Map();
    
    for (const file of files.blockJs) {
      // Check for duplicated utility functions that should be shared
      if (/function\s+(formatDate|formatCurrency|debounce|throttle|fetchJSON)/.test(file.content)) {
        const match = file.content.match(/function\s+(formatDate|formatCurrency|debounce|throttle|fetchJSON)/);
        if (match) {
          const fnName = match[1];
          if (!fetchPatterns.has(fnName)) fetchPatterns.set(fnName, []);
          fetchPatterns.get(fnName)!.push(file.path);
        }
      }
    }

    for (const [fnName, filePaths] of fetchPatterns) {
      if (filePaths.length > 1) {
        findings.push({
          rule: 'EDS-QUAL-004',
          severity: 'MEDIUM',
          category: this.category,
          description: `Utility function "${fnName}" duplicated in ${filePaths.length} blocks`,
          file: filePaths[0],
          recommendation: `Extract to scripts/utils.js and import: import { ${fnName} } from '../../scripts/utils.js'`,
          score: 4,
        });
      }
    }
  }

  private checkNaming(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const blockDir = file.path.split('/').slice(-2, -1)[0] || '';
      
      // Block folder with camelCase or PascalCase
      if (/[A-Z]/.test(blockDir)) {
        findings.push({
          rule: 'EDS-QUAL-005',
          severity: 'LOW',
          category: this.category,
          description: `Block folder "${blockDir}" uses camelCase/PascalCase — EDS convention is kebab-case`,
          file: file.path,
          recommendation: `Rename to: ${blockDir.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`,
          score: 1,
        });
      }
    }
  }
}
