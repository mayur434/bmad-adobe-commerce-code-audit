/**
 * Quick Scanner — Executes parsed rule-pack detections against project files.
 * No LLM required. Applies regex patterns from rules.md to matching files.
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { ParsedRule, RulePack } from './rule-parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickFinding {
  ruleId: string;
  category: string;
  severity: string;
  module: string;
  filePath: string;
  lineNum: number;
  lineText: string;
  description: string;
  matchedPattern: string;
  recommendation: string;
  impact: string;
  effort: string;
  codeContext: string;
  falsePositiveRisk: string;
  references: string[];
}

export interface QuickScanStats {
  totalFiles: number;
  filesScanned: number;
  totalFindings: number;
  rulesEvaluated: number;
  rulesTriggered: number;
  categories: number;
  severityCounts: Record<string, number>;
  scanDuration: number;
  tokensProcessed: number;
  platform: string;
  fileBreakdown: Record<string, number>;
}

export interface QuickScanResult {
  findings: Map<string, QuickFinding[]>; // category -> findings
  stats: QuickScanStats;
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

export class QuickScanner {
  private root: string;
  private platform: 'aemams' | 'aemcs' | 'both';
  private rulePacks: RulePack[];
  private totalCharsRead = 0;
  private fileCache = new Map<string, string>();
  private scannedFiles = new Set<string>();

  constructor(root: string, platform: 'aemams' | 'aemcs' | 'both', rulePacks: RulePack[]) {
    this.root = path.resolve(root);
    this.platform = platform;
    this.rulePacks = rulePacks;
  }

  async scan(): Promise<QuickScanResult> {
    const startTime = Date.now();
    const findings = new Map<string, QuickFinding[]>();
    let rulesTriggered = 0;
    let rulesEvaluated = 0;

    // Collect all project files once
    const allFiles = this.collectAllFiles();
    console.log(`[Quick Scanner] Found ${allFiles.length} files to analyze`);

    // Process each rule pack
    for (const pack of this.rulePacks) {
      if (this.platform !== 'both' && pack.platform !== this.platform) continue;

      for (const rule of pack.rules) {
        rulesEvaluated++;
        const ruleFindings = this.evaluateRule(rule, allFiles);
        if (ruleFindings.length > 0) {
          rulesTriggered++;
          const existing = findings.get(rule.category) || [];
          existing.push(...ruleFindings);
          findings.set(rule.category, existing);
        }
      }
    }

    const duration = Date.now() - startTime;

    // Calculate stats
    const severityCounts: Record<string, number> = {};
    let totalFindings = 0;
    for (const [_, categoryFindings] of findings) {
      totalFindings += categoryFindings.length;
      for (const f of categoryFindings) {
        severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
      }
    }

    // File breakdown by type
    const fileBreakdown: Record<string, number> = {};
    for (const f of allFiles) {
      const ext = path.extname(f).toLowerCase();
      fileBreakdown[ext] = (fileBreakdown[ext] || 0) + 1;
    }

    return {
      findings,
      stats: {
        totalFiles: allFiles.length,
        filesScanned: this.scannedFiles.size,
        totalFindings,
        rulesEvaluated,
        rulesTriggered,
        categories: findings.size,
        severityCounts,
        scanDuration: duration,
        tokensProcessed: Math.round(this.totalCharsRead / 4),
        platform: this.platform,
        fileBreakdown,
      },
    };
  }

  // ─── File Collection ──────────────────────────────────────────────────────

  private collectAllFiles(): string[] {
    const patterns = [
      '**/*.java',
      '**/*.xml',
      '**/*.html',
      '**/*.htm',
      '**/*.js',
      '**/*.ts',
      '**/*.tsx',
      '**/*.jsx',
      '**/*.css',
      '**/*.scss',
      '**/*.less',
      '**/*.json',
      '**/*.cfg',
      '**/*.config',
      '**/*.properties',
      '**/*.yaml',
      '**/*.yml',
      '**/pom.xml',
      '**/.content.xml',
      '**/*.any',
      '**/*.vhost',
      '**/*.conf',
    ];

    const ignore = [
      '**/target/**',
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
    ];

    return fg.sync(patterns.map(p => path.join(this.root, p).replace(/\\/g, '/')), { ignore, unique: true });
  }

  // ─── Rule Evaluation ──────────────────────────────────────────────────────

  private evaluateRule(rule: ParsedRule, allFiles: string[]): QuickFinding[] {
    const findings: QuickFinding[] = [];

    // Match files by rule's glob patterns
    const matchedFiles = this.matchFiles(rule.fileGlobs, allFiles);
    if (matchedFiles.length === 0) return findings;

    // Compile bad patterns as regex
    const regexPatterns = this.compilePatterns(rule.badPatterns);
    if (regexPatterns.length === 0) {
      // If no regex patterns, use description-based heuristic matching
      return this.evaluateHeuristic(rule, matchedFiles);
    }

    // Scan each matched file
    for (const file of matchedFiles) {
      const content = this.readFile(file);
      if (!content) continue;
      this.scannedFiles.add(file);

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const { regex, original } of regexPatterns) {
          try {
            if (regex.test(lines[i])) {
              // Check false positive indicators
              if (this.isFalsePositive(rule, file, lines, i)) continue;

              findings.push({
                ruleId: rule.id,
                category: rule.category,
                severity: rule.severity,
                module: this.detectModule(file),
                filePath: file,
                lineNum: i + 1,
                lineText: lines[i].trim(),
                description: rule.description,
                matchedPattern: original,
                recommendation: this.generateRecommendation(rule),
                impact: this.assessImpact(rule),
                effort: this.estimateEffort(rule),
                codeContext: this.getContext(lines, i),
                falsePositiveRisk: rule.falsePositives.length > 0 ? 'Medium' : 'Low',
                references: rule.references,
              });
              break; // One finding per line per rule
            }
            regex.lastIndex = 0;
          } catch {
            // Invalid regex — skip
          }
        }
      }
    }

    return findings;
  }

  private evaluateHeuristic(rule: ParsedRule, files: string[]): QuickFinding[] {
    const findings: QuickFinding[] = [];
    // Use bad pattern bullet text as string searches
    const searchTerms = rule.badPatterns.filter(p => !p.includes('\\s') && !p.includes('(?'));

    for (const file of files) {
      const content = this.readFile(file);
      if (!content) continue;
      this.scannedFiles.add(file);

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const term of searchTerms) {
          if (lines[i].includes(term)) {
            findings.push({
              ruleId: rule.id,
              category: rule.category,
              severity: rule.severity,
              module: this.detectModule(file),
              filePath: file,
              lineNum: i + 1,
              lineText: lines[i].trim(),
              description: rule.description,
              matchedPattern: term,
              recommendation: this.generateRecommendation(rule),
              impact: this.assessImpact(rule),
              effort: this.estimateEffort(rule),
              codeContext: this.getContext(lines, i),
              falsePositiveRisk: 'Medium',
              references: rule.references,
            });
            break;
          }
        }
      }
    }

    return findings;
  }

  // ─── File Matching ────────────────────────────────────────────────────────

  private matchFiles(globs: string[], allFiles: string[]): string[] {
    if (globs.length === 0) return allFiles;

    const matched: string[] = [];
    for (const file of allFiles) {
      const rel = path.relative(this.root, file).replace(/\\/g, '/');
      for (const glob of globs) {
        if (this.globMatch(rel, glob)) {
          matched.push(file);
          break;
        }
      }
    }
    return matched;
  }

  private globMatch(filePath: string, glob: string): boolean {
    // Simple glob matching: convert glob to regex
    const parts = glob.replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*');
    try {
      const regex = new RegExp(parts);
      return regex.test(filePath);
    } catch {
      // Fallback: check if file extension or path segment matches
      if (glob.includes('*.')) {
        const ext = glob.split('*.').pop();
        return filePath.endsWith('.' + ext);
      }
      return filePath.includes(glob.replace(/\*/g, ''));
    }
  }

  // ─── Pattern Compilation ──────────────────────────────────────────────────

  private compilePatterns(patterns: string[]): { regex: RegExp; original: string }[] {
    const compiled: { regex: RegExp; original: string }[] = [];
    for (const p of patterns) {
      try {
        // Try as regex directly
        const regex = new RegExp(p, 'i');
        compiled.push({ regex, original: p });
      } catch {
        // If not valid regex, escape and use as literal
        try {
          const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          compiled.push({ regex: new RegExp(escaped, 'i'), original: p });
        } catch {
          // Skip completely broken patterns
        }
      }
    }
    return compiled;
  }

  // ─── False Positive Detection ─────────────────────────────────────────────

  private isFalsePositive(rule: ParsedRule, file: string, lines: string[], lineIdx: number): boolean {
    const rel = path.relative(this.root, file).replace(/\\/g, '/');

    // Skip test files for most rules
    if (rel.includes('/test/') || rel.includes('/tests/') || rel.includes('Test.java') || rel.includes('IT.java')) {
      if (rule.falsePositives.some(fp => fp.toLowerCase().includes('test'))) return true;
    }

    // Skip target directory
    if (rel.includes('/target/')) return true;

    // Check for good pattern presence (indicates code was already fixed)
    if (rule.goodPatterns.length > 0) {
      const contextWindow = lines.slice(Math.max(0, lineIdx - 5), Math.min(lines.length, lineIdx + 5)).join('\n');
      for (const gp of rule.goodPatterns) {
        try {
          if (new RegExp(gp, 'i').test(contextWindow)) return true;
        } catch { /* skip */ }
      }
    }

    return false;
  }

  // ─── Helper Methods ───────────────────────────────────────────────────────

  private readFile(fp: string): string {
    if (this.fileCache.has(fp)) return this.fileCache.get(fp)!;
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      this.totalCharsRead += content.length;
      this.fileCache.set(fp, content);
      return content;
    } catch {
      return '';
    }
  }

  private detectModule(file: string): string {
    const rel = path.relative(this.root, file).replace(/\\/g, '/');
    const knownModules = ['core', 'ui.apps', 'ui.content', 'ui.frontend', 'ui.config', 'dispatcher', 'it.tests', 'ui.tests', 'all'];
    for (const mod of knownModules) {
      if (rel.startsWith(mod + '/') || rel.includes('/' + mod + '/')) return mod;
    }
    const firstPart = rel.split('/')[0];
    return firstPart || 'root';
  }

  private getContext(lines: string[], lineIdx: number, window = 2): string {
    const start = Math.max(0, lineIdx - window);
    const end = Math.min(lines.length, lineIdx + window + 1);
    const ctx: string[] = [];
    for (let i = start; i < end; i++) {
      const prefix = i === lineIdx ? '>>>' : '   ';
      ctx.push(`${prefix} L${i + 1}: ${lines[i]}`);
    }
    return ctx.join('\n');
  }

  private generateRecommendation(rule: ParsedRule): string {
    if (rule.goodExample) {
      return `Refactor to follow the recommended pattern. ${rule.goodPatterns.length > 0 ? 'Use: ' + rule.goodPatterns[0] : ''}`.trim();
    }
    return `Address ${rule.id} per AEM best practices. See references for detailed guidance.`;
  }

  private assessImpact(rule: ParsedRule): string {
    switch (rule.severity) {
      case 'Critical': return 'Deployment failure, security breach, or data loss risk. Requires immediate remediation.';
      case 'High': return 'Significant reliability, performance, or maintainability degradation. Fix within current sprint.';
      case 'Medium': return 'Best practice violation that accumulates technical debt. Plan remediation within 1 month.';
      case 'Low': return 'Minor optimization opportunity. Address in regular backlog grooming.';
      default: return 'Informational finding for awareness.';
    }
  }

  private estimateEffort(rule: ParsedRule): string {
    // Heuristic based on rule category and severity
    if (rule.category === 'Architecture') return 'High';
    if (rule.category === 'Security' && rule.severity === 'Critical') return 'Medium';
    if (rule.category === 'Performance') return 'Medium';
    if (rule.category === 'Frontend Framework') return 'Medium';
    if (rule.severity === 'Critical' || rule.severity === 'High') return 'Medium';
    return 'Low';
  }
}
