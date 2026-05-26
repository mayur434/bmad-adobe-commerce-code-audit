/**
 * JavaScript Analyzer — EDS-JS-001 through EDS-JS-005
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class JavaScriptAnalyzer implements Analyzer {
  name = 'JavaScript';
  category = 'JavaScript';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkModulePattern(files, findings);
    this.checkAsyncAwait(files, findings);
    this.checkDomApi(files, findings);
    this.checkEventDelegation(files, findings);
    this.checkImportExtensions(files, findings);
    return findings;
  }

  private checkModulePattern(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      // Check for IIFE wrapping (not needed in ESM)
      if (/\(\s*function\s*\(\s*\)\s*\{/.test(file.content) || /\(\s*\(\)\s*=>\s*\{/.test(file.content)) {
        findings.push({
          rule: 'EDS-JS-001',
          severity: 'LOW',
          category: this.category,
          description: 'IIFE wrapper unnecessary — EDS blocks are ES modules (each file is its own scope)',
          file: file.path,
          recommendation: 'Remove IIFE. Use export default function decorate(block) directly.',
          score: 1,
        });
      }

      // Check for var usage
      const varCount = (file.content.match(/\bvar\s+/g) || []).length;
      if (varCount > 0) {
        findings.push({
          rule: 'EDS-JS-001',
          severity: 'LOW',
          category: this.category,
          description: `${varCount} "var" declarations — use const/let in ES modules`,
          file: file.path,
          recommendation: 'Replace var with const (preferred) or let. var has function scope issues.',
          score: 1,
        });
      }

      // Check for require() (CJS in ESM context)
      if (/\brequire\s*\(/.test(file.content)) {
        findings.push({
          rule: 'EDS-JS-001',
          severity: 'HIGH',
          category: this.category,
          description: 'CommonJS require() used — EDS uses native ESM imports',
          file: file.path,
          recommendation: 'Use: import { fn } from "./module.js" (ESM syntax)',
          score: 7,
        });
      }
    }
  }

  private checkAsyncAwait(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // .then().then() chains (can be simplified with async/await)
        if (/\.then\s*\([^)]*\)\s*\.then\s*\(/.test(lines[i])) {
          findings.push({
            rule: 'EDS-JS-002',
            severity: 'LOW',
            category: this.category,
            description: 'Nested .then() chain — prefer async/await for readability',
            file: file.path,
            line: i + 1,
            recommendation: 'Use async/await pattern: const data = await fetch(url).then(r => r.json());',
            score: 1,
          });
          break; // Once per file
        }
      }

      // Sequential awaits that could be parallel
      const awaitLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*(?:const|let)\s+\w+\s*=\s*await\s+/.test(lines[i])) {
          awaitLines.push(i);
        }
      }
      // Check for consecutive independent awaits
      for (let j = 0; j < awaitLines.length - 1; j++) {
        if (awaitLines[j + 1] - awaitLines[j] === 1) {
          const line1 = lines[awaitLines[j]];
          const line2 = lines[awaitLines[j + 1]];
          const var1 = line1.match(/(?:const|let)\s+(\w+)/)?.[1];
          if (var1 && !line2.includes(var1)) {
            findings.push({
              rule: 'EDS-JS-002',
              severity: 'MEDIUM',
              category: this.category,
              description: 'Sequential awaits that appear independent — can run in parallel',
              file: file.path,
              line: awaitLines[j] + 1,
              code: `${line1.trim()}\n${line2.trim()}`,
              recommendation: 'Use Promise.all([...]) for independent async operations',
              score: 4,
            });
            break;
          }
        }
      }
    }
  }

  private checkDomApi(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // jQuery-like patterns
        if (/\$\s*\(\s*['"]/.test(lines[i]) && !/\$\{/.test(lines[i])) {
          findings.push({
            rule: 'EDS-JS-003',
            severity: 'HIGH',
            category: this.category,
            description: 'jQuery-style $() selector — use native DOM APIs',
            file: file.path,
            line: i + 1,
            recommendation: 'Use block.querySelector() / block.querySelectorAll() instead',
            score: 7,
          });
          break;
        }
      }

      // Check for XMLHttpRequest (use fetch)
      if (/new\s+XMLHttpRequest/.test(file.content)) {
        findings.push({
          rule: 'EDS-JS-003',
          severity: 'MEDIUM',
          category: this.category,
          description: 'XMLHttpRequest used — native fetch() is preferred in EDS',
          file: file.path,
          recommendation: 'Replace with: const resp = await fetch(url); const data = await resp.json();',
          score: 4,
        });
      }
    }
  }

  private checkEventDelegation(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const addEventMatches = file.content.match(/addEventListener\s*\(\s*['"]click['"]/g) || [];
      if (addEventMatches.length > 4) {
        if (/forEach\s*\([^)]*\)\s*\{[\s\S]{0,200}addEventListener/.test(file.content) ||
            /for\s*\([\s\S]{0,100}\)\s*\{[\s\S]{0,300}addEventListener/.test(file.content)) {
          findings.push({
            rule: 'EDS-JS-004',
            severity: 'MEDIUM',
            category: this.category,
            description: `${addEventMatches.length} click listeners added in loop — use event delegation`,
            file: file.path,
            recommendation: `Replace individual listeners with single delegated listener:\n\n// Before: items.forEach(item => item.addEventListener('click', handler));\n\n// After:\nblock.addEventListener('click', (e) => {\n  const item = e.target.closest('.card-item');\n  if (item) handleItemClick(item);\n});`,
            score: 4,
          });
        }
      }
    }
  }

  /** EDS-JS-005: Missing .js extension in imports */
  private checkImportExtensions(files: ProjectFiles, findings: Finding[]): void {
    const allJs = [...files.blockJs, ...files.scriptJs];
    for (const file of allJs) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match relative imports without .js extension
        const importMatch = line.match(/(?:import|export)\s+.*from\s+['"](\.\.?\/[^'"]+)['"]/);
        if (importMatch) {
          const importPath = importMatch[1];
          // Skip if already has .js, .json, .css extension
          if (/\.(js|json|css|mjs)$/.test(importPath)) continue;
          // Skip npm package imports (don't start with ./ or ../)
          if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;

          findings.push({
            rule: 'EDS-JS-005',
            severity: 'MEDIUM',
            category: this.category,
            description: `Import missing .js extension — will 404 on CDN (no bundler in EDS)`,
            file: file.path,
            line: i + 1,
            code: line.trim().substring(0, 120),
            recommendation: `Add .js extension to the import path:\n\n// Before: import { ... } from '${importPath}'\n// After:  import { ... } from '${importPath}.js'\n\nEDS has no bundler — the browser fetches the exact path you specify.`,
            score: 4,
          });
        }
      }
    }
  }
}
