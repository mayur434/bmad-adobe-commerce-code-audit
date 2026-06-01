/**
 * Quick Scan Excel Report — LLM-quality output without LLM.
 * Produces the same Commerce-style format: banner rows, expert columns,
 * executive narrative, and module planning sheets.
 */
import ExcelJS from 'exceljs';
import * as path from 'path';
import { QuickFinding, QuickScanStats } from './quick-scanner';
import {
  TITLE_FONT, SUBTITLE_FONT, HEADER_FONT, HEADER_FILL, HEADER_BORDER,
  SUMMARY_LABEL_FONT, SUMMARY_VALUE_FONT, BODY_FONT, BODY_FONT_BOLD,
  CODE_FONT, SECTION_FILL, THIN_BORDER, ZEBRA_FILL_1, ZEBRA_FILL_2,
  CENTER_ALIGN, CENTER_TOP, LEFT_TOP,
  severityFill, severityFont, styleHeaderRow,
  applyZebraAndBorders, colorSeverityCol, colorPriorityCol,
} from './styles';
import {
  generateExecutiveNarrative,
  generateCategoryNarrative,
  generateTopRecommendations,
} from './narrative';

export class QuickReportGenerator {
  private findings: Map<string, QuickFinding[]>;
  private stats: QuickScanStats;
  private projectName: string;
  private projectRoot: string;
  private platform: string;
  private wb: ExcelJS.Workbook;

  constructor(findings: Map<string, QuickFinding[]>, stats: QuickScanStats, projectName: string, projectRoot: string) {
    this.findings = findings;
    this.stats = stats;
    this.projectName = projectName;
    this.projectRoot = projectRoot;
    this.platform = stats.platform === 'aemams' ? 'AEM Managed Services' :
                    stats.platform === 'aemcs' ? 'AEM as a Cloud Service' :
                    'AEM (AMS + Cloud Service)';
    this.wb = new ExcelJS.Workbook();
  }

  async generate(outputPath: string): Promise<void> {
    console.log('\n📊 Generating Quick Scan Excel Report...');

    // 1. Executive Summary
    this.sheetExecutiveSummary();

    // 2. Category detail sheets
    const sortedCategories = [...this.findings.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [category, findings] of sortedCategories) {
      this.sheetCategoryDetail(category, findings);
    }

    // 3. Top Recommendations
    this.sheetTopRecommendations();

    // 4. Module Rollout Summary
    this.sheetModuleRolloutSummary();

    // 5. Rule Coverage
    this.sheetRuleCoverage();

    await this.wb.xlsx.writeFile(outputPath);
    const sheetCount = this.wb.worksheets.length;
    console.log(`✅ Report generated: ${outputPath}`);
    console.log(`   Total Sheets: ${sheetCount}`);
    for (const ws of this.wb.worksheets) {
      console.log(`   📄 ${ws.name} (${ws.rowCount} rows)`);
    }
  }

  // ─── Executive Summary ──────────────────────────────────────────────────────

  private sheetExecutiveSummary(): void {
    const ws = this.wb.addWorksheet('Executive Summary', { properties: { tabColor: { argb: '1F4E79' } } });

    const total = this.stats.totalFindings;
    const sev = this.stats.severityCounts;

    // Title
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${this.projectName} — AEM QUICK SCAN REPORT`;
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
      ['Scan Mode:', 'Quick Scan (Rule-Pack Based, No LLM)'],
      ['Rules Evaluated:', `${this.stats.rulesEvaluated} rules`],
      ['Rules Triggered:', `${this.stats.rulesTriggered} rules`],
      ['Total Findings:', total],
      ['Files Analyzed:', `${this.stats.filesScanned} of ${this.stats.totalFiles} total`],
      ['Tokens Processed:', this.stats.tokensProcessed.toLocaleString()],
      ['Scan Duration:', `${(this.stats.scanDuration / 1000).toFixed(1)}s`],
      ['Tool:', 'AEM Quick Scan Engine v1.0 (BMAD — Rule-Pack Driven)'],
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
      ['CRITICAL', sev['Critical'] || 0, 'Fix NOW — your site is vulnerable or could crash in production'],
      ['HIGH', sev['High'] || 0, 'Fix this sprint — causes slow pages, memory leaks, or broken features'],
      ['MEDIUM', sev['Medium'] || 0, 'Plan within 2-4 weeks — makes code harder to maintain or upgrade'],
      ['LOW', sev['Low'] || 0, 'Add to backlog — code smell or minor cleanup'],
      ['INFO', sev['Info'] || 0, 'FYI — no action needed, just awareness'],
    ];

    for (let i = 0; i < sevData.length; i++) {
      const row = sevHdrRow + 1 + i;
      const [sev, count, desc] = sevData[i];
      ws.getCell(row, 1).value = sev;
      ws.getCell(row, 1).font = { ...BODY_FONT_BOLD, color: { argb: 'FFFFFFFF' } };
      ws.getCell(row, 1).fill = severityFill(sev);
      ws.getCell(row, 1).alignment = CENTER_ALIGN;
      ws.getCell(row, 2).value = count;
      ws.getCell(row, 2).font = BODY_FONT_BOLD;
      ws.getCell(row, 2).alignment = CENTER_ALIGN;
      ws.getCell(row, 3).value = total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0%';
      ws.getCell(row, 3).font = BODY_FONT;
      ws.getCell(row, 3).alignment = CENTER_ALIGN;
      ws.getCell(row, 4).value = desc;
      ws.getCell(row, 4).font = BODY_FONT;
      ws.getCell(row, 4).alignment = LEFT_TOP;
      ws.getRow(row).height = 20;
    }

    // Category Breakdown
    const catStart = sevHdrRow + 7;
    ws.mergeCells(`A${catStart}:G${catStart}`);
    ws.getCell(catStart, 1).value = 'CATEGORY BREAKDOWN';
    ws.getCell(catStart, 1).font = SUBTITLE_FONT;
    ws.getCell(catStart, 1).fill = SECTION_FILL;
    ws.getCell(catStart, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(catStart).height = 28;

    const catHdrRow = catStart + 1;
    const catHeaders = ['Category', 'Findings', 'Critical', 'High', 'Medium', 'Low'];
    for (let c = 0; c < catHeaders.length; c++) {
      const cell = ws.getCell(catHdrRow, c + 1);
      cell.value = catHeaders[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    let catRow = catHdrRow + 1;
    for (const [category, findings] of [...this.findings.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const crit = findings.filter(f => f.severity === 'Critical').length;
      const high = findings.filter(f => f.severity === 'High').length;
      const med = findings.filter(f => f.severity === 'Medium').length;
      const low = findings.filter(f => f.severity === 'Low' || f.severity === 'Info').length;

      ws.getCell(catRow, 1).value = category;
      ws.getCell(catRow, 1).font = BODY_FONT_BOLD;
      ws.getCell(catRow, 2).value = findings.length;
      ws.getCell(catRow, 2).font = BODY_FONT;
      ws.getCell(catRow, 2).alignment = CENTER_ALIGN;
      ws.getCell(catRow, 3).value = crit;
      ws.getCell(catRow, 3).font = BODY_FONT;
      ws.getCell(catRow, 3).alignment = CENTER_ALIGN;
      ws.getCell(catRow, 4).value = high;
      ws.getCell(catRow, 4).font = BODY_FONT;
      ws.getCell(catRow, 4).alignment = CENTER_ALIGN;
      ws.getCell(catRow, 5).value = med;
      ws.getCell(catRow, 5).font = BODY_FONT;
      ws.getCell(catRow, 5).alignment = CENTER_ALIGN;
      ws.getCell(catRow, 6).value = low;
      ws.getCell(catRow, 6).font = BODY_FONT;
      ws.getCell(catRow, 6).alignment = CENTER_ALIGN;

      const fill = catRow % 2 === 0 ? ZEBRA_FILL_1 : ZEBRA_FILL_2;
      for (let c = 1; c <= 6; c++) {
        ws.getCell(catRow, c).fill = fill;
        ws.getCell(catRow, c).border = THIN_BORDER;
      }
      catRow++;
    }

    // Column widths
    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 50;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 14;
  }

  // ─── Category Detail Sheet ──────────────────────────────────────────────────

  private sheetCategoryDetail(category: string, findings: QuickFinding[]): void {
    const sheetName = category.substring(0, 31); // Excel 31-char limit
    const ws = this.wb.addWorksheet(sheetName);

    // Row 1: Category banner (severity-colored)
    const critCount = findings.filter(f => f.severity === 'Critical').length;
    const highCount = findings.filter(f => f.severity === 'High').length;
    const medCount = findings.filter(f => f.severity === 'Medium').length;
    const bannerText = `${category} — ${findings.length} findings | ${critCount} Critical | ${highCount} High | ${medCount} Medium`;

    const bannerColor = critCount > 0 ? 'FFFF0000' : highCount > 0 ? 'FFFF6600' : 'FFFFCC00';
    const bannerFontColor = critCount > 0 || highCount > 0 ? 'FFFFFFFF' : 'FF000000';

    const headers = ['#', 'Rule ID', 'Module', 'File', 'Line', 'What\'s Wrong', 'Your Code', 'Priority', 'What Breaks If Not Fixed', 'How to Fix', 'Fix Time', 'False Positive Risk', 'References'];
    const colWidths = [5, 20, 14, 50, 8, 60, 50, 12, 55, 60, 10, 14, 40];

    ws.mergeCells(1, 1, 1, headers.length);
    const bannerCell = ws.getCell(1, 1);
    bannerCell.value = bannerText;
    bannerCell.font = { name: 'Calibri', bold: true, size: 12, color: { argb: bannerFontColor } };
    bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bannerColor } };
    bannerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Row 2: Column headers
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

    // Column widths
    for (let c = 0; c < colWidths.length; c++) {
      ws.getColumn(c + 1).width = colWidths[c];
    }

    // Data rows
    const sorted = [...findings].sort((a, b) => {
      const sevOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
      return (sevOrder[a.severity] || 4) - (sevOrder[b.severity] || 4);
    });

    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      const row = i + 3; // data starts at row 3
      const relPath = path.relative(this.projectRoot, f.filePath).replace(/\\/g, '/');

      ws.getCell(row, 1).value = i + 1;
      ws.getCell(row, 2).value = f.ruleId;
      ws.getCell(row, 3).value = f.module;
      ws.getCell(row, 4).value = relPath;
      ws.getCell(row, 5).value = f.lineNum;
      ws.getCell(row, 6).value = f.description;
      ws.getCell(row, 7).value = f.codeContext;
      ws.getCell(row, 8).value = f.severity;
      ws.getCell(row, 9).value = f.impact;
      ws.getCell(row, 10).value = f.recommendation;
      ws.getCell(row, 11).value = f.effort;
      ws.getCell(row, 12).value = f.falsePositiveRisk;
      ws.getCell(row, 13).value = f.references.join('\n');

      // Style
      const fill = i % 2 === 0 ? ZEBRA_FILL_1 : ZEBRA_FILL_2;
      for (let c = 1; c <= headers.length; c++) {
        const cell = ws.getCell(row, c);
        cell.font = c === 7 ? CODE_FONT : BODY_FONT;
        cell.fill = fill;
        cell.border = THIN_BORDER;
        cell.alignment = LEFT_TOP;
      }
      ws.getCell(row, 1).alignment = CENTER_ALIGN;
      ws.getCell(row, 5).alignment = CENTER_ALIGN;
      ws.getCell(row, 8).alignment = CENTER_ALIGN;
      ws.getCell(row, 11).alignment = CENTER_ALIGN;
      ws.getCell(row, 12).alignment = CENTER_ALIGN;
    }

    // Color severity column
    colorSeverityCol(ws, 8, sorted.length + 2);
  }

  // ─── Top Recommendations ────────────────────────────────────────────────────

  private sheetTopRecommendations(): void {
    const ws = this.wb.addWorksheet('Top Recommendations', { properties: { tabColor: { argb: 'FF6600' } } });
    const recommendations = generateTopRecommendations(this.findings);

    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = 'TOP 20 PRIORITIZED RECOMMENDATIONS';
    ws.getCell('A1').font = TITLE_FONT;
    ws.getRow(1).height = 32;

    const headers = ['#', 'Priority', 'Rule ID', 'Severity', 'Occurrences', 'Description & Recommendation'];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(3, c + 1);
      cell.value = headers[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    // Aggregate findings by rule
    const ruleAgg = new Map<string, { count: number; severity: string; description: string }>();
    for (const [_, findings] of this.findings) {
      for (const f of findings) {
        const existing = ruleAgg.get(f.ruleId);
        if (!existing) {
          ruleAgg.set(f.ruleId, { count: 1, severity: f.severity, description: f.description });
        } else {
          existing.count++;
        }
      }
    }

    const scored = [...ruleAgg.entries()].map(([id, data]) => {
      const sevScore = data.severity === 'Critical' ? 100 : data.severity === 'High' ? 50 : data.severity === 'Medium' ? 10 : 1;
      return { id, score: sevScore * Math.sqrt(data.count), ...data };
    }).sort((a, b) => b.score - a.score).slice(0, 20);

    for (let i = 0; i < scored.length; i++) {
      const row = i + 4;
      const item = scored[i];
      ws.getCell(row, 1).value = i + 1;
      ws.getCell(row, 2).value = `P${i < 3 ? '0' : i < 8 ? '1' : i < 15 ? '2' : '3'}`;
      ws.getCell(row, 3).value = item.id;
      ws.getCell(row, 4).value = item.severity;
      ws.getCell(row, 5).value = item.count;
      ws.getCell(row, 6).value = item.description;

      const fill = i % 2 === 0 ? ZEBRA_FILL_1 : ZEBRA_FILL_2;
      for (let c = 1; c <= 6; c++) {
        ws.getCell(row, c).font = BODY_FONT;
        ws.getCell(row, c).fill = fill;
        ws.getCell(row, c).border = THIN_BORDER;
        ws.getCell(row, c).alignment = c === 6 ? LEFT_TOP : CENTER_ALIGN;
      }
    }

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 22;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 80;

    colorSeverityCol(ws, 4, scored.length + 3);
    colorPriorityCol(ws, 2, scored.length + 3);
  }

  // ─── Module Rollout Summary ─────────────────────────────────────────────────

  private sheetModuleRolloutSummary(): void {
    const ws = this.wb.addWorksheet('Module Rollout', { properties: { tabColor: { argb: '2E75B6' } } });

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = 'MODULE-BASED ROLLOUT SUMMARY';
    ws.getCell('A1').font = TITLE_FONT;
    ws.getRow(1).height = 32;

    const headers = ['Module', 'Total Findings', 'Critical', 'High', 'Medium', 'Low', 'Rollout Wave', 'Risk Level'];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(3, c + 1);
      cell.value = headers[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    // Aggregate by module
    const moduleAgg = new Map<string, { total: number; critical: number; high: number; medium: number; low: number }>();
    for (const [_, findings] of this.findings) {
      for (const f of findings) {
        const existing = moduleAgg.get(f.module) || { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
        existing.total++;
        if (f.severity === 'Critical') existing.critical++;
        else if (f.severity === 'High') existing.high++;
        else if (f.severity === 'Medium') existing.medium++;
        else existing.low++;
        moduleAgg.set(f.module, existing);
      }
    }

    const sorted = [...moduleAgg.entries()].sort((a, b) => {
      return (b[1].critical * 100 + b[1].high * 10 + b[1].total) - (a[1].critical * 100 + a[1].high * 10 + a[1].total);
    });

    for (let i = 0; i < sorted.length; i++) {
      const row = i + 4;
      const [mod, data] = sorted[i];
      const wave = data.critical > 5 ? 'Wave 0 (Immediate)' : data.critical > 0 ? 'Wave 1' : data.high > 10 ? 'Wave 2' : 'Wave 3';
      const risk = data.critical > 5 ? 'Critical' : data.critical > 0 ? 'High' : data.high > 10 ? 'Medium' : 'Low';

      ws.getCell(row, 1).value = mod;
      ws.getCell(row, 2).value = data.total;
      ws.getCell(row, 3).value = data.critical;
      ws.getCell(row, 4).value = data.high;
      ws.getCell(row, 5).value = data.medium;
      ws.getCell(row, 6).value = data.low;
      ws.getCell(row, 7).value = wave;
      ws.getCell(row, 8).value = risk;

      const fill = i % 2 === 0 ? ZEBRA_FILL_1 : ZEBRA_FILL_2;
      for (let c = 1; c <= 8; c++) {
        ws.getCell(row, c).font = BODY_FONT;
        ws.getCell(row, c).fill = fill;
        ws.getCell(row, c).border = THIN_BORDER;
        ws.getCell(row, c).alignment = c === 1 ? LEFT_TOP : CENTER_ALIGN;
      }
    }

    for (let c = 1; c <= 8; c++) ws.getColumn(c).width = [20, 14, 10, 10, 10, 10, 20, 12][c - 1];
  }

  // ─── Rule Coverage Sheet ────────────────────────────────────────────────────

  private sheetRuleCoverage(): void {
    const ws = this.wb.addWorksheet('Rule Coverage', { properties: { tabColor: { argb: '70AD47' } } });

    ws.mergeCells('A1:E1');
    ws.getCell('A1').value = 'RULE-PACK COVERAGE ANALYSIS';
    ws.getCell('A1').font = TITLE_FONT;
    ws.getRow(1).height = 32;

    const headers = ['Rule ID', 'Category', 'Severity', 'Triggered', 'Finding Count'];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(3, c + 1);
      cell.value = headers[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = CENTER_ALIGN;
      cell.border = HEADER_BORDER;
    }

    // Collect all rule trigger counts
    const ruleStats = new Map<string, { category: string; severity: string; count: number }>();
    for (const [cat, findings] of this.findings) {
      for (const f of findings) {
        const existing = ruleStats.get(f.ruleId);
        if (!existing) {
          ruleStats.set(f.ruleId, { category: cat, severity: f.severity, count: 1 });
        } else {
          existing.count++;
        }
      }
    }

    const sorted = [...ruleStats.entries()].sort((a, b) => b[1].count - a[1].count);
    for (let i = 0; i < sorted.length; i++) {
      const row = i + 4;
      const [ruleId, data] = sorted[i];
      ws.getCell(row, 1).value = ruleId;
      ws.getCell(row, 2).value = data.category;
      ws.getCell(row, 3).value = data.severity;
      ws.getCell(row, 4).value = '✓';
      ws.getCell(row, 5).value = data.count;

      const fill = i % 2 === 0 ? ZEBRA_FILL_1 : ZEBRA_FILL_2;
      for (let c = 1; c <= 5; c++) {
        ws.getCell(row, c).font = BODY_FONT;
        ws.getCell(row, c).fill = fill;
        ws.getCell(row, c).border = THIN_BORDER;
        ws.getCell(row, c).alignment = c <= 2 ? LEFT_TOP : CENTER_ALIGN;
      }
    }

    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 20;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 10;
    ws.getColumn(5).width = 14;

    colorSeverityCol(ws, 3, sorted.length + 3);
  }
}
