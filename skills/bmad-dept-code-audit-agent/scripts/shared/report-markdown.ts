/**
 * Shared Audit Markdown Report Generator
 * ========================================
 * Produces a structured Markdown report from audit findings.
 * Usable for both Tier 1 (script) and Tier 2 (LLM) outputs.
 */

import * as fs from "fs";
import * as path from "path";
import { AuditFinding, FindingsMap } from "./base";
import { ReportStats, PlatformReportConfig } from "./report-excel";

export class AuditMarkdownReport {
  private findings: FindingsMap;
  private stats: ReportStats;
  private projectName: string;
  private projectRoot: string;
  private config: PlatformReportConfig;

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
  }

  generate(outputPath: string): string {
    const lines: string[] = [];

    this.sectionHeader(lines);
    this.sectionExecutiveSummary(lines);
    this.sectionCriticalFindings(lines);
    this.sectionHighFindings(lines);
    this.sectionMediumFindings(lines);
    this.sectionLowFindings(lines);
    this.sectionRecommendations(lines);
    this.sectionModuleSummary(lines);

    const resolvedPath = outputPath.endsWith(".md")
      ? outputPath
      : path.join(outputPath, `${this.projectName}-audit-report.md`);

    fs.writeFileSync(resolvedPath, lines.join("\n"), "utf-8");
    return resolvedPath;
  }

  // ---------- Sections ----------

  private sectionHeader(lines: string[]): void {
    lines.push(`# Code Audit Report: ${this.projectName}`);
    lines.push("");
    lines.push(`**Date**: ${new Date().toISOString().split("T")[0]}`);
    lines.push(`**Platform**: ${this.config.platformName}`);
    lines.push(`**Auditor**: BMAD DEPT Code Agent`);
    lines.push(`**Root**: ${this.projectRoot}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  private sectionExecutiveSummary(lines: string[]): void {
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(`**Total Findings**: ${this.stats.totalFindings}`);
    lines.push(`**Files Scanned**: ${this.stats.totalFiles}`);
    lines.push(`**Categories**: ${this.stats.categories}`);
    lines.push(`**Scan Duration**: ${this.stats.scanDuration}ms`);
    lines.push("");
    lines.push("| Severity | Count | % |");
    lines.push("|----------|-------|---|");
    const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
    for (const sev of severities) {
      const count = this.stats.severityCounts[sev] || 0;
      const pct = this.stats.totalFindings > 0 ? ((count / this.stats.totalFindings) * 100).toFixed(1) : "0.0";
      lines.push(`| ${sev} | ${count} | ${pct}% |`);
    }
    lines.push("");
    lines.push("### Category Breakdown");
    lines.push("");
    lines.push("| Category | Total | Critical | High | Medium | Low |");
    lines.push("|----------|-------|----------|------|--------|-----|");
    const sortedCats = Object.entries(this.findings)
      .sort(([, a], [, b]) => b.length - a.length);
    for (const [cat, items] of sortedCats) {
      const c = items.filter((i) => i.severity === "CRITICAL").length;
      const h = items.filter((i) => i.severity === "HIGH").length;
      const m = items.filter((i) => i.severity === "MEDIUM").length;
      const l = items.filter((i) => i.severity === "LOW").length;
      lines.push(`| ${cat} | ${items.length} | ${c} | ${h} | ${m} | ${l} |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  private sectionCriticalFindings(lines: string[]): void {
    this.sectionBySeverity(lines, "CRITICAL", "Critical Findings");
  }

  private sectionHighFindings(lines: string[]): void {
    this.sectionBySeverity(lines, "HIGH", "High Findings");
  }

  private sectionMediumFindings(lines: string[]): void {
    this.sectionBySeverity(lines, "MEDIUM", "Medium Findings");
  }

  private sectionLowFindings(lines: string[]): void {
    this.sectionBySeverity(lines, "LOW", "Low Findings");
  }

  private sectionBySeverity(lines: string[], severity: string, title: string): void {
    const filtered: (AuditFinding & { _category: string })[] = [];
    for (const [cat, items] of Object.entries(this.findings)) {
      for (const item of items) {
        if (item.severity === severity) {
          filtered.push({ ...item, _category: cat });
        }
      }
    }
    if (filtered.length === 0) return;

    lines.push(`## ${title}`);
    lines.push("");

    let seq = 0;
    for (const item of filtered) {
      seq++;
      lines.push(`### ${seq}. ${item.type}`);
      lines.push("");
      lines.push(`- **Category**: ${item._category}`);
      lines.push(`- **Module**: ${item.module}`);
      lines.push(`- **File**: \`${item.file}\`${item.line ? `:${item.line}` : ""}`);
      lines.push(`- **Severity**: ${item.severity}`);
      lines.push(`- **Confidence**: ${item.confidence || "N/A"}`);
      lines.push(`- **Effort**: ${item.effort}`);
      if (item.impact) lines.push(`- **Impact**: ${item.impact}`);
      lines.push("");
      lines.push(`**Description**: ${item.description}`);
      lines.push("");
      if (item.code) {
        lines.push("**Code Context**:");
        lines.push("```");
        lines.push(item.code.substring(0, 500));
        lines.push("```");
        lines.push("");
      }
      if (item.justification) {
        lines.push(`**Justification**: ${item.justification}`);
        lines.push("");
      }
      lines.push(`**Recommendation**: ${item.recommendation}`);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  private sectionRecommendations(lines: string[]): void {
    if (this.config.recommendations.length === 0) return;

    lines.push("## Platform Recommendations");
    lines.push("");
    lines.push("| # | Area | Recommendation | Impact | Effort | Priority |");
    lines.push("|---|------|---------------|--------|--------|----------|");
    for (let i = 0; i < this.config.recommendations.length; i++) {
      const r = this.config.recommendations[i];
      lines.push(`| ${i + 1} | ${r.area} | ${r.recommendation} | ${r.expectedImpact} | ${r.effort} | ${r.priority} |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  private sectionModuleSummary(lines: string[]): void {
    const modules: Record<string, AuditFinding[]> = {};
    for (const items of Object.values(this.findings)) {
      for (const item of items) {
        const mod = item.module || "Unknown";
        if (!modules[mod]) modules[mod] = [];
        modules[mod].push(item);
      }
    }
    if (Object.keys(modules).length === 0) return;

    lines.push("## Module Risk Summary");
    lines.push("");
    lines.push("| Module | Domain | Total | Critical | High | Medium | Low | Wave |");
    lines.push("|--------|--------|-------|----------|------|--------|-----|------|");

    const sevWeight: Record<string, number> = { CRITICAL: 10000, HIGH: 1000, MEDIUM: 100, LOW: 10, INFO: 1 };
    const rows: { mod: string; domain: string; total: number; c: number; h: number; m: number; l: number; wave: string; score: number }[] = [];

    for (const [mod, items] of Object.entries(modules)) {
      const c = items.filter((i) => i.severity === "CRITICAL").length;
      const h = items.filter((i) => i.severity === "HIGH").length;
      const m = items.filter((i) => i.severity === "MEDIUM").length;
      const l = items.filter((i) => i.severity === "LOW").length;
      const score = items.reduce((s, i) => s + (sevWeight[i.severity] || 1), 0);
      const domain = this.config.classifyDomain(mod);
      const wave = this.config.rolloutWave(domain, c, h, m);
      rows.push({ mod, domain, total: items.length, c, h, m, l, wave, score });
    }

    rows.sort((a, b) => b.score - a.score);
    for (const r of rows) {
      lines.push(`| ${r.mod} | ${r.domain} | ${r.total} | ${r.c} | ${r.h} | ${r.m} | ${r.l} | ${r.wave} |`);
    }
    lines.push("");
  }
}
