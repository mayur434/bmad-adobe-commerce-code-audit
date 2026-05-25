/**
 * Edge Delivery Services — Audit Engine
 * =======================================
 * Implements the AuditEngine interface for EDS (Franklin) projects.
 * Uses the shared report generators (Excel + Markdown) with EDS-specific config.
 */

import * as fs from "fs";
import * as path from "path";
import { BaseAuditEngine, FindingsMap } from "../../shared/base";
import { AuditExcelReport, ReportStats } from "../../shared/report-excel";
import { AuditMarkdownReport } from "../../shared/report-markdown";
import { edsReportConfig } from "./config";

export class EdsAuditEngine extends BaseAuditEngine {
  readonly PLATFORM_ID = "eds";
  readonly PLATFORM_NAME = "Edge Delivery Services";

  detect(projectPath: string): boolean {
    const indicators = [
      fs.existsSync(path.join(projectPath, "blocks")),
      fs.existsSync(path.join(projectPath, "scripts")),
      fs.existsSync(path.join(projectPath, "fstab.yaml")),
      fs.existsSync(path.join(projectPath, "helix-query.yaml")),
      fs.existsSync(path.join(projectPath, "paths.json")),
    ];
    return indicators.filter(Boolean).length >= 2;
  }

  scan(): FindingsMap {
    // Tier 1 scanner placeholder — to be implemented with EDS-specific scans
    // (Block structure validation, JS module analysis, CSS audit, Lighthouse checks, etc.)
    console.log(`[${this.PLATFORM_ID}] Scanning: ${this.projectRoot}`);
    return {};
  }

  async generateReport(findings: FindingsMap, outputPath: string): Promise<void> {
    const stats = this.computeStats(findings);
    const projectName = path.basename(this.projectRoot);

    // Generate Excel report
    const excelReport = new AuditExcelReport(findings, stats, projectName, this.projectRoot, edsReportConfig);
    const xlsxPath = await excelReport.generate(outputPath);
    console.log(`[${this.PLATFORM_ID}] Excel report: ${xlsxPath}`);

    // Generate Markdown report
    const mdReport = new AuditMarkdownReport(findings, stats, projectName, this.projectRoot, edsReportConfig);
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
