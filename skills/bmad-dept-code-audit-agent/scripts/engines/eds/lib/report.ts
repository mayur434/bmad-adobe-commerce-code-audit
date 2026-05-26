/**
 * EDS Audit Report Generator — creates a styled Excel workbook with 13 sheets.
 */
import ExcelJS from 'exceljs';
import * as path from 'path';
import { AuditResult, CategoryResult, Finding, PageSpeedSummary, FileScoreSummary } from './types';
import {
  TITLE_FONT, BODY_FONT, CODE_FONT, SCORE_FONT,
  styleHeaderRow, applyZebraAndBorders, colorSeverityCol,
  HEADER_FILL, HEADER_FONT, CENTER_ALIGN, WRAP_ALIGN,
  THIN_BORDER, HEADER_BORDER,
} from './styles';

export async function generateReport(result: AuditResult, outputPath: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BMAD EDS Audit Engine';
  wb.created = new Date();

  // Summary sheet first
  addSummarySheet(wb, result);

  // PageSpeed Scores sheet (if available)
  if (result.pageSpeedResults && result.pageSpeedResults.length > 0) {
    addPageSpeedSheet(wb, result.pageSpeedResults);
  }

  // Low Score Files sheet (if available)
  if (result.lowScoreFiles && result.lowScoreFiles.length > 0) {
    addLowScoreFilesSheet(wb, result.lowScoreFiles);
  }

  // Category sheets
  for (const cat of result.categories) {
    addCategorySheet(wb, cat);
  }

  const filePath = path.resolve(outputPath);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

function addSummarySheet(wb: ExcelJS.Workbook, result: AuditResult): void {
  const ws = wb.addWorksheet('Summary');

  // Title row
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `EDS Audit Report — ${result.projectName}`;
  titleCell.font = TITLE_FONT;
  ws.getRow(1).height = 30;

  // Metadata
  ws.getCell('A3').value = 'Date:';
  ws.getCell('B3').value = result.timestamp;
  ws.getCell('A4').value = 'Source:';
  ws.getCell('B4').value = result.source;
  ws.getCell('A5').value = 'Files Scanned:';
  ws.getCell('B5').value = result.filesScanned;
  ws.getCell('A6').value = 'Total Findings:';
  ws.getCell('B6').value = result.totalFindings;

  // Overall score
  ws.getCell('A8').value = 'Overall Score:';
  ws.getCell('A8').font = SCORE_FONT;
  ws.getCell('B8').value = `${result.overallScore} / 100`;
  ws.getCell('B8').font = SCORE_FONT;

  // Severity breakdown
  ws.getCell('A10').value = 'Severity Breakdown';
  ws.getCell('A10').font = { name: 'Calibri', bold: true, size: 12 };
  ws.getCell('A11').value = 'CRITICAL';
  ws.getCell('B11').value = result.severityBreakdown.CRITICAL;
  ws.getCell('A12').value = 'HIGH';
  ws.getCell('B12').value = result.severityBreakdown.HIGH;
  ws.getCell('A13').value = 'MEDIUM';
  ws.getCell('B13').value = result.severityBreakdown.MEDIUM;
  ws.getCell('A14').value = 'LOW';
  ws.getCell('B14').value = result.severityBreakdown.LOW;

  // Category scores table
  ws.getCell('A16').value = 'Category Scores';
  ws.getCell('A16').font = { name: 'Calibri', bold: true, size: 12 };

  const headers = ['Category', 'Findings', 'Critical', 'High', 'Medium', 'Low', 'Score'];
  const headerRow = 17;
  headers.forEach((h, idx) => {
    const cell = ws.getCell(headerRow, idx + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = HEADER_BORDER;
  });

  let row = headerRow + 1;
  for (const cat of result.categories) {
    ws.getCell(row, 1).value = cat.category;
    ws.getCell(row, 2).value = cat.findings.length;
    ws.getCell(row, 3).value = cat.findings.filter((f) => f.severity === 'CRITICAL').length;
    ws.getCell(row, 4).value = cat.findings.filter((f) => f.severity === 'HIGH').length;
    ws.getCell(row, 5).value = cat.findings.filter((f) => f.severity === 'MEDIUM').length;
    ws.getCell(row, 6).value = cat.findings.filter((f) => f.severity === 'LOW').length;
    ws.getCell(row, 7).value = cat.score;
    row++;
  }

  applyZebraAndBorders(ws, row - 1, 7);

  // Column widths
  ws.columns = [
    { width: 22 }, { width: 30 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 },
  ];
}

function addCategorySheet(wb: ExcelJS.Workbook, cat: CategoryResult): void {
  // Truncate sheet name to 31 chars (Excel limit)
  const sheetName = cat.category.substring(0, 31);
  const ws = wb.addWorksheet(sheetName);

  const headers = ['Rule ID', 'Severity', 'File', 'Line', 'Description', 'Code Evidence', 'Recommendation', 'Score'];
  headers.forEach((h, idx) => {
    ws.getCell(1, idx + 1).value = h;
  });
  styleHeaderRow(ws, headers.length);

  let row = 2;
  for (const finding of cat.findings) {
    ws.getCell(row, 1).value = finding.rule;
    ws.getCell(row, 2).value = finding.severity;
    ws.getCell(row, 3).value = finding.file || '';
    ws.getCell(row, 4).value = finding.line || '';
    ws.getCell(row, 5).value = finding.description;
    ws.getCell(row, 5).alignment = WRAP_ALIGN;
    ws.getCell(row, 6).value = finding.code || '';
    ws.getCell(row, 6).font = CODE_FONT;
    ws.getCell(row, 6).alignment = WRAP_ALIGN;
    ws.getCell(row, 7).value = finding.recommendation;
    ws.getCell(row, 7).alignment = WRAP_ALIGN;
    ws.getCell(row, 8).value = finding.score;
    row++;
  }

  // If no findings, add a "pass" row
  if (cat.findings.length === 0) {
    ws.getCell(2, 1).value = '—';
    ws.getCell(2, 5).value = 'All checks passed. No issues found.';
    ws.getCell(2, 5).font = { name: 'Calibri', size: 10, color: { argb: 'FF006600' } };
    row = 3;
  }

  colorSeverityCol(ws, 2, row - 1);
  applyZebraAndBorders(ws, row - 1, headers.length);

  // Column widths
  ws.columns = [
    { width: 14 }, { width: 10 }, { width: 32 }, { width: 6 },
    { width: 45 }, { width: 40 }, { width: 50 }, { width: 6 },
  ];
}

function addPageSpeedSheet(wb: ExcelJS.Workbook, results: PageSpeedSummary[]): void {
  const ws = wb.addWorksheet('PageSpeed Scores');

  // Title
  ws.mergeCells('A1:J1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'PageSpeed Insights — Per-Page Scores';
  titleCell.font = { name: 'Calibri', bold: true, size: 14 };
  ws.getRow(1).height = 25;

  const headers = ['Page URL', 'Strategy', 'Score', 'LCP (s)', 'CLS', 'INP (ms)', 'FCP (s)', 'TTFB (ms)', 'TBT (ms)', 'Top Opportunity', 'Status'];
  const headerRow = 3;
  headers.forEach((h, idx) => {
    const cell = ws.getCell(headerRow, idx + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = HEADER_BORDER;
  });

  let row = headerRow + 1;
  for (const r of results) {
    ws.getCell(row, 1).value = r.url;
    ws.getCell(row, 2).value = r.strategy;
    ws.getCell(row, 3).value = r.score;
    ws.getCell(row, 4).value = (r.lcp / 1000).toFixed(1);
    ws.getCell(row, 5).value = r.cls.toFixed(3);
    ws.getCell(row, 6).value = r.inp;
    ws.getCell(row, 7).value = (r.fcp / 1000).toFixed(1);
    ws.getCell(row, 8).value = r.ttfb;
    ws.getCell(row, 9).value = r.tbt;
    ws.getCell(row, 10).value = r.topOpportunity;
    ws.getCell(row, 11).value = r.status;

    // Color-code the score cell
    const scoreCell = ws.getCell(row, 3);
    if (r.score >= 90) {
      scoreCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF006600' } };
    } else if (r.score >= 50) {
      scoreCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC6600' } };
    } else {
      scoreCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC0000' } };
    }

    // Color-code the status cell
    const statusCell = ws.getCell(row, 11);
    if (r.status === 'PASS') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF006600' } };
    } else if (r.status === 'NEEDS_WORK') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC6600' } };
    } else {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC0000' } };
    }

    row++;
  }

  applyZebraAndBorders(ws, row - 1, headers.length);

  // Thresholds reference
  row += 2;
  ws.getCell(row, 1).value = 'Core Web Vitals Thresholds:';
  ws.getCell(row, 1).font = { name: 'Calibri', bold: true, size: 10 };
  row++;
  ws.getCell(row, 1).value = '  LCP < 2.5s | CLS < 0.1 | INP < 200ms | FCP < 1.8s | TTFB < 800ms | TBT < 200ms';
  ws.getCell(row, 1).font = { name: 'Consolas', size: 9 };

  ws.columns = [
    { width: 45 }, { width: 10 }, { width: 7 }, { width: 8 },
    { width: 7 }, { width: 9 }, { width: 8 }, { width: 10 },
    { width: 9 }, { width: 35 }, { width: 12 },
  ];
}

function addLowScoreFilesSheet(wb: ExcelJS.Workbook, files: FileScoreSummary[]): void {
  const ws = wb.addWorksheet('Low Score Files');

  // Title
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Files Scoring Below 90 — Priority Fix List';
  titleCell.font = { name: 'Calibri', bold: true, size: 14 };
  ws.getRow(1).height = 25;

  const headers = ['File', 'Score', 'Critical', 'High', 'Medium', 'Low', 'Top Issue', 'Recommendation'];
  const headerRow = 3;
  headers.forEach((h, idx) => {
    const cell = ws.getCell(headerRow, idx + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = HEADER_BORDER;
  });

  let row = headerRow + 1;
  for (const f of files) {
    ws.getCell(row, 1).value = f.file;
    ws.getCell(row, 2).value = f.score;
    ws.getCell(row, 3).value = f.critical;
    ws.getCell(row, 4).value = f.high;
    ws.getCell(row, 5).value = f.medium;
    ws.getCell(row, 6).value = f.low;
    ws.getCell(row, 7).value = f.topIssue;
    ws.getCell(row, 7).alignment = WRAP_ALIGN;
    ws.getCell(row, 8).value = f.recommendation;
    ws.getCell(row, 8).alignment = WRAP_ALIGN;

    // Color-code score
    const scoreCell = ws.getCell(row, 2);
    if (f.score < 50) {
      scoreCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC0000' } };
    } else if (f.score < 75) {
      scoreCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC6600' } };
    } else {
      scoreCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF996600' } };
    }

    row++;
  }

  applyZebraAndBorders(ws, row - 1, headers.length);

  ws.columns = [
    { width: 38 }, { width: 7 }, { width: 8 }, { width: 6 },
    { width: 8 }, { width: 5 }, { width: 50 }, { width: 55 },
  ];
}
