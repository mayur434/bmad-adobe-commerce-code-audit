/**
 * Excel Styles for AEM Audit Report
 * Shared styling constants and utility functions.
 */
import type { Fill, Font, Alignment, Borders, Worksheet } from "exceljs";

// ─── SEVERITY STYLES ─────────────────────────────────────────────────────────
export const SEVERITY_STYLES: Record<string, { fill: string; font: string; bold: boolean }> = {
  CRITICAL: { fill: "FFFF0000", font: "FFFFFFFF", bold: true },
  HIGH: { fill: "FFFF6600", font: "FFFFFFFF", bold: true },
  MEDIUM: { fill: "FFFFCC00", font: "FF000000", bold: true },
  LOW: { fill: "FF92D050", font: "FF000000", bold: false },
  INFO: { fill: "FFBDD7EE", font: "FF000000", bold: false },
};

// ─── FONTS ───────────────────────────────────────────────────────────────────
export const HEADER_FONT: Partial<Font> = { name: "Calibri", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
export const TITLE_FONT: Partial<Font> = { name: "Calibri", bold: true, size: 18, color: { argb: "FF1F4E79" } };
export const SUBTITLE_FONT: Partial<Font> = { name: "Calibri", bold: true, size: 13, color: { argb: "FF2E75B6" } };
export const BODY_FONT: Partial<Font> = { name: "Calibri", size: 10, color: { argb: "FF333333" } };
export const BODY_FONT_BOLD: Partial<Font> = { name: "Calibri", bold: true, size: 10, color: { argb: "FF333333" } };
export const CODE_FONT: Partial<Font> = { name: "Consolas", size: 9, color: { argb: "FF333333" } };
export const SUMMARY_LABEL_FONT: Partial<Font> = { name: "Calibri", bold: true, size: 11, color: { argb: "FF44546A" } };
export const SUMMARY_VALUE_FONT: Partial<Font> = { name: "Calibri", size: 11, color: { argb: "FF333333" } };

// ─── FILLS ───────────────────────────────────────────────────────────────────
export const HEADER_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
export const ZEBRA_FILL_1: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
export const ZEBRA_FILL_2: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F7FB" } };
export const SECTION_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6E4F0" } };

// ─── ALIGNMENTS ──────────────────────────────────────────────────────────────
export const CENTER_ALIGN: Partial<Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
export const CENTER_TOP: Partial<Alignment> = { horizontal: "center", vertical: "top" };
export const LEFT_TOP: Partial<Alignment> = { horizontal: "left", vertical: "top", wrapText: true };

// ─── BORDERS ─────────────────────────────────────────────────────────────────
export const THIN_BORDER: Partial<Borders> = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
};
export const HEADER_BORDER: Partial<Borders> = {
  top: { style: 'thin', color: { argb: 'FF16365C' } },
  bottom: { style: 'thin', color: { argb: 'FF16365C' } },
  left: { style: 'thin', color: { argb: 'FF16365C' } },
  right: { style: 'thin', color: { argb: 'FF16365C' } },
};

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────
export function severityFill(sev: string): Fill {
  const s = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.INFO;
  return { type: "pattern", pattern: "solid", fgColor: { argb: s.fill } };
}

export function severityFont(sev: string): Partial<Font> {
  const s = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.INFO;
  return { name: "Calibri", bold: s.bold, size: 10, color: { argb: s.font } };
}

export function styleHeaderRow(ws: Worksheet, colCount: number): void {
  const row = ws.getRow(1);
  row.height = 28;
  for (let c = 1; c <= colCount; c++) {
    const cell = ws.getCell(1, c);
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = HEADER_BORDER;
  }
}

export function applyZebraAndBorders(ws: Worksheet, maxRow: number, colCount: number, dataStart = 2): void {
  for (let r = dataStart; r <= maxRow; r++) {
    const zebra = (r - dataStart) % 2 === 0 ? ZEBRA_FILL_1 : ZEBRA_FILL_2;
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.fill || (cell.fill as any).fgColor === undefined) {
        cell.fill = zebra;
      }
      cell.border = THIN_BORDER;
    }
  }
}

export function colorSeverityCol(ws: Worksheet, col: number, maxRow: number): void {
  for (let r = 2; r <= maxRow; r++) {
    const cell = ws.getCell(r, col);
    const val = String(cell.value || '').toUpperCase();
    if (SEVERITY_STYLES[val]) {
      cell.fill = severityFill(val);
      cell.font = severityFont(val);
      cell.alignment = CENTER_TOP;
    }
  }
}

export function colorPriorityCol(ws: Worksheet, col: number, maxRow: number): void {
  const priorityColors: Record<string, string> = {
    'P0': 'FFFF0000', 'P1': 'FFFF6600', 'P2': 'FFFFCC00',
    'P3': 'FF92D050', 'P4': 'FFBDD7EE',
    'Wave 0': 'FFFF0000', 'Wave 1': 'FFFF6600', 'Wave 2': 'FFFFCC00',
    'Wave 3': 'FF92D050', 'Wave 4': 'FFBDD7EE', 'Wave 5': 'FFD9D9D9',
    'P0 —': 'FFFF0000', 'P1 —': 'FFFF6600', 'P2 —': 'FFFFCC00', 'P3 —': 'FF92D050',
  };
  for (let r = 2; r <= maxRow; r++) {
    const cell = ws.getCell(r, col);
    const val = String(cell.value || '');
    for (const [prefix, color] of Object.entries(priorityColors)) {
      if (val.startsWith(prefix)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: color === 'FFFFCC00' ? 'FF000000' : 'FFFFFFFF' } };
        break;
      }
    }
  }
}
