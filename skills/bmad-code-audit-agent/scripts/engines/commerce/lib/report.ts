/**
 * Adobe Commerce Code Audit Report Generator
 * Generates enterprise Excel report with charts from scanner findings.
 */
import ExcelJS from 'exceljs';
import * as path from 'path';
import { FindingsMap, StatsMap, Finding } from './scanner/types';
import {
  TITLE_FONT, SUBTITLE_FONT, HEADER_FONT, HEADER_FILL, HEADER_BORDER,
  SUMMARY_LABEL_FONT, SUMMARY_VALUE_FONT, BODY_FONT, BODY_FONT_BOLD,
  CODE_FONT, SECTION_FILL, THIN_BORDER, ZEBRA_FILL_1, ZEBRA_FILL_2,
  CENTER_ALIGN, CENTER_TOP, LEFT_TOP,
  severityFill, severityFont, styleHeaderRow,
  applyZebraAndBorders, colorSeverityCol, colorPriorityCol,
} from './styles';
import { getExpertRecommendation } from './expert';

export class AuditReportGenerator {
  private findings: FindingsMap;
  private stats: StatsMap;
  private projectName: string;
  private projectRoot: string;
  private wb: ExcelJS.Workbook;

  constructor(findings: FindingsMap, stats: StatsMap, projectName: string, projectRoot: string) {
    this.findings = findings;
    this.stats = stats;
    this.projectName = projectName;
    this.projectRoot = projectRoot;
    this.wb = new ExcelJS.Workbook();
  }

  async generate(outputPath: string): Promise<void> {
    console.log('\n📊 Generating enterprise report...');
    this.sheetExecutiveSummary();

    const order = [
      'Exception Handling', 'Security', 'Database', 'Caching',
      'Code Structure', 'Performance', 'Deprecated', 'Logging',
      'File Storage', 'Reusability', 'Test Coverage',
      'Dependency Injection', 'Plugin Architecture', 'Cron Jobs',
      'GraphQL', 'Queue Processing', 'Configuration', 'Frontend Templates',
      'XML Configuration', 'WebAPI & ACL', 'DB Schema',
      'Infrastructure', 'Cloud Deployment', 'PHP Deep Analysis',
      'Event Observers', 'Module Architecture', 'Code Metrics',
      'Business Logic Identification', 'Business Customization Review',
      'Critical Commerce Flows', 'MSI Inventory & Source Management',
      'Admin & Integration Security', 'Logical Flow & Cross-Module',
      'Coding Standards', 'Input Validation & XSS', 'Frontend Assets',
      'Composer & Dependencies', 'Full Page Cache & Private Content',
      'Backward Compatibility', 'Configuration & Scope',
      'Layout & UI Components', 'XML Schema Validation',
      'DB: Table Structure', 'DB: Index Analysis', 'DB: Column Analysis',
      'DB: Foreign Keys', 'DB: Naming Conventions', 'DB: Storage Engine',
      'DB: Charset & Collation', 'DB: Adobe Commerce Schema',
      'DB: Data Integrity', 'DB: Performance',
      'New Requirement Analysis', 'Feature Enhancement Analysis',
      'Patch / Upgrade Analysis', 'Bug Impact Analysis',
    ];

    for (const cat of order) {
      if (this.findings[cat] && this.findings[cat].length > 0) {
        this.sheetDetail(cat, this.findings[cat]);
      }
    }

    this.sheetBrdRequirementImpactMap();
    this.sheetRecommendations();
    this.sheetModuleRolloutSummary();
    this.sheetModulePlan();

    await this.wb.xlsx.writeFile(outputPath);
    console.log(`✅ Report: ${outputPath}`);
    console.log(`   Sheets: ${this.wb.worksheets.length}`);
    for (const ws of this.wb.worksheets) {
      console.log(`   - ${ws.name}`);
    }
  }

  // ---------- Executive Summary ----------

  private sheetExecutiveSummary(): void {
    const ws = this.wb.addWorksheet('Executive Summary', { properties: { tabColor: { argb: '1F4E79' } } });

    const total = this.stats.totalFindings;
    const sev = this.stats.severityCounts;

    // Title
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${this.projectName} — ENTERPRISE CODE AUDIT REPORT`;
    titleCell.font = TITLE_FONT;
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Subtitle bar
    ws.mergeCells('A2:F2');
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
    ws.getRow(2).height = 4;

    // Metadata
    const meta: [string, string | number][] = [
      ['Generated:', new Date().toISOString().replace('T', ' ').substring(0, 19)],
      ['Project Root:', this.projectRoot],
      ['Tool:', 'Adobe Commerce Audit & Impact Analysis Tool v4.0'],
      ['Total Findings:', total],
    ];
    for (let i = 0; i < meta.length; i++) {
      const row = i + 3;
      ws.getCell(row, 1).value = meta[i][0];
      ws.getCell(row, 1).font = SUMMARY_LABEL_FONT;
      ws.getCell(row, 1).alignment = LEFT_TOP;
      ws.getCell(row, 2).value = meta[i][1];
      ws.getCell(row, 2).font = SUMMARY_VALUE_FONT;
      ws.getCell(row, 2).alignment = LEFT_TOP;
      ws.getRow(row).height = 22;
    }

    // Severity Breakdown
    const sevStart = 8;
    ws.mergeCells(`A${sevStart}:F${sevStart}`);
    const secCell = ws.getCell(sevStart, 1);
    secCell.value = 'SEVERITY BREAKDOWN';
    secCell.font = SUBTITLE_FONT;
    secCell.fill = SECTION_FILL;
    secCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(sevStart).height = 28;

    const sevHdrRow = sevStart + 1;
    const sevHeaders = ['Severity', 'Count', 'Description'];
    for (let c = 0; c < sevHeaders.length; c++) {
      const cell = ws.getCell(sevHdrRow, c + 1);
      cell.value = sevHeaders[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    const sevData: [string, number, string][] = [
      ['CRITICAL', sev['CRITICAL'] || 0, 'Must fix immediately — security, data loss, production failures'],
      ['HIGH', sev['HIGH'] || 0, 'Fix within 2 weeks — performance, reliability, architecture'],
      ['MEDIUM', sev['MEDIUM'] || 0, 'Fix within 1 month — best practices, maintainability, deprecations'],
      ['LOW', sev['LOW'] || 0, 'Backlog — code style, conventions, minor optimizations'],
      ['INFO', sev['INFO'] || 0, 'Informational — no action required'],
    ];
    for (let i = 0; i < sevData.length; i++) {
      const row = sevHdrRow + 1 + i;
      const [s, cnt, desc] = sevData[i];
      ws.getCell(row, 1).value = s;
      ws.getCell(row, 1).fill = severityFill(s);
      ws.getCell(row, 1).font = severityFont(s);
      ws.getCell(row, 1).alignment = CENTER_TOP;
      ws.getCell(row, 1).border = THIN_BORDER;
      ws.getCell(row, 2).value = cnt;
      ws.getCell(row, 2).font = { name: 'Calibri', bold: true, size: 12, color: { argb: '333333' } };
      ws.getCell(row, 2).alignment = CENTER_TOP;
      ws.getCell(row, 2).border = THIN_BORDER;
      ws.getCell(row, 3).value = desc;
      ws.getCell(row, 3).font = BODY_FONT;
      ws.getCell(row, 3).alignment = LEFT_TOP;
      ws.getCell(row, 3).border = THIN_BORDER;
      ws.getRow(row).height = 22;
    }

    // Category Breakdown
    const catStart = sevHdrRow + sevData.length + 2;
    ws.mergeCells(`A${catStart}:F${catStart}`);
    ws.getCell(catStart, 1).value = 'CATEGORY BREAKDOWN';
    ws.getCell(catStart, 1).font = SUBTITLE_FONT;
    ws.getCell(catStart, 1).fill = SECTION_FILL;
    ws.getCell(catStart, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(catStart).height = 28;

    const catHdrRow = catStart + 1;
    const catHeaders = ['Category', 'Total', 'Critical', 'High', 'Medium', 'Low'];
    for (let c = 0; c < catHeaders.length; c++) {
      const cell = ws.getCell(catHdrRow, c + 1);
      cell.value = catHeaders[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    const sortedCats = Object.keys(this.findings).sort();
    for (let i = 0; i < sortedCats.length; i++) {
      const row = catHdrRow + 1 + i;
      const cat = sortedCats[i];
      const items = this.findings[cat];
      ws.getCell(row, 1).value = cat;
      ws.getCell(row, 1).font = BODY_FONT_BOLD;
      ws.getCell(row, 2).value = items.length;
      for (let si = 0; si < 4; si++) {
        const sevName = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'][si];
        const count = items.filter((it) => it.severity === sevName).length;
        ws.getCell(row, 3 + si).value = count;
        if (count > 0) {
          ws.getCell(row, 3 + si).fill = severityFill(sevName);
          ws.getCell(row, 3 + si).font = severityFont(sevName);
        }
      }
      ws.getRow(row).height = 20;
    }

    // Column widths
    ws.getColumn(1).width = 40;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 70;
    ws.getColumn(4).width = 15;
    ws.getColumn(5).width = 15;
    ws.getColumn(6).width = 15;
  }

  // ---------- Detail Sheets ----------

  private sheetDetail(category: string, items: Finding[]): void {
    const name = category.replace(/[:\\/?\*\[\]]/g, '-').substring(0, 31);
    const ws = this.wb.addWorksheet(name);

    const headers = [
      '#', 'Module', 'File Path', 'Line #', 'Issue Type', 'Description',
      'Code Context', 'Severity', 'Justification',
      'Impact Analysis', 'Recommendation',
      'Expert Validation & Recommendation', 'Effort',
    ];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(1, c + 1);
      cell.value = headers[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }
    ws.getRow(1).height = 28;
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    for (let idx = 0; idx < items.length; idx++) {
      const r = idx + 2;
      const item = items[idx];
      ws.getRow(r).height = 32;
      ws.getCell(r, 1).value = idx + 1;
      ws.getCell(r, 2).value = item.module;
      ws.getCell(r, 3).value = item.file;
      ws.getCell(r, 4).value = item.line;
      ws.getCell(r, 5).value = item.type;
      ws.getCell(r, 6).value = item.description;
      ws.getCell(r, 7).value = (item.code || '').substring(0, 500);
      ws.getCell(r, 7).font = CODE_FONT;
      ws.getCell(r, 8).value = item.severity;
      ws.getCell(r, 9).value = (item.justification || '').substring(0, 500);
      ws.getCell(r, 10).value = item.impact || '';
      ws.getCell(r, 11).value = item.recommendation;
      ws.getCell(r, 12).value = getExpertRecommendation(category, item.type, item.severity, item.effort);
      ws.getCell(r, 13).value = item.effort;
    }

    const mr = items.length + 1;
    colorSeverityCol(ws, 8, mr);
    applyZebraAndBorders(ws, mr, headers.length, 2);

    const widths = [6, 28, 55, 8, 28, 60, 55, 12, 65, 60, 65, 75, 10];
    for (let i = 0; i < widths.length; i++) {
      ws.getColumn(i + 1).width = widths[i];
    }
  }

  // ---------- BRD Requirement Impact Map ----------

  private sheetBrdRequirementImpactMap(): void {
    const brdCats = [
      'New Requirement Analysis', 'Feature Enhancement Analysis',
      'Patch / Upgrade Analysis', 'Bug Impact Analysis',
    ];
    const brdFindings: Finding[] = [];
    for (const cat of brdCats) {
      brdFindings.push(...(this.findings[cat] || []));
    }
    if (brdFindings.length === 0) return;

    const ws = this.wb.addWorksheet('BRD Requirement Impact Map', { properties: { tabColor: { argb: '0070C0' } } });

    const headers = [
      '#', 'Requirement ID', 'Requirement Title', 'Impact Type',
      'Impacted Module', 'Impacted File', 'Line', 'Severity',
      'Justification', 'Impact Analysis', 'Recommendation', 'Effort',
    ];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(1, c + 1);
      cell.value = headers[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }
    ws.getRow(1).height = 28;
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    const reqPattern = /^\[?(REQ-\d+|BUG-\d+)\]?\s*(.*?)(?:\s*[—–-]\s*|\s*$)/;
    const reqGroups: Record<string, { title: string; items: Finding[] }> = {};

    for (const item of brdFindings) {
      const desc = item.description || '';
      const m = desc.match(reqPattern);
      let reqId: string;
      let rawTitle: string;
      if (m) {
        reqId = m[1];
        rawTitle = m[2].trim();
      } else {
        reqId = 'GENERAL';
        rawTitle = item.type || '';
      }
      if (!reqGroups[reqId]) reqGroups[reqId] = { title: rawTitle, items: [] };
      if (rawTitle.length > reqGroups[reqId].title.length) reqGroups[reqId].title = rawTitle;
      reqGroups[reqId].items.push(item);
    }

    let row = 2;
    let seq = 0;
    const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

    for (const [reqId, group] of Object.entries(reqGroups)) {
      const sorted = group.items.sort((a, b) => (sevOrder[a.severity] || 5) - (sevOrder[b.severity] || 5));
      for (const item of sorted) {
        seq++;
        ws.getRow(row).height = 30;
        ws.getCell(row, 1).value = seq;
        ws.getCell(row, 2).value = reqId;
        ws.getCell(row, 3).value = group.title.substring(0, 100);
        ws.getCell(row, 4).value = item.type;
        ws.getCell(row, 5).value = item.module;
        ws.getCell(row, 6).value = item.file;
        ws.getCell(row, 7).value = item.line;
        ws.getCell(row, 8).value = item.severity;
        ws.getCell(row, 9).value = (item.justification || '').substring(0, 500);
        ws.getCell(row, 10).value = (item.impact || '').substring(0, 300);
        ws.getCell(row, 11).value = (item.recommendation || '').substring(0, 300);
        ws.getCell(row, 12).value = item.effort;
        row++;
      }
    }

    const mr = row - 1;
    colorSeverityCol(ws, 8, mr);
    applyZebraAndBorders(ws, mr, headers.length, 2);

    const widths = [6, 14, 45, 28, 30, 50, 8, 12, 60, 55, 60, 10];
    for (let i = 0; i < widths.length; i++) {
      ws.getColumn(i + 1).width = widths[i];
    }
  }

  // ---------- Recommendations ----------

  private sheetRecommendations(): void {
    const ws = this.wb.addWorksheet('Recommendations', { properties: { tabColor: { argb: '00B050' } } });

    const headers = ['#', 'Area', 'Recommendation', 'Expected Impact', 'Effort', 'Priority', 'Details'];
    for (let c = 0; c < headers.length; c++) {
      ws.getCell(1, c + 1).value = headers[c];
    }
    styleHeaderRow(ws, headers.length);

    const recs: string[][] = [
      ['Performance', 'Enable Redis for FPC + session + cache backend', '50-80% page load reduction', 'Low', 'P0', 'bin/magento setup:config:set --cache-backend=redis --page-cache=redis --session-save=redis'],
      ['Performance', 'Enable Varnish HTTP accelerator', '90%+ server load reduction for cacheable pages', 'Medium', 'P0', 'Varnish 7.x as reverse proxy. Custom VCL for dynamic blocks.'],
      ['Performance', 'Fix all N+1 query patterns', '10-100x speedup on affected pages', 'Medium', 'P0', 'Batch load collections before loops.'],
      ['Performance', 'Add database indexes to custom tables', '50-90% faster queries on large tables', 'Low', 'P1', 'Add btree indexes on sku, status, created_at in db_schema.xml.'],
      ['Security', 'Implement CSP whitelist for all modules', 'Prevent XSS from injected scripts', 'Low', 'P1', 'Create etc/csp_whitelist.xml for each module.'],
      ['Security', 'Add webhook signature validation', 'Prevent forged webhooks', 'Medium', 'P0', 'Validate HMAC on all payment gateway webhooks.'],
      ['Security', 'Remove all hardcoded credentials', 'Prevent credential exposure', 'Low', 'P0', 'Use encrypted backend_model in system.xml.'],
      ['Quality', 'Add declare(strict_types=1) to all PHP files', 'Catch type bugs at runtime', 'Low', 'P2', 'Automated: find app/code -name *.php and add declaration.'],
      ['Quality', 'Enable PHPStan level 6+ in CI/CD', 'Catch bugs before deploy', 'Medium', 'P1', 'Install PHPStan + Magento extension.'],
      ['Infra', 'Separate Redis instances for cache/session/FPC', 'Prevent conflicts', 'Medium', 'P1', 'db0=cache, db1=FPC, db2=sessions.'],
      ['Infra', 'Add security headers to nginx', 'Prevent clickjacking, XSS', 'Low', 'P0', 'X-Frame-Options, X-Content-Type-Options, HSTS, CSP.'],
      ['Infra', 'Enable nginx gzip compression', '40-70% smaller responses', 'Low', 'P0', 'gzip on; gzip_types text/css application/javascript;'],
      ['Cloud', 'Set SCD_STRATEGY=compact', '2-5x faster SCD', 'Low', 'P1', 'Add to .magento.env.yaml stage.build.'],
      ['PHP', 'Replace all MD5/SHA1 usage', 'Eliminate weak cryptography', 'Low', 'P0', "Use hash('sha256', ...) or random_bytes()."],
      ['PHP', 'Fix all DateTime timezone issues', 'Prevent date bugs', 'Low', 'P0', 'Always pass DateTimeZone to new DateTime().'],
      ['DB Schema', 'Add indexes to custom tables', '50-90% faster filtered queries', 'Low', 'P0', 'Index status, FK, created_at columns.'],
      ['Deploy', 'Add pre-deployment validation pipeline', 'Catch issues before production', 'Medium', 'P1', 'CI: PHPStan + PHPCS + Unit Tests + di:compile.'],
      ['WebAPI', 'Secure anonymous API endpoints', 'Prevent unauthorized access', 'Low', 'P0', "Change resource='anonymous' to 'self' or custom ACL."],
    ];

    for (let idx = 0; idx < recs.length; idx++) {
      const r = idx + 2;
      ws.getCell(r, 1).value = idx + 1;
      for (let ci = 0; ci < recs[idx].length; ci++) {
        ws.getCell(r, ci + 2).value = recs[idx][ci];
      }
    }

    const mr = recs.length + 1;
    colorPriorityCol(ws, 6, mr);
    applyZebraAndBorders(ws, mr, headers.length);

    const widths = [6, 16, 55, 48, 10, 10, 85];
    for (let i = 0; i < widths.length; i++) {
      ws.getColumn(i + 1).width = widths[i];
    }
  }

  // ---------- Module Rollout Summary ----------

  private sheetModuleRolloutSummary(): void {
    const ws = this.wb.addWorksheet('Module Rollout Summary', { properties: { tabColor: { argb: '8064A2' } } });

    const headers = [
      'Wave', 'Module', 'Domain', 'Total', 'Critical', 'High', 'Medium', 'Low', 'Info',
      'Risk Score', 'Deployment / Validation Recommendation',
    ];
    for (let c = 0; c < headers.length; c++) {
      ws.getCell(1, c + 1).value = headers[c];
    }
    styleHeaderRow(ws, headers.length);
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    const sevWeight: Record<string, number> = { CRITICAL: 10000, HIGH: 1000, MEDIUM: 100, LOW: 10, INFO: 1 };
    const modules: Record<string, Finding[]> = {};
    for (const items of Object.values(this.findings)) {
      for (const item of items) {
        const mod = item.module || 'Unknown';
        if (!modules[mod]) modules[mod] = [];
        modules[mod].push(item);
      }
    }

    const rows: (string | number)[][] = [];
    for (const [mod, items] of Object.entries(modules)) {
      const counts: Record<string, number> = {};
      for (const i of items) counts[i.severity] = (counts[i.severity] || 0) + 1;
      const crit = counts['CRITICAL'] || 0;
      const high = counts['HIGH'] || 0;
      const med = counts['MEDIUM'] || 0;
      const low = counts['LOW'] || 0;
      const info = counts['INFO'] || 0;
      const score = items.reduce((s, i) => s + (sevWeight[i.severity] || 1), 0);
      const domain = this.moduleDomain(mod);
      const wave = this.rolloutWave(domain, crit, high, med);
      const caution = this.deploymentCaution(domain, crit, high);
      rows.push([wave, mod, domain, items.length, crit, high, med, low, info, score, caution]);
    }

    const waveOrder: Record<string, number> = {
      'Wave 0 - Security / Revenue Critical': 0,
      'Wave 1 - Critical Stabilization': 1,
      'Wave 2 - Business Flow Hardening': 2,
      'Wave 3 - Technical Risk Reduction': 3,
      'Wave 4 - Maintainability / Performance': 4,
      'Wave 5 - Low Risk Cleanup': 5,
    };
    rows.sort((a, b) => (waveOrder[a[0] as string] ?? 99) - (waveOrder[b[0] as string] ?? 99) || (b[9] as number) - (a[9] as number));

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        ws.getCell(r + 2, c + 1).value = rows[r][c];
      }
    }

    const mr = Math.max(1, rows.length + 1);
    colorPriorityCol(ws, 1, mr);
    applyZebraAndBorders(ws, mr, headers.length, 2);

    const widths = [34, 32, 32, 10, 10, 10, 10, 10, 10, 12, 90];
    for (let i = 0; i < widths.length; i++) {
      ws.getColumn(i + 1).width = widths[i];
    }
  }

  // ---------- Module Execution Plan ----------

  private sheetModulePlan(): void {
    const ws = this.wb.addWorksheet('Module Execution Plan', { properties: { tabColor: { argb: '7030A0' } } });

    const headers = [
      '#', 'Module', 'Priority', 'Category', 'Severity',
      'Issue Type', 'File', 'Line', 'Description',
      'Justification', 'Impact Analysis', 'Recommendation', 'Effort',
    ];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(1, c + 1);
      cell.value = headers[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }
    ws.getRow(1).height = 28;
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    const sevWeight: Record<string, number> = { CRITICAL: 10000, HIGH: 1000, MEDIUM: 100, LOW: 10, INFO: 1 };
    const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

    const modItems: Record<string, (Finding & { _category: string })[]> = {};
    const modScores: Record<string, number> = {};
    for (const [cat, items] of Object.entries(this.findings)) {
      for (const item of items) {
        const mod = item.module || 'Unknown';
        if (!modItems[mod]) modItems[mod] = [];
        modItems[mod].push({ ...item, _category: cat });
        modScores[mod] = (modScores[mod] || 0) + (sevWeight[item.severity] || 1);
      }
    }

    const sortedModules = Object.keys(modItems).sort((a, b) => (modScores[b] || 0) - (modScores[a] || 0));

    let row = 2;
    let seq = 0;
    for (const mod of sortedModules) {
      const items = modItems[mod].sort((a, b) => (sevOrder[a.severity] || 5) - (sevOrder[b.severity] || 5));
      const crit = items.filter((i) => i.severity === 'CRITICAL').length;
      const high = items.filter((i) => i.severity === 'HIGH').length;
      const med = items.filter((i) => i.severity === 'MEDIUM').length;

      let modPriority: string;
      if (crit > 0) modPriority = 'P0 — Immediate';
      else if (high > 0) modPriority = 'P1 — This Sprint';
      else if (med > 0) modPriority = 'P2 — Next Sprint';
      else modPriority = 'P3 — Backlog';

      for (const item of items) {
        seq++;
        ws.getRow(row).height = 30;
        ws.getCell(row, 1).value = seq;
        ws.getCell(row, 2).value = mod;
        ws.getCell(row, 3).value = modPriority;
        ws.getCell(row, 4).value = item._category;
        ws.getCell(row, 5).value = item.severity;
        ws.getCell(row, 6).value = item.type;
        ws.getCell(row, 7).value = item.file;
        ws.getCell(row, 8).value = item.line;
        ws.getCell(row, 9).value = (item.description || '').substring(0, 200);
        ws.getCell(row, 10).value = (item.justification || '').substring(0, 500);
        ws.getCell(row, 11).value = (item.impact || '').substring(0, 300);
        ws.getCell(row, 12).value = (item.recommendation || '').substring(0, 300);
        ws.getCell(row, 13).value = item.effort;
        row++;
      }
    }

    const mr = row - 1;
    colorSeverityCol(ws, 5, mr);
    colorPriorityCol(ws, 3, mr);
    applyZebraAndBorders(ws, mr, headers.length, 2);

    const widths = [6, 30, 20, 28, 12, 32, 48, 8, 55, 60, 55, 60, 10];
    for (let i = 0; i < widths.length; i++) {
      ws.getColumn(i + 1).width = widths[i];
    }
  }

  // ---------- Helper Methods ----------

  private moduleDomain(moduleName: string): string {
    const m = (moduleName || '').toLowerCase();
    if (['payment', 'pay', 'razor', 'stripe', 'paypal', 'cashfree', 'refund', 'invoice', 'creditmemo'].some((x) => m.includes(x)))
      return 'Payment / Invoice / Refund';
    if (['checkout', 'quote', 'cart', 'coupon', 'promo', 'salesrule', 'shipping', 'address', 'tax'].some((x) => m.includes(x)))
      return 'Checkout / Quote / Shipping / Tax';
    if (['sales', 'order', 'shipment', 'rma', 'return'].some((x) => m.includes(x)))
      return 'Order / Fulfilment';
    if (['inventory', 'msi', 'stock', 'source', 'warehouse', 'erp', 'sap', 'wms'].some((x) => m.includes(x)))
      return 'Inventory / MSI / ERP';
    if (['customer', 'login', 'otp', 'account', 'loyalty', 'reward', 'wallet'].some((x) => m.includes(x)))
      return 'Customer / Identity / Loyalty';
    if (['catalog', 'product', 'category', 'search', 'elastic', 'opensearch', 'price', 'pricing'].some((x) => m.includes(x)))
      return 'Catalog / Search / Pricing';
    if (['admin', 'acl', 'api', 'graphql', 'webapi', 'integration', 'webhook'].some((x) => m.includes(x)))
      return 'Admin / API / Integration';
    if (['theme', 'frontend', 'widget', 'banner', 'cms', 'pagebuilder', 'ui'].some((x) => m.includes(x)))
      return 'Frontend / CMS / Theme';
    if (['cron', 'queue', 'message', 'cache', 'redis', 'varnish', 'cloud', 'deploy', 'logger', 'log'].some((x) => m.includes(x)))
      return 'Platform / Infra / Operations';
    return 'Core / Shared / Other';
  }

  private rolloutWave(domain: string, crit: number, high: number, med: number): string {
    if (crit > 0 && ['Payment / Invoice / Refund', 'Checkout / Quote / Shipping / Tax', 'Admin / API / Integration'].includes(domain))
      return 'Wave 0 - Security / Revenue Critical';
    if (crit > 0) return 'Wave 1 - Critical Stabilization';
    if (high > 0 && ['Payment / Invoice / Refund', 'Checkout / Quote / Shipping / Tax', 'Order / Fulfilment', 'Inventory / MSI / ERP'].includes(domain))
      return 'Wave 2 - Business Flow Hardening';
    if (high > 0) return 'Wave 3 - Technical Risk Reduction';
    if (med > 0) return 'Wave 4 - Maintainability / Performance';
    return 'Wave 5 - Low Risk Cleanup';
  }

  private deploymentCaution(domain: string, crit: number, high: number): string {
    const cautions: Record<string, string> = {
      'Payment / Invoice / Refund': 'Deploy separately with payment sandbox validation, webhook replay tests, refund/invoice regression, and rollback plan.',
      'Checkout / Quote / Shipping / Tax': 'Deploy with checkout/cart regression, coupon/tax/shipping matrix, cache warmup, and order placement smoke tests.',
      'Order / Fulfilment': 'Validate order state transitions, invoice/shipment/credit memo lifecycle, emails, ERP sync, and admin operations.',
      'Inventory / MSI / ERP': 'Validate salable qty, reservations, source deduction, cancellations, refunds, backorders, and ERP reconciliation.',
      'Admin / API / Integration': 'Validate ACL, tokens, API contracts, callback signatures, rate limiting, and integration negative scenarios.',
      'Catalog / Search / Pricing': 'Validate reindexing, price rules, search relevance, category/product cache tags, and product detail/category pages.',
      'Frontend / CMS / Theme': 'Validate FPC behavior, private content, CSP, JS bundling, checkout impact, and key responsive journeys.',
      'Platform / Infra / Operations': 'Coordinate with deployment window; validate cron/queue/cache/Redis/Varnish/OpenSearch and monitoring dashboards.',
    };
    if (cautions[domain]) return cautions[domain];
    if (crit || high) return 'Deploy in a controlled release with targeted functional, integration, and rollback validation.';
    return 'Can be batched with similar low-risk modules after automated tests pass.';
  }
}
