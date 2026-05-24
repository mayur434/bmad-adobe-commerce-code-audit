/**
 * Content Practices Analyzer — EDS-CONTENT-001 through EDS-CONTENT-004
 */
import { Finding, ProjectFiles, EDSConfig, Analyzer } from '../types';

export class ContentPracticesAnalyzer implements Analyzer {
  name = 'Content Practices';
  category = 'Content Practices';

  analyze(files: ProjectFiles, config: EDSConfig): Finding[] {
    const findings: Finding[] = [];
    this.checkHardcodedContent(files, findings);
    this.checkBlockTableUsage(files, findings);
    this.checkMetadataUsage(files, findings);
    this.checkContentFragments(files, findings);
    return findings;
  }

  private checkHardcodedContent(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      let hardcodedStringCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Long hardcoded user-visible strings (not selectors, not URLs)
        if (/['"][A-Z][a-zA-Z\s]{20,}['"]/.test(line) &&
            !/querySelector|className|setAttribute|data-|aria-|https?:\/\//.test(line)) {
          hardcodedStringCount++;
        }
      }

      if (hardcodedStringCount > 2) {
        findings.push({
          rule: 'EDS-CONTENT-001',
          severity: 'MEDIUM',
          category: this.category,
          description: `${hardcodedStringCount} hardcoded content strings — should come from document authoring`,
          file: file.path,
          recommendation: 'Content text should be authored in Word/GDocs and rendered from block table rows',
          score: 4,
        });
      }
    }
  }

  private checkBlockTableUsage(files: ProjectFiles, findings: Finding[]): void {
    for (const file of files.blockJs) {
      // Check if block reads content from the DOM correctly
      const usesChildren = /block\.children|block\.querySelectorAll\s*\(\s*['"](?:\s*>\s*div|:scope\s*>\s*div)/.test(file.content);
      const usesRows = /\.querySelectorAll\s*\(\s*['"]tr['"]/.test(file.content);

      // If block doesn't read its own content at all (and it's not a utility)
      if (!usesChildren && !usesRows && file.content.length > 100) {
        const blockName = file.path.split('/').slice(-2, -1)[0] || '';
        // Skip known utility blocks
        if (!['header', 'footer', 'nav', 'breadcrumb'].includes(blockName)) {
          // Check if it at least references block parameter
          if (!/\bblock\b/.test(file.content)) {
            findings.push({
              rule: 'EDS-CONTENT-002',
              severity: 'MEDIUM',
              category: this.category,
              description: `Block "${blockName}" doesn't read content from its DOM table`,
              file: file.path,
              recommendation: 'Read authored content via block.children or block.querySelectorAll(":scope > div")',
              score: 4,
            });
          }
        }
      }
    }
  }

  private checkMetadataUsage(files: ProjectFiles, findings: Finding[]): void {
    // Check for getMetadata usage patterns
    const scriptsJs = files.scriptJs.find((f) => f.path === 'scripts/scripts.js');
    if (scriptsJs) {
      if (!/getMetadata|document\.head\.querySelector\s*\(\s*['"]meta/.test(scriptsJs.content)) {
        findings.push({
          rule: 'EDS-CONTENT-003',
          severity: 'LOW',
          category: this.category,
          description: 'No metadata reading utility found — blocks can\'t access page-level metadata',
          file: 'scripts/scripts.js',
          recommendation: 'Import getMetadata from aem.js for reading page-level metadata',
          score: 1,
        });
      }
    }
  }

  private checkContentFragments(files: ProjectFiles, findings: Finding[]): void {
    // Check for JSON/API-driven content that should use EDS patterns
    for (const file of files.blockJs) {
      const lines = file.content.split('\n');
      let jsonEndpoints = 0;

      for (let i = 0; i < lines.length; i++) {
        if (/fetch\s*\(\s*['"].*\.json['"]/.test(lines[i]) && !/query-index\.json|helix-/.test(lines[i])) {
          jsonEndpoints++;
        }
      }

      if (jsonEndpoints > 2) {
        findings.push({
          rule: 'EDS-CONTENT-004',
          severity: 'LOW',
          category: this.category,
          description: `Block fetches ${jsonEndpoints} JSON endpoints — consider spreadsheet-based content via query-index`,
          file: file.path,
          recommendation: 'Use EDS query-index.json or spreadsheet sheets for structured content lists',
          score: 1,
        });
      }
    }
  }
}
