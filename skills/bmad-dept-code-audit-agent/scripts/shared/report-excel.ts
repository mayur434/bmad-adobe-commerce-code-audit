/**
 * Shared Audit Excel Report Generator
 * =====================================
 * Platform-agnostic Excel report generation for all audit engines.
 * Produces enterprise-grade workbooks with:
 *   1. Executive Summary
 *   2. Per-Category Detail Sheets
 *   3. BRD/Requirement Impact Map (when applicable)
 *   4. Recommendations (platform-supplied)
 *   5. Module Rollout Summary
 *   6. Module Execution Plan
 *
 * Each platform engine supplies a PlatformReportConfig with domain-specific
 * classification, recommendations, and expert validation logic.
 */

import ExcelJS from "exceljs";
import * as path from "path";
import { AuditFinding, FindingsMap } from "./base";
import {
  TITLE_FONT, SUBTITLE_FONT, HEADER_FONT, HEADER_FILL, HEADER_BORDER,
  SUMMARY_LABEL_FONT, SUMMARY_VALUE_FONT, BODY_FONT, BODY_FONT_BOLD,
  CODE_FONT, SECTION_FILL, THIN_BORDER, ZEBRA_FILL_1, ZEBRA_FILL_2,
  CENTER_ALIGN, CENTER_TOP, LEFT_TOP,
  severityFill, severityFont, styleHeaderRow,
  applyZebraAndBorders, colorSeverityCol, colorPriorityCol,
} from "./styles";

// ─── Platform Configuration Interface ─────────────────────────────────────

export interface RecommendationRow {
  area: string;
  recommendation: string;
  expectedImpact: string;
  effort: string;
  priority: string;
  details: string;
}

export interface PlatformReportConfig {
  platformName: string;
  platformId: string;

  /** Classify a module/component name into a business domain. */
  classifyDomain(moduleName: string): string;

  /** Map (domain, criticalCount, highCount, medCount) to a rollout wave label. */
  rolloutWave(domain: string, crit: number, high: number, med: number): string;

  /** Map (domain, criticalCount, highCount) to deployment caution text. */
  deploymentCaution(domain: string, crit: number, high: number): string;

  /** Platform-specific recommendations table rows. */
  recommendations: RecommendationRow[];

  /** Generate expert validation text for a finding (optional). */
  expertRecommendation?(category: string, issueType: string, severity: string, effort: string): string;

  /** Category sheet ordering (optional — default is alphabetical). */
  categoryOrder?: string[];

  /** BRD-related category names to include in the BRD Impact Map sheet. */
  brdCategories?: string[];
}

// ─── Stats Interface ──────────────────────────────────────────────────────

export interface ReportStats {
  totalFiles: number;
  totalFindings: number;
  categories: number;
  severityCounts: Record<string, number>;
  scanDuration: number;
  [key: string]: unknown;
}

// ─── Main Report Generator ────────────────────────────────────────────────

export class AuditExcelReport {
  private findings: FindingsMap;
  private stats: ReportStats;
  private projectName: string;
  private projectRoot: string;
  private config: PlatformReportConfig;
  private wb: ExcelJS.Workbook;

  constructor(
    findings: FindingsMap,
    stats: ReportStats,
    projectName: string,
    projectRoot: string,
    config: PlatformReportConfig,
  ) {
    this.findings = findings;
    this.stats = stats;
    this.projectName = projectName;
    this.projectRoot = projectRoot;
    this.config = config;
    this.wb = new ExcelJS.Workbook();
    this.wb.creator = "BMAD DEPT Code Agent";
    this.wb.created = new Date();
  }

  async generate(outputPath: string): Promise<string> {
    this.sheetExecutiveSummary();

    // Detail sheets — ordered by config or alphabetical
    const orderedCategories = this.getOrderedCategories();
    for (const category of orderedCategories) {
      const items = this.findings[category];
      if (items && items.length > 0) {
        this.sheetDetail(category, items);
      }
    }

    // BRD Impact Map (if platform defines BRD categories)
    if (this.config.brdCategories && this.config.brdCategories.length > 0) {
      this.sheetBrdRequirementImpactMap();
    }

    // Recommendations
    if (this.config.recommendations.length > 0) {
      this.sheetRecommendations();
    }

    // Module Rollout Summary
    this.sheetModuleRolloutSummary();

    // Module Execution Plan
    this.sheetModulePlan();

    const resolvedPath = outputPath.endsWith(".xlsx")
      ? outputPath
      : path.join(outputPath, `${this.projectName}-audit-report.xlsx`);

    await this.wb.xlsx.writeFile(resolvedPath);
    return resolvedPath;
  }

  // ---------- Executive Summary ----------

  private sheetExecutiveSummary(): void {
    const ws = this.wb.addWorksheet("Executive Summary", { properties: { tabColor: { argb: "1F4E79" } } });

    // Title
    ws.getCell("A1").value = `${this.config.platformName} Code Audit`;
    ws.getCell("A1").font = TITLE_FONT;
    ws.getCell("A2").value = `Project: ${this.projectName}`;
    ws.getCell("A2").font = SUBTITLE_FONT;
    ws.getCell("A3").value = `Generated: ${new Date().toISOString().split("T")[0]}`;
    ws.getCell("A3").font = BODY_FONT;
    ws.getCell("A4").value = `Root: ${this.projectRoot}`;
    ws.getCell("A4").font = BODY_FONT;

    // Metadata
    const metaStart = 6;
    const meta: [string, string | number][] = [
      ["Total Files Scanned", this.stats.totalFiles],
      ["Total Findings", this.stats.totalFindings],
      ["Categories", this.stats.categories],
      ["Scan Duration", `${this.stats.scanDuration}ms`],
    ];
    for (let i = 0; i < meta.length; i++) {
      ws.getCell(metaStart + i, 1).value = meta[i][0];
      ws.getCell(metaStart + i, 1).font = SUMMARY_LABEL_FONT;
      ws.getCell(metaStart + i, 2).value = meta[i][1];
      ws.getCell(metaStart + i, 2).font = SUMMARY_VALUE_FONT;
    }

    // Severity Breakdown
    const sevStart = metaStart + meta.length + 2;
    ws.getCell(sevStart, 1).value = "Severity Breakdown";
    ws.getCell(sevStart, 1).font = SUBTITLE_FONT;
    ws.getCell(sevStart, 1).fill = SECTION_FILL;

    const sevHeaders = ["Severity", "Count", "Percentage"];
    for (let c = 0; c < sevHeaders.length; c++) {
      const cell = ws.getCell(sevStart + 1, c + 1);
      cell.value = sevHeaders[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.border = HEADER_BORDER;
    }

    const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
    let row = sevStart + 2;
    for (const sev of severities) {
      const count = this.stats.severityCounts[sev] || 0;
      const pct = this.stats.totalFindings > 0 ? ((count / this.stats.totalFindings) * 100).toFixed(1) + "%" : "0%";
      ws.getCell(row, 1).value = sev;
      ws.getCell(row, 1).fill = severityFill(sev);
      ws.getCell(row, 1).font = severityFont(sev);
      ws.getCell(row, 2).value = count;
      ws.getCell(row, 2).font = BODY_FONT;
      ws.getCell(row, 3).value = pct;
      ws.getCell(row, 3).font = BODY_FONT;
      ws.getRow(row).height = 20;
      row++;
    }

    // Category Breakdown
    row += 2;
    ws.getCell(row, 1).value = "Category Breakdown";
    ws.getCell(row, 1).font = SUBTITLE_FONT;
    ws.getCell(row, 1).fill = SECTION_FILL;
    row++;

    const catHeaders = ["Category", "Count", ...severities];
    for (let c = 0; c < catHeaders.length; c++) {
      const cell = ws.getCell(row, c + 1);
      cell.value = catHeaders[c];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.border = HEADER_BORDER;
    }
    row++;

    const sortedCats = Object.entries(this.findings)
      .map(([cat, items]) => ({ cat, items, count: items.length }))
      .sort((a, b) => b.count - a.count);

    for (const { cat, items, count } of sortedCats) {
      ws.getCell(row, 1).value = cat;
      ws.getCell(row, 1).font = BODY_FONT_BOLD;
      ws.getCell(row, 2).value = count;
      ws.getCell(row, 2).font = BODY_FONT;
      for (let si = 0; si < severities.length; si++) {
        const sevName = severities[si];
        const sevCount = items.filter((i) => i.severity === sevName).length;
        ws.getCell(row, 3 + si).value = sevCount || "";
        if (sevCount > 0) {
          ws.getCell(row, 3 + si).font = severityFont(sevName);
        }
      }
      ws.getRow(row).height = 20;
      row++;
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

  private sheetDetail(category: string, items: AuditFinding[]): void {
    const name = category.replace(/[:\\/?\*\[\]]/g, "-").substring(0, 31);
    const ws = this.wb.addWorksheet(name);

    const headers = [
      "#", "Module", "File Path", "Line #", "Issue Type", "Description",
      "Code Context", "Severity", "Justification",
      "Impact Analysis", "Recommendation",
      "Expert Validation & Recommendation", "Effort",
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
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

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
      ws.getCell(r, 7).value = (item.code || "").substring(0, 500);
      ws.getCell(r, 7).font = CODE_FONT;
      ws.getCell(r, 8).value = item.severity;
      ws.getCell(r, 9).value = (item.justification || "").substring(0, 500);
      ws.getCell(r, 10).value = item.impact || "";
      ws.getCell(r, 11).value = item.recommendation;
      ws.getCell(r, 12).value = this.config.expertRecommendation
        ? this.config.expertRecommendation(category, item.type, item.severity, item.effort)
        : "";
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
    const brdCats = this.config.brdCategories || [];
    const brdFindings: AuditFinding[] = [];
    for (const cat of brdCats) {
      brdFindings.push(...(this.findings[cat] || []));
    }
    if (brdFindings.length === 0) return;

    const ws = this.wb.addWorksheet("BRD Requirement Impact Map", { properties: { tabColor: { argb: "0070C0" } } });

    const headers = [
      "#", "Requirement ID", "Requirement Title", "Impact Type",
      "Impacted Module", "Impacted File", "Line", "Severity",
      "Justification", "Impact Analysis", "Recommendation", "Effort",
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
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

    const reqPattern = /^\[?(REQ-\d+|BUG-\d+)\]?\s*(.*?)(?:\s*[—–-]\s*|\s*$)/;
    const reqGroups: Record<string, { title: string; items: AuditFinding[] }> = {};

    for (const item of brdFindings) {
      const desc = item.description || "";
      const m = desc.match(reqPattern);
      let reqId: string;
      let rawTitle: string;
      if (m) {
        reqId = m[1];
        rawTitle = m[2].trim();
      } else {
        reqId = "GENERAL";
        rawTitle = item.type || "";
      }
      if (!reqGroups[reqId]) reqGroups[reqId] = { title: rawTitle, items: [] };
      if (rawTitle.length > reqGroups[reqId].title.length) reqGroups[reqId].title = rawTitle;
      reqGroups[reqId].items.push(item);
    }

    const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    let row = 2;
    let seq = 0;

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
        ws.getCell(row, 9).value = (item.justification || "").substring(0, 500);
        ws.getCell(row, 10).value = (item.impact || "").substring(0, 300);
        ws.getCell(row, 11).value = (item.recommendation || "").substring(0, 300);
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
    const ws = this.wb.addWorksheet("Recommendations", { properties: { tabColor: { argb: "00B050" } } });

    const headers = ["#", "Area", "Recommendation", "Expected Impact", "Effort", "Priority", "Details"];
    for (let c = 0; c < headers.length; c++) {
      ws.getCell(1, c + 1).value = headers[c];
    }
    styleHeaderRow(ws, headers.length);

    const recs = this.config.recommendations;
    for (let idx = 0; idx < recs.length; idx++) {
      const r = idx + 2;
      ws.getCell(r, 1).value = idx + 1;
      ws.getCell(r, 2).value = recs[idx].area;
      ws.getCell(r, 3).value = recs[idx].recommendation;
      ws.getCell(r, 4).value = recs[idx].expectedImpact;
      ws.getCell(r, 5).value = recs[idx].effort;
      ws.getCell(r, 6).value = recs[idx].priority;
      ws.getCell(r, 7).value = recs[idx].details;
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
    const ws = this.wb.addWorksheet("Module Rollout Summary", { properties: { tabColor: { argb: "8064A2" } } });

    const headers = [
      "Wave", "Module", "Domain", "Total", "Critical", "High", "Medium", "Low", "Info",
      "Risk Score", "Deployment / Validation Recommendation",
    ];
    for (let c = 0; c < headers.length; c++) {
      ws.getCell(1, c + 1).value = headers[c];
    }
    styleHeaderRow(ws, headers.length);
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

    const sevWeight: Record<string, number> = { CRITICAL: 10000, HIGH: 1000, MEDIUM: 100, LOW: 10, INFO: 1 };
    const modules: Record<string, AuditFinding[]> = {};
    for (const items of Object.values(this.findings)) {
      for (const item of items) {
        const mod = item.module || "Unknown";
        if (!modules[mod]) modules[mod] = [];
        modules[mod].push(item);
      }
    }

    const rows: (string | number)[][] = [];
    for (const [mod, items] of Object.entries(modules)) {
      const counts: Record<string, number> = {};
      for (const i of items) counts[i.severity] = (counts[i.severity] || 0) + 1;
      const crit = counts["CRITICAL"] || 0;
      const high = counts["HIGH"] || 0;
      const med = counts["MEDIUM"] || 0;
      const low = counts["LOW"] || 0;
      const info = counts["INFO"] || 0;
      const score = items.reduce((s, i) => s + (sevWeight[i.severity] || 1), 0);
      const domain = this.config.classifyDomain(mod);
      const wave = this.config.rolloutWave(domain, crit, high, med);
      const caution = this.config.deploymentCaution(domain, crit, high);
      rows.push([wave, mod, domain, items.length, crit, high, med, low, info, score, caution]);
    }

    const waveOrder: Record<string, number> = {};
    rows.forEach((r) => {
      const w = String(r[0]);
      const num = parseInt(w.match(/Wave\s*(\d+)/)?.[1] ?? "99", 10);
      waveOrder[w] = num;
    });
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
    const ws = this.wb.addWorksheet("Module Execution Plan", { properties: { tabColor: { argb: "7030A0" } } });

    const headers = [
      "#", "Module", "Priority", "Category", "Severity",
      "Issue Type", "File", "Line", "Description",
      "Justification", "Impact Analysis", "Recommendation", "Effort",
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
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

    const sevWeight: Record<string, number> = { CRITICAL: 10000, HIGH: 1000, MEDIUM: 100, LOW: 10, INFO: 1 };
    const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

    const modItems: Record<string, (AuditFinding & { _category: string })[]> = {};
    const modScores: Record<string, number> = {};
    for (const [cat, items] of Object.entries(this.findings)) {
      for (const item of items) {
        const mod = item.module || "Unknown";
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
      const crit = items.filter((i) => i.severity === "CRITICAL").length;
      const high = items.filter((i) => i.severity === "HIGH").length;
      const med = items.filter((i) => i.severity === "MEDIUM").length;

      let modPriority: string;
      if (crit > 0) modPriority = "P0 — Immediate";
      else if (high > 0) modPriority = "P1 — This Sprint";
      else if (med > 0) modPriority = "P2 — Next Sprint";
      else modPriority = "P3 — Backlog";

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
        ws.getCell(row, 9).value = (item.description || "").substring(0, 200);
        ws.getCell(row, 10).value = (item.justification || "").substring(0, 500);
        ws.getCell(row, 11).value = (item.impact || "").substring(0, 300);
        ws.getCell(row, 12).value = (item.recommendation || "").substring(0, 300);
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

  // ---------- Helpers ----------

  private getOrderedCategories(): string[] {
    const allCats = Object.keys(this.findings);
    if (!this.config.categoryOrder || this.config.categoryOrder.length === 0) {
      return allCats.sort((a, b) => (this.findings[b]?.length || 0) - (this.findings[a]?.length || 0));
    }
    const ordered: string[] = [];
    for (const cat of this.config.categoryOrder) {
      if (allCats.includes(cat)) ordered.push(cat);
    }
    for (const cat of allCats) {
      if (!ordered.includes(cat)) ordered.push(cat);
    }
    return ordered;
  }
}
