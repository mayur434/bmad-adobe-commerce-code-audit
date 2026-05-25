/**
 * EDS + Commerce Hybrid — Audit Engine
 * ======================================
 * Implements the AuditEngine interface for EDS projects with Commerce integration.
 * Uses the shared report generators (Excel + Markdown) with EDS-Commerce config.
 */

import * as fs from "fs";
import * as path from "path";
import { BaseAuditEngine, FindingsMap } from "../../shared/base";
import { AuditExcelReport, ReportStats } from "../../shared/report-excel";
import { AuditMarkdownReport } from "../../shared/report-markdown";
import { edsCommerceReportConfig } from "./config";

export class EdsCommerceAuditEngine extends BaseAuditEngine {
  readonly PLATFORM_ID = "eds-commerce";
  readonly PLATFORM_NAME = "Edge Delivery Services + Commerce";

  detect(projectPath: string): boolean {
    // Must be EDS first
    const edsIndicators = [
      fs.existsSync(path.join(projectPath, "blocks")),
      fs.existsSync(path.join(projectPath, "scripts")),
      fs.existsSync(path.join(projectPath, "fstab.yaml")),
      fs.existsSync(path.join(projectPath, "helix-query.yaml")),
      fs.existsSync(path.join(projectPath, "paths.json")),
    ];
    if (edsIndicators.filter(Boolean).length < 2) return false;

    // Check for Commerce-specific blocks/patterns
    const blocksDir = path.join(projectPath, "blocks");
    if (fs.existsSync(blocksDir)) {
      const items = fs.readdirSync(blocksDir);
      for (const item of items) {
        if (item.startsWith("commerce-") || item.startsWith("product-")) {
          return true;
        }
      }
    }
    return false;
  }

  scan(): FindingsMap {
    // Tier 1 scanner placeholder — to be implemented with EDS-Commerce scans
    // (Commerce block validation, API integration checks, dropin analysis, etc.)
    console.log(`[${this.PLATFORM_ID}] Scanning: ${this.projectRoot}`);
    return {};
  }

  async generateReport(findings: FindingsMap, outputPath: string): Promise<void> {
    const stats = this.computeStats(findings);
    const projectName = path.basename(this.projectRoot);

    // Generate Excel report
    const excelReport = new AuditExcelReport(findings, stats, projectName, this.projectRoot, edsCommerceReportConfig);
    const xlsxPath = await excelReport.generate(outputPath);
    console.log(`[${this.PLATFORM_ID}] Excel report: ${xlsxPath}`);

    // Generate Markdown report
    const mdReport = new AuditMarkdownReport(findings, stats, projectName, this.projectRoot, edsCommerceReportConfig);
    const mdPath = mdReport.generate(outputPath);
    console.log(`[${this.PLATFORM_ID}] Markdown report: ${mdPath}`);
  }

  private computeStats(findings: FindingsMap): ReportStats {
    let totalFindings = 0;
    const severityCounts: Record<string, number> = {};
    for (const items of Object.values(findings)) {
      totalFindings += items.length;
      for (const item of items) {
        severityCounts[item.severity] = (severityCounts[item.severity] || 0) + 1;
      }
    }
    return {
      totalFiles: 0,
      totalFindings,
      categories: Object.keys(findings).length,
      severityCounts,
      scanDuration: 0,
    };
  }
}
