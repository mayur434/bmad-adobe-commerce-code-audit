/**
 * AEM Scanner Context — base class with all helper methods
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import {
  ScanContext, ScannerOptions, FindingsMap, Thresholds,
  GrepResult, DEFAULT_THRESHOLDS, Finding, FrontendInfo, FrontendFramework,
} from './types';

export class AemScannerContext implements ScanContext {
  root: string | null;
  findings: FindingsMap;
  stats: Record<string, number>;
  thresholds: Thresholds;
  enabledCategories: Set<string> | null;
  selectedModules: Set<string>;
  platform: 'aemcs' | 'aemams' | 'both';

  private fileCache: Map<string, string> = new Map();
  public totalCharsRead: number = 0;

  constructor(opts: ScannerOptions = {}) {
    this.root = opts.root ? path.resolve(opts.root) : null;
    this.findings = {};
    this.stats = {};
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };
    this.enabledCategories = opts.categories ? new Set(opts.categories) : null;
    this.selectedModules = new Set(opts.modules || []);
    this.platform = opts.platform || 'both';
  }

  // ─── File collection helpers ───────────────────────────────────────

  javaFiles(): string[] {
    if (!this.root) return [];
    return fg.sync(path.join(this.root, '**/*.java').replace(/\\/g, '/'), { ignore: ['**/target/**', '**/node_modules/**'] });
  }

  xmlFiles(): string[] {
    if (!this.root) return [];
    return fg.sync(path.join(this.root, '**/*.xml').replace(/\\/g, '/'), { ignore: ['**/target/**', '**/node_modules/**'] });
  }

  htlFiles(): string[] {
    if (!this.root) return [];
    return fg.sync(path.join(this.root, '**/*.html').replace(/\\/g, '/'), { ignore: ['**/target/**', '**/node_modules/**', '**/clientlib-site/**/*.html'] });
  }

  jsFiles(): string[] {
    if (!this.root) return [];
    return fg.sync(path.join(this.root, '**/clientlib*/**/*.js').replace(/\\/g, '/'), { ignore: ['**/target/**', '**/node_modules/**'] });
  }

  cssFiles(): string[] {
    if (!this.root) return [];
    return fg.sync(path.join(this.root, '**/clientlib*/**/*.css').replace(/\\/g, '/'), { ignore: ['**/target/**', '**/node_modules/**'] });
  }

  allContentXml(): string[] {
    if (!this.root) return [];
    return fg.sync(path.join(this.root, '**/.content.xml').replace(/\\/g, '/'), { ignore: ['**/target/**', '**/node_modules/**'] });
  }

  frontendSrcFiles(): string[] {
    if (!this.root) return [];
    return fg.sync(
      path.join(this.root, 'ui.frontend/src/**/*.{ts,tsx,js,jsx,vue,scss,css,less,html}').replace(/\\/g, '/'),
      { ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.cache/**'] }
    );
  }

  detectFrontendFramework(): FrontendInfo | null {
    if (!this.root) return null;
    const pkgPath = path.join(this.root, 'ui.frontend', 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      let framework: FrontendFramework = 'vanilla';
      let version = '';

      if (allDeps['react'] || allDeps['react-dom']) {
        framework = 'react';
        version = allDeps['react'] || allDeps['react-dom'] || '';
      } else if (allDeps['@angular/core']) {
        framework = 'angular';
        version = allDeps['@angular/core'] || '';
      } else if (allDeps['vue']) {
        framework = 'vue';
        version = allDeps['vue'] || '';
      }

      return {
        framework,
        version: version.replace(/[\^~>=<]/g, ''),
        hasTypeScript: !!allDeps['typescript'],
        hasSCSS: !!allDeps['sass'] || !!allDeps['node-sass'],
        hasWebpack: !!allDeps['webpack'],
        hasVite: !!allDeps['vite'],
        packageJsonPath: pkgPath,
        srcDir: path.join(this.root, 'ui.frontend', 'src'),
      };
    } catch {
      return null;
    }
  }

  // ─── Path helpers ──────────────────────────────────────────────────

  rel(fp: string): string {
    if (this.root) return path.relative(this.root, fp).replace(/\\/g, '/');
    return fp;
  }

  module(fp: string): string {
    const rel = this.rel(fp);
    const parts = rel.split('/');
    // Determine AEM module: ui.apps, ui.content, core, dispatcher, etc.
    if (parts.length >= 1) {
      // Standard AEM project modules
      const knownModules = ['core', 'ui.apps', 'ui.content', 'ui.frontend', 'ui.config', 'dispatcher', 'it.tests', 'ui.tests', 'all'];
      for (const mod of knownModules) {
        if (parts[0] === mod || rel.startsWith(mod + '/')) return mod;
      }
      // Nested modules like apps/myapp
      return parts[0];
    }
    return 'Unknown';
  }

  // ─── File reading ──────────────────────────────────────────────────

  read(fp: string): string {
    if (!this.fileCache.has(fp)) {
      try {
        const content = fs.readFileSync(fp, 'utf-8');
        this.totalCharsRead += content.length;
        this.fileCache.set(fp, content);
      } catch {
        this.fileCache.set(fp, '');
      }
    }
    return this.fileCache.get(fp)!;
  }

  // ─── Grep helper ──────────────────────────────────────────────────

  grep(fp: string, pattern: RegExp): GrepResult[] {
    const results: GrepResult[] = [];
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      if (!this.fileCache.has(fp)) this.totalCharsRead += content.length;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const m = pattern.exec(lines[i]);
        if (m) {
          results.push({ lineNum: i + 1, lineText: lines[i].trim(), match: m });
          pattern.lastIndex = 0;
        }
      }
    } catch { /* ignore */ }
    return results;
  }

  // ─── Line number from char position ────────────────────────────────

  lineOf(content: string, pos: number): number {
    return content.substring(0, pos).split('\n').length;
  }

  // ─── Code context around a line ────────────────────────────────────

  context(fp: string, lineNum: number, window = 2): string {
    const lines: string[] = [];
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const allLines = content.split('\n');
      const start = Math.max(0, lineNum - window - 1);
      const end = Math.min(allLines.length, lineNum + window);
      for (let i = start; i < end; i++) {
        const prefix = i === lineNum - 1 ? '>>>' : '   ';
        lines.push(`${prefix} L${i + 1}: ${allLines[i]}`);
      }
    } catch { /* ignore */ }
    return lines.join('\n');
  }

  // ─── Add finding ──────────────────────────────────────────────────

  add(
    category: string, mod: string, fp: string, line: number,
    issueType: string, desc: string, code: string, severity: string,
    rec: string, effort = 'Medium', impact = '', confidence = 'Verified', justification = ''
  ): void {
    if (this.enabledCategories && !this.enabledCategories.has(category)) return;
    if (!this.findings[category]) this.findings[category] = [];
    this.findings[category].push({
      module: mod, file: this.rel(fp), line, type: issueType,
      description: desc, code: code ? code.substring(0, 600) : '',
      severity, recommendation: rec, effort, impact, confidence, justification,
      platform: 'both',
    });
    this.stats[severity] = (this.stats[severity] || 0) + 1;
  }

  addWithPlatform(
    category: string, mod: string, fp: string, line: number,
    issueType: string, desc: string, code: string, severity: string,
    rec: string, platform: 'aemcs' | 'aemams' | 'both',
    effort = 'Medium', impact = '', confidence = 'Verified', justification = ''
  ): void {
    // Skip if finding is platform-specific and doesn't match current scan target
    if (platform === 'aemcs' && this.platform === 'aemams') return;
    if (platform === 'aemams' && this.platform === 'aemcs') return;
    if (this.enabledCategories && !this.enabledCategories.has(category)) return;
    if (!this.findings[category]) this.findings[category] = [];
    this.findings[category].push({
      module: mod, file: this.rel(fp), line, type: issueType,
      description: desc, code: code ? code.substring(0, 600) : '',
      severity, recommendation: rec, effort, impact, confidence, justification,
      platform,
    });
    this.stats[severity] = (this.stats[severity] || 0) + 1;
  }
}
