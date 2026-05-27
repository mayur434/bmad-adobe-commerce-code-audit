/**
 * AEM Code Audit Report Generator
 * Generates enterprise Excel report with separate sheets per audit category.
 * Categories: Performance, Code Quality, SEO, Accessibility, Security,
 * Architecture, Sling & OSGi, Cloud Readiness, Dispatcher, Test Coverage,
 * Maintainability, HTL & Frontend
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

export class AemReportGenerator {
  private findings: FindingsMap;
  private stats: StatsMap;
  private projectName: string;
  private projectRoot: string;
  private platform: string;
  private wb: ExcelJS.Workbook;

  constructor(findings: FindingsMap, stats: StatsMap, projectName: string, projectRoot: string, platform: string = 'AEMaaCS') {
    this.findings = findings;
    this.stats = stats;
    this.projectName = projectName;
    this.projectRoot = projectRoot;
    this.platform = platform;
    this.wb = new ExcelJS.Workbook();
  }

  async generate(outputPath: string): Promise<void> {
    console.log('\n📊 Generating AEM Audit Excel Report...');

    // 1. Executive Summary (always first)
    this.sheetExecutiveSummary();

    // 2. Category detail sheets in defined order
    const categoryOrder = [
      'Performance',
      'Code Quality',
      'Security',
      'SEO',
      'Accessibility',
      'Architecture',
      'Sling & OSGi',
      'Cloud Readiness',
      'Dispatcher',
      'HTL & Frontend',
      'Test Coverage',
      'Maintainability',
      'Dependencies & Versions',
    ];

    for (const cat of categoryOrder) {
      if (this.findings[cat] && this.findings[cat].length > 0) {
        this.sheetDetail(cat, this.findings[cat]);
      }
    }

    // 3. Recommendations summary
    this.sheetRecommendations();

    // 4. Module Rollout Summary
    this.sheetModuleRolloutSummary();

    // 5. Module Execution Plan
    this.sheetModulePlan();

    // 6. Action Plan
    this.sheetActionPlan();

    await this.wb.xlsx.writeFile(outputPath);
    console.log(`✅ Report generated: ${outputPath}`);
    console.log(`   Total Sheets: ${this.wb.worksheets.length}`);
    for (const ws of this.wb.worksheets) {
      console.log(`   📄 ${ws.name} (${ws.rowCount - 1} rows)`);
    }
  }

  // ─── Executive Summary Sheet ───────────────────────────────────────────

  private sheetExecutiveSummary(): void {
    const ws = this.wb.addWorksheet('Executive Summary', { properties: { tabColor: { argb: '1F4E79' } } });

    const total = this.stats.totalFindings;
    const sev = this.stats.severityCounts;

    // Title
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${this.projectName} — AEM CODE AUDIT REPORT`;
    titleCell.font = TITLE_FONT;
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Subtitle bar
    ws.mergeCells('A2:G2');
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
    ws.getRow(2).height = 4;

    // Metadata
    const meta: [string, string | number][] = [
      ['Generated:', new Date().toISOString().replace('T', ' ').substring(0, 19)],
      ['Project Root:', this.projectRoot],
      ['Platform:', this.platform],
      ['Java Version:', this.stats.techStack.javaVersion || 'Not detected'],
      ['AEM Version:', this.stats.techStack.aemVersion || this.stats.techStack.aemSdkVersion || 'Not detected'],
      ['Frontend:', `${this.stats.frontendFramework}${this.stats.frontendVersion ? ' ' + this.stats.frontendVersion : ''} (${this.stats.frontendSrcFiles} source files)`],
      ['Tool:', 'AEM Code Audit Engine v1.0 (BMAD)'],
      ['Total Findings:', total],
      ['Scan Duration:', `${(this.stats.scanDuration / 1000).toFixed(1)}s`],
      ['Files Analyzed:', `Java: ${this.stats.javaFiles}, XML: ${this.stats.xmlFiles}, HTL: ${this.stats.htlFiles}, JS: ${this.stats.jsFiles}, CSS: ${this.stats.cssFiles}`],
    ];
    for (let i = 0; i < meta.length; i++) {
      const row = i + 4;
      ws.getCell(row, 1).value = meta[i][0];
      ws.getCell(row, 1).font = SUMMARY_LABEL_FONT;
      ws.getCell(row, 1).alignment = LEFT_TOP;
      ws.mergeCells(row, 2, row, 4);
      ws.getCell(row, 2).value = meta[i][1];
      ws.getCell(row, 2).font = SUMMARY_VALUE_FONT;
      ws.getCell(row, 2).alignment = LEFT_TOP;
      ws.getRow(row).height = 22;
    }

    // Severity Breakdown
    const sevStart = 4 + meta.length + 1;
    ws.mergeCells(`A${sevStart}:G${sevStart}`);
    const secCell = ws.getCell(sevStart, 1);
    secCell.value = 'SEVERITY BREAKDOWN';
    secCell.font = SUBTITLE_FONT;
    secCell.fill = SECTION_FILL;
    secCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(sevStart).height = 28;

    const sevHdrRow = sevStart + 1;
    const sevHeaders = ['Severity', 'Count', '% of Total', 'Description'];
    for (let c = 0; c < sevHeaders.length; c++) {
      const cell = ws.getCell(sevHdrRow, c + 1);
      cell.value = sevHeaders[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    const sevData: [string, number, string][] = [
      ['CRITICAL', sev['CRITICAL'] || 0, 'Immediate fix — security, data loss, system stability'],
      ['HIGH', sev['HIGH'] || 0, 'Fix within 1 sprint — performance, reliability, deprecated APIs'],
      ['MEDIUM', sev['MEDIUM'] || 0, 'Plan within 1 month — best practices, maintainability'],
      ['LOW', sev['LOW'] || 0, 'Backlog — code style, minor optimizations'],
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
      ws.getCell(row, 3).value = total > 0 ? `${Math.round((cnt / total) * 100)}%` : '0%';
      ws.getCell(row, 3).alignment = CENTER_TOP;
      ws.getCell(row, 3).border = THIN_BORDER;
      ws.getCell(row, 4).value = desc;
      ws.getCell(row, 4).font = BODY_FONT;
      ws.getCell(row, 4).alignment = LEFT_TOP;
      ws.getCell(row, 4).border = THIN_BORDER;
      ws.getRow(row).height = 22;
    }

    // Category Breakdown
    const catStart = sevHdrRow + sevData.length + 2;
    ws.mergeCells(`A${catStart}:G${catStart}`);
    ws.getCell(catStart, 1).value = 'CATEGORY BREAKDOWN';
    ws.getCell(catStart, 1).font = SUBTITLE_FONT;
    ws.getCell(catStart, 1).fill = SECTION_FILL;
    ws.getCell(catStart, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(catStart).height = 28;

    const catHdrRow = catStart + 1;
    const catHeaders = ['Category', 'Total', 'Critical', 'High', 'Medium', 'Low', 'Info'];
    for (let c = 0; c < catHeaders.length; c++) {
      const cell = ws.getCell(catHdrRow, c + 1);
      cell.value = catHeaders[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    const categoryOrder = [
      'Performance', 'Code Quality', 'Security', 'SEO', 'Accessibility',
      'Architecture', 'Sling & OSGi', 'Cloud Readiness', 'Dispatcher',
      'HTL & Frontend', 'Test Coverage', 'Maintainability', 'Dependencies & Versions',
    ];

    let catRowIdx = 0;
    for (const cat of categoryOrder) {
      const items = this.findings[cat];
      if (!items || items.length === 0) continue;
      const row = catHdrRow + 1 + catRowIdx;
      ws.getCell(row, 1).value = cat;
      ws.getCell(row, 1).font = BODY_FONT_BOLD;
      ws.getCell(row, 1).border = THIN_BORDER;
      ws.getCell(row, 2).value = items.length;
      ws.getCell(row, 2).border = THIN_BORDER;
      ws.getCell(row, 2).alignment = CENTER_TOP;

      const sevNames = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
      for (let si = 0; si < sevNames.length; si++) {
        const count = items.filter((it) => it.severity === sevNames[si]).length;
        ws.getCell(row, 3 + si).value = count || '';
        ws.getCell(row, 3 + si).border = THIN_BORDER;
        ws.getCell(row, 3 + si).alignment = CENTER_TOP;
        if (count > 0) {
          ws.getCell(row, 3 + si).fill = severityFill(sevNames[si]);
          ws.getCell(row, 3 + si).font = severityFont(sevNames[si]);
        }
      }
      ws.getRow(row).height = 20;
      catRowIdx++;
    }

    // Column widths
    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 12;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 60;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 12;
    ws.getColumn(7).width = 12;

    // Technology Stack Section
    const techStart = catHdrRow + 1 + catRowIdx + 2;
    ws.mergeCells(`A${techStart}:G${techStart}`);
    ws.getCell(techStart, 1).value = 'TECHNOLOGY STACK';
    ws.getCell(techStart, 1).font = SUBTITLE_FONT;
    ws.getCell(techStart, 1).fill = SECTION_FILL;
    ws.getCell(techStart, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(techStart).height = 28;

    const ts = this.stats.techStack;
    const techData: [string, string, string][] = [
      ['Java Version', ts.javaVersion || 'Not detected', ts.javaVersion ? (parseInt(ts.javaVersion) < 17 ? '⚠️ Consider upgrading to Java 17/21 LTS' : '✅ Current LTS') : ''],
      ['AEM Version', ts.aemVersion || ts.aemSdkVersion || 'Not detected', ''],
      ['AEM Core Components', ts.coreComponentsVersion || 'Not detected', ts.coreComponentsVersion ? '' : ''],
      ['Maven Compiler Plugin', ts.mavenCompilerVersion || 'Not detected', ''],
      ['Frontend Maven Plugin', ts.frontendMavenPluginVersion || 'Not detected', ''],
      ['Frontend Framework', `${this.stats.frontendFramework}${this.stats.frontendVersion ? ' ' + this.stats.frontendVersion : ''}`, `${this.stats.frontendSrcFiles} source files`],
      ['Node.js', ts.nodeVersion || 'Not specified', ts.nodeVersion ? '' : ''],
      ['npm', ts.npmVersion || 'Not specified', ''],
    ];

    // Add key frontend deps (jQuery, React, Angular, Vue, webpack, etc.)
    const keyFrontendDeps = ['jquery', 'react', 'react-dom', '@angular/core', 'vue', 'webpack', 'vite', 'typescript', 'antd', 'bootstrap', 'lodash', 'moment', 'axios'];
    for (const dep of keyFrontendDeps) {
      if (ts.frontendDeps[dep]) {
        techData.push([dep, ts.frontendDeps[dep].replace(/[\^~]/g, ''), '']);
      }
    }

    const techHdrRow = techStart + 1;
    const techHeaders = ['Technology', 'Version', 'Status / Notes'];
    for (let c = 0; c < techHeaders.length; c++) {
      const cell = ws.getCell(techHdrRow, c + 1);
      cell.value = techHeaders[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    for (let i = 0; i < techData.length; i++) {
      const row = techHdrRow + 1 + i;
      ws.getCell(row, 1).value = techData[i][0];
      ws.getCell(row, 1).font = BODY_FONT_BOLD;
      ws.getCell(row, 1).border = THIN_BORDER;
      ws.getCell(row, 2).value = techData[i][1];
      ws.getCell(row, 2).font = BODY_FONT;
      ws.getCell(row, 2).border = THIN_BORDER;
      ws.getCell(row, 3).value = techData[i][2];
      ws.getCell(row, 3).font = BODY_FONT;
      ws.getCell(row, 3).border = THIN_BORDER;
      ws.getRow(row).height = 20;
    }
  }

  // ─── Detail Sheets ─────────────────────────────────────────────────────

  private sheetDetail(category: string, items: Finding[]): void {
    const name = category.replace(/[:\\/?\*\[\]]/g, '-').substring(0, 31);
    const ws = this.wb.addWorksheet(name, {
      properties: { tabColor: { argb: this.getCategoryColor(category) } }
    });

    // ── Row 1: Category Banner ──
    const critCount = items.filter(i => i.severity === 'CRITICAL').length;
    const highCount = items.filter(i => i.severity === 'HIGH').length;
    const medCount = items.filter(i => i.severity === 'MEDIUM').length;
    const bannerParts = [`${category}  —  ${items.length} findings`];
    if (critCount > 0) bannerParts.push(`${critCount} Critical`);
    if (highCount > 0) bannerParts.push(`${highCount} High`);
    if (medCount > 0) bannerParts.push(`${medCount} Medium`);
    const bannerText = bannerParts.join('  |  ');

    ws.mergeCells(1, 1, 1, 13);
    const bannerCell = ws.getCell(1, 1);
    bannerCell.value = bannerText;
    bannerCell.font = { name: 'Calibri', bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    bannerCell.fill = critCount > 0
      ? severityFill('CRITICAL')
      : highCount > 0
        ? severityFill('HIGH')
        : severityFill('MEDIUM');
    bannerCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // ── Row 2: Column Headers ──
    const headers = [
      '#', 'Module', 'File Path', 'Line #', 'Issue Type', 'Description',
      'Code Context', 'Severity', 'Justification',
      'Impact Analysis', 'Recommendation',
      'Expert Validation & Recommendation', 'Effort',
    ];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(2, c + 1);
      cell.value = headers[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }
    ws.getRow(2).height = 28;
    ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];

    // ── Row 3+: Data Rows ──
    for (let idx = 0; idx < items.length; idx++) {
      const r = idx + 3;
      const item = items[idx];
      ws.getRow(r).height = 32;
      ws.getCell(r, 1).value = idx + 1;
      ws.getCell(r, 1).font = BODY_FONT;
      ws.getCell(r, 1).alignment = CENTER_TOP;
      ws.getCell(r, 2).value = item.module;
      ws.getCell(r, 2).font = BODY_FONT;
      ws.getCell(r, 2).alignment = LEFT_TOP;
      ws.getCell(r, 3).value = item.file;
      ws.getCell(r, 3).font = CODE_FONT;
      ws.getCell(r, 3).alignment = LEFT_TOP;
      ws.getCell(r, 4).value = item.line;
      ws.getCell(r, 4).font = BODY_FONT;
      ws.getCell(r, 4).alignment = CENTER_TOP;
      ws.getCell(r, 5).value = item.type;
      ws.getCell(r, 5).font = BODY_FONT_BOLD;
      ws.getCell(r, 5).alignment = LEFT_TOP;
      ws.getCell(r, 6).value = item.description;
      ws.getCell(r, 6).font = BODY_FONT;
      ws.getCell(r, 6).alignment = LEFT_TOP;
      ws.getCell(r, 7).value = (item.code || '').substring(0, 500);
      ws.getCell(r, 7).font = CODE_FONT;
      ws.getCell(r, 7).alignment = LEFT_TOP;
      ws.getCell(r, 8).value = item.severity;
      ws.getCell(r, 9).value = (item.justification || '').substring(0, 500);
      ws.getCell(r, 9).font = BODY_FONT;
      ws.getCell(r, 9).alignment = LEFT_TOP;
      ws.getCell(r, 10).value = item.impact || '';
      ws.getCell(r, 10).font = BODY_FONT;
      ws.getCell(r, 10).alignment = LEFT_TOP;
      ws.getCell(r, 11).value = item.recommendation;
      ws.getCell(r, 11).font = BODY_FONT;
      ws.getCell(r, 11).alignment = LEFT_TOP;
      ws.getCell(r, 12).value = getExpertRecommendation(category, item.type, item.severity, item.effort);
      ws.getCell(r, 12).font = BODY_FONT;
      ws.getCell(r, 12).alignment = LEFT_TOP;
      ws.getCell(r, 13).value = item.effort;
      ws.getCell(r, 13).font = BODY_FONT;
      ws.getCell(r, 13).alignment = CENTER_TOP;
    }

    const mr = items.length + 2;
    colorSeverityCol(ws, 8, mr);
    applyZebraAndBorders(ws, mr, headers.length, 3);

    // Column widths
    const widths = [6, 28, 55, 8, 28, 60, 55, 12, 65, 60, 65, 75, 10];
    for (let i = 0; i < widths.length; i++) {
      ws.getColumn(i + 1).width = widths[i];
    }
  }

  // ─── Recommendations Sheet ─────────────────────────────────────────────

  private sheetRecommendations(): void {
    const ws = this.wb.addWorksheet('Top Recommendations', { properties: { tabColor: { argb: '00B050' } } });

    const headers = ['#', 'Priority', 'Category', 'Issue Type', 'Count', 'Impact', 'Recommendation', 'Effort'];
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

    // Aggregate findings by type, sort by severity and count
    const typeMap = new Map<string, { category: string; count: number; severity: string; impact: string; recommendation: string; effort: string }>();
    for (const [cat, items] of Object.entries(this.findings)) {
      for (const item of items) {
        const key = `${cat}::${item.type}`;
        if (!typeMap.has(key)) {
          typeMap.set(key, {
            category: cat, count: 0, severity: item.severity,
            impact: item.impact || '', recommendation: item.recommendation, effort: item.effort,
          });
        }
        typeMap.get(key)!.count++;
      }
    }

    // Sort by severity weight then count
    const sevWeight: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
    const sorted = [...typeMap.entries()].sort((a, b) => {
      const wa = sevWeight[a[1].severity] || 0;
      const wb = sevWeight[b[1].severity] || 0;
      if (wa !== wb) return wb - wa;
      return b[1].count - a[1].count;
    });

    // Top 50 recommendations
    const top = sorted.slice(0, 50);
    for (let idx = 0; idx < top.length; idx++) {
      const r = idx + 2;
      const [key, data] = top[idx];
      const issueType = key.split('::')[1];
      const priority = data.severity === 'CRITICAL' ? 'P0' : data.severity === 'HIGH' ? 'P1' : data.severity === 'MEDIUM' ? 'P2' : 'P3';

      ws.getRow(r).height = 28;
      ws.getCell(r, 1).value = idx + 1;
      ws.getCell(r, 2).value = priority;
      ws.getCell(r, 2).fill = severityFill(data.severity);
      ws.getCell(r, 2).font = severityFont(data.severity);
      ws.getCell(r, 2).alignment = CENTER_TOP;
      ws.getCell(r, 3).value = data.category;
      ws.getCell(r, 3).font = BODY_FONT;
      ws.getCell(r, 4).value = issueType;
      ws.getCell(r, 4).font = BODY_FONT_BOLD;
      ws.getCell(r, 5).value = data.count;
      ws.getCell(r, 5).alignment = CENTER_TOP;
      ws.getCell(r, 6).value = data.impact;
      ws.getCell(r, 6).font = BODY_FONT;
      ws.getCell(r, 6).alignment = LEFT_TOP;
      ws.getCell(r, 7).value = data.recommendation;
      ws.getCell(r, 7).font = BODY_FONT;
      ws.getCell(r, 7).alignment = LEFT_TOP;
      ws.getCell(r, 8).value = data.effort;
      ws.getCell(r, 8).alignment = CENTER_TOP;
    }

    applyZebraAndBorders(ws, top.length + 1, headers.length, 2);

    const widths = [6, 10, 20, 35, 8, 45, 65, 10];
    for (let i = 0; i < widths.length; i++) ws.getColumn(i + 1).width = widths[i];
  }

  // ─── Action Plan Sheet ─────────────────────────────────────────────────

  private sheetActionPlan(): void {
    const ws = this.wb.addWorksheet('Action Plan', { properties: { tabColor: { argb: 'FFC000' } } });

    const headers = ['Phase', 'Timeline', 'Category', 'Focus Area', 'Key Actions', 'Expected Outcome'];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(1, c + 1);
      cell.value = headers[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }
    ws.getRow(1).height = 28;

    const criticalCount = this.stats.severityCounts['CRITICAL'] || 0;
    const highCount = this.stats.severityCounts['HIGH'] || 0;
    const mediumCount = this.stats.severityCounts['MEDIUM'] || 0;

    const plan = [
      ['Phase 1', 'Week 1-2', 'Security & Critical', 'Critical Vulnerabilities',
        `Fix ${criticalCount} CRITICAL findings: resource resolver leaks, admin sessions, XSS, SSRF`,
        'Eliminate security vulnerabilities and system stability risks'],
      ['Phase 1', 'Week 1-2', 'Performance', 'Critical Performance',
        'Fix unbounded queries, thread leaks, session.save() in loops',
        'Prevent OOM errors and response time degradation'],
      ['Phase 2', 'Week 3-4', 'Code Quality', 'High Priority',
        `Address ${highCount} HIGH findings: deprecated APIs, printStackTrace, WCMUsePojo`,
        'Modernize codebase, improve debugging and log management'],
      ['Phase 2', 'Week 3-4', 'Architecture', 'AEM Best Practices',
        'Fix mutable content separation, service user mapping, Sling Model patterns',
        'Cloud-ready architecture, better maintainability'],
      ['Phase 3', 'Month 2', 'Cloud Readiness', 'Migration Prep',
        'Address cloud incompatibilities: file system access, replication API, install hooks',
        'AEMaaCS deployment readiness'],
      ['Phase 3', 'Month 2', 'SEO & Accessibility', 'Standards Compliance',
        'Fix missing meta tags, WCAG violations, semantic HTML',
        'WCAG 2.1 AA compliance, improved search rankings'],
      ['Phase 4', 'Month 3+', 'Testing & Maintainability', 'Quality Foundation',
        `Add unit tests, reduce complexity, address ${mediumCount} MEDIUM findings`,
        'Sustainable development velocity, reduced regression risk'],
    ];

    for (let i = 0; i < plan.length; i++) {
      const r = i + 2;
      ws.getRow(r).height = 36;
      for (let c = 0; c < plan[i].length; c++) {
        ws.getCell(r, c + 1).value = plan[i][c];
        ws.getCell(r, c + 1).font = BODY_FONT;
        ws.getCell(r, c + 1).alignment = LEFT_TOP;
        ws.getCell(r, c + 1).border = THIN_BORDER;
      }
      // Phase coloring
      const phase = plan[i][0];
      if (phase === 'Phase 1') ws.getCell(r, 1).fill = severityFill('CRITICAL');
      else if (phase === 'Phase 2') ws.getCell(r, 1).fill = severityFill('HIGH');
      else if (phase === 'Phase 3') ws.getCell(r, 1).fill = severityFill('MEDIUM');
      else ws.getCell(r, 1).fill = severityFill('LOW');
      ws.getCell(r, 1).font = severityFont(phase === 'Phase 1' ? 'CRITICAL' : phase === 'Phase 2' ? 'HIGH' : phase === 'Phase 3' ? 'MEDIUM' : 'LOW');
    }

    const widths = [12, 14, 22, 25, 65, 50];
    for (let i = 0; i < widths.length; i++) ws.getColumn(i + 1).width = widths[i];
  }

  // ─── Module Rollout Summary Sheet ──────────────────────────────────────

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
      'Wave 0 - Security / Critical Infrastructure': 0,
      'Wave 1 - Critical Stabilization': 1,
      'Wave 2 - Content & Experience Delivery': 2,
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

    const widths = [38, 32, 32, 10, 10, 10, 10, 10, 10, 12, 90];
    for (let i = 0; i < widths.length; i++) {
      ws.getColumn(i + 1).width = widths[i];
    }
  }

  // ─── Module Execution Plan Sheet ───────────────────────────────────────

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

  // ─── Helpers ───────────────────────────────────────────────────────────

  private moduleDomain(moduleName: string): string {
    const m = (moduleName || '').toLowerCase();
    if (['core', 'core-component', 'foundation', 'commons', 'shared', 'utils'].some((x) => m.includes(x)))
      return 'Core / Foundation / Shared';
    if (['auth', 'login', 'sso', 'saml', 'ims', 'security', 'user'].some((x) => m.includes(x)))
      return 'Authentication / Security';
    if (['search', 'solr', 'elastic', 'opensearch', 'query'].some((x) => m.includes(x)))
      return 'Search / Query';
    if (['workflow', 'dam', 'asset', 'media', 'rendition', 'metadata'].some((x) => m.includes(x)))
      return 'DAM / Assets / Workflow';
    if (['form', 'af', 'adaptive'].some((x) => m.includes(x)))
      return 'Forms / Adaptive Forms';
    if (['integration', 'api', 'servlet', 'endpoint', 'service', 'connector'].some((x) => m.includes(x)))
      return 'Integration / API / Services';
    if (['dispatcher', 'cdn', 'cache', 'varnish', 'fastly'].some((x) => m.includes(x)))
      return 'Dispatcher / CDN / Cache';
    if (['ui', 'frontend', 'clientlib', 'component', 'template', 'page'].some((x) => m.includes(x)))
      return 'Frontend / UI / Components';
    if (['config', 'osgi', 'runmode', 'cloud'].some((x) => m.includes(x)))
      return 'Configuration / OSGi / Cloud';
    if (['replication', 'publish', 'distribution', 'content'].some((x) => m.includes(x)))
      return 'Content / Replication / Distribution';
    return 'Core / Shared / Other';
  }

  private rolloutWave(domain: string, crit: number, high: number, med: number): string {
    if (crit > 0 && ['Authentication / Security', 'Integration / API / Services', 'Core / Foundation / Shared'].includes(domain))
      return 'Wave 0 - Security / Critical Infrastructure';
    if (crit > 0) return 'Wave 1 - Critical Stabilization';
    if (high > 0 && ['DAM / Assets / Workflow', 'Content / Replication / Distribution', 'Search / Query'].includes(domain))
      return 'Wave 2 - Content & Experience Delivery';
    if (high > 0) return 'Wave 3 - Technical Risk Reduction';
    if (med > 0) return 'Wave 4 - Maintainability / Performance';
    return 'Wave 5 - Low Risk Cleanup';
  }

  private deploymentCaution(domain: string, crit: number, high: number): string {
    const cautions: Record<string, string> = {
      'Authentication / Security': 'Deploy separately with SSO/SAML validation, session tests, and rollback plan. Verify dispatcher deny rules.',
      'Integration / API / Services': 'Validate API contracts, authentication tokens, timeout handling, and error responses. Test with external systems.',
      'Core / Foundation / Shared': 'High blast radius — deploy with full regression suite, monitor error logs, and have immediate rollback plan.',
      'DAM / Assets / Workflow': 'Validate asset processing workflows, rendition generation, metadata extraction, and DAM performance under load.',
      'Frontend / UI / Components': 'Validate component rendering on author/publish, clientlib loading, responsive behavior, and FPC invalidation.',
      'Dispatcher / CDN / Cache': 'Coordinate deployment window; validate cache rules, flush behavior, security filters, and publish delivery.',
      'Search / Query': 'Validate Oak index definitions, query performance, and search result relevance before/after deployment.',
      'Configuration / OSGi / Cloud': 'Validate run-mode-specific configs, OSGi service availability, and cloud environment compatibility.',
      'Content / Replication / Distribution': 'Validate content distribution, activation queues, and publish agent health after deployment.',
      'Forms / Adaptive Forms': 'Validate form submissions, prefill services, and form data model integrations end-to-end.',
    };
    if (cautions[domain]) return cautions[domain];
    if (crit || high) return 'Deploy in a controlled release with targeted functional, integration, and rollback validation.';
    return 'Can be batched with similar low-risk modules after automated tests pass.';
  }

  private getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      'Performance': 'FF6600',
      'Code Quality': '0070C0',
      'Security': 'FF0000',
      'SEO': '00B050',
      'Accessibility': '7030A0',
      'Architecture': '1F4E79',
      'Sling & OSGi': '2E75B6',
      'Cloud Readiness': '00B0F0',
      'Dispatcher': 'FFC000',
      'HTL & Frontend': '92D050',
      'Test Coverage': 'BF8F00',
      'Maintainability': '44546A',
    };
    return colors[category] || '808080';
  }
}
