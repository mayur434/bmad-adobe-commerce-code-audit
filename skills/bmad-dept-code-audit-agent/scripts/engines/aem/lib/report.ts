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
  applyZebraAndBorders, colorSeverityCol,
} from './styles';

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
    ];

    for (const cat of categoryOrder) {
      if (this.findings[cat] && this.findings[cat].length > 0) {
        this.sheetDetail(cat, this.findings[cat]);
      }
    }

    // 3. Recommendations summary
    this.sheetRecommendations();

    // 4. Action Plan
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
    const sevStart = 12;
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
      'HTL & Frontend', 'Test Coverage', 'Maintainability',
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
  }

  // ─── Detail Sheets ─────────────────────────────────────────────────────

  private sheetDetail(category: string, items: Finding[]): void {
    const name = category.replace(/[:\\/?\*\[\]]/g, '-').substring(0, 31);
    const ws = this.wb.addWorksheet(name, {
      properties: { tabColor: { argb: this.getCategoryColor(category) } }
    });

    const headers = [
      '#', 'Module', 'File Path', 'Line #', 'Issue Type', 'Description',
      'Code Context', 'Severity', 'Justification',
      'Impact Analysis', 'Recommendation', 'Effort',
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
      ws.getCell(r, 9).value = item.justification || item.impact || '';
      ws.getCell(r, 9).font = BODY_FONT;
      ws.getCell(r, 9).alignment = LEFT_TOP;
      ws.getCell(r, 10).value = item.impact || '';
      ws.getCell(r, 10).font = BODY_FONT;
      ws.getCell(r, 10).alignment = LEFT_TOP;
      ws.getCell(r, 11).value = item.recommendation;
      ws.getCell(r, 11).font = BODY_FONT;
      ws.getCell(r, 11).alignment = LEFT_TOP;
      ws.getCell(r, 12).value = item.effort;
      ws.getCell(r, 12).font = BODY_FONT;
      ws.getCell(r, 12).alignment = CENTER_TOP;
    }

    const mr = items.length + 1;
    colorSeverityCol(ws, 8, mr);
    applyZebraAndBorders(ws, mr, headers.length, 2);

    // Column widths
    const widths = [6, 18, 55, 8, 30, 55, 50, 12, 50, 45, 60, 10];
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

  // ─── Helpers ───────────────────────────────────────────────────────────

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
