/**
 * Excel Styles for EDS Audit Report
 */
import type { Fill, Font, Alignment, Borders, Worksheet } from 'exceljs';

export const SEVERITY_STYLES: Record<string, { fill: string; font: string; bold: boolean }> = {
  CRITICAL: { fill: 'FFFF0000', font: 'FFFFFFFF', bold: true },
  HIGH: { fill: 'FFFF6600', font: 'FFFFFFFF', bold: true },
  MEDIUM: { fill: 'FFFFCC00', font: 'FF000000', bold: true },
  LOW: { fill: 'FF92D050', font: 'FF000000', bold: false },
};

export const HEADER_FONT: Partial<Font> = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
export const TITLE_FONT: Partial<Font> = { name: 'Calibri', bold: true, size: 18, color: { argb: 'FF1F4E79' } };
export const BODY_FONT: Partial<Font> = { name: 'Calibri', size: 10, color: { argb: 'FF333333' } };
export const CODE_FONT: Partial<Font> = { name: 'Consolas', size: 9, color: { argb: 'FF333333' } };
export const SCORE_FONT: Partial<Font> = { name: 'Calibri', bold: true, size: 14, color: { argb: 'FF1F4E79' } };

export const HEADER_FILL: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
export const ZEBRA_FILL_1: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
export const ZEBRA_FILL_2: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FB' } };

export const WRAP_ALIGN: Partial<Alignment> = { wrapText: true, vertical: 'top' };
export const CENTER_ALIGN: Partial<Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

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

export function severityFill(sev: string): Fill {
  const s = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.LOW;
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: s.fill } };
}

export function severityFont(sev: string): Partial<Font> {
  const s = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.LOW;
  return { name: 'Calibri', bold: s.bold, size: 10, color: { argb: s.font } };
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

export function applyZebraAndBorders(ws: Worksheet, maxRow: number, colCount: number): void {
  for (let r = 2; r <= maxRow; r++) {
    const zebra = (r - 2) % 2 === 0 ? ZEBRA_FILL_1 : ZEBRA_FILL_2;
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.fill || !(cell.fill as any).fgColor) cell.fill = zebra;
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
    }
  }
}
