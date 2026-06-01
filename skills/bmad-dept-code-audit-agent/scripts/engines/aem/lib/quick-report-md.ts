/**
 * Quick Scan Markdown Report — LLM-quality narrative output in Markdown format.
 * Generates a comprehensive, professional audit report that reads like
 * it was written by a senior AEM consultant.
 */
import * as fs from 'fs';
import * as path from 'path';
import { QuickFinding, QuickScanStats } from './quick-scanner';
import {
  generateExecutiveNarrative,
  generateCategoryNarrative,
  generateTopRecommendations,
} from './narrative';

export async function generateQuickMarkdownReport(
  findings: Map<string, QuickFinding[]>,
  stats: QuickScanStats,
  projectName: string,
  projectRoot: string,
  outputPath: string
): Promise<void> {
  const platformLabel = stats.platform === 'aemams' ? 'AEM Managed Services' :
                        stats.platform === 'aemcs' ? 'AEM as a Cloud Service' :
                        'AEM (AMS + Cloud Service)';

  const sections: string[] = [];

  // ─── Header ──────────────────────────────────────────────────────────────────

  sections.push(`# ${projectName} — AEM Quick Scan Report

> **Platform:** ${platformLabel}
> **Generated:** ${new Date().toISOString().replace('T', ' ').substring(0, 19)}
> **Scan Mode:** Rule-Pack Based Analysis (No LLM)
> **Tool:** AEM Quick Scan Engine v1.0 (BMAD)

---
`);

  // ─── Executive Summary ───────────────────────────────────────────────────────

  sections.push(generateExecutiveNarrative(stats, projectName, projectRoot));
  sections.push('\n---\n');

  // ─── Scan Metadata ───────────────────────────────────────────────────────────

  sections.push(`## Scan Metadata

| Metric | Value |
|--------|-------|
| Rules Evaluated | ${stats.rulesEvaluated} |
| Rules Triggered | ${stats.rulesTriggered} |
| Total Files | ${stats.totalFiles} |
| Files Scanned | ${stats.filesScanned} |
| Total Findings | ${stats.totalFindings.toLocaleString()} |
| Categories | ${stats.categories} |
| Tokens Processed | ${stats.tokensProcessed.toLocaleString()} |
| Duration | ${(stats.scanDuration / 1000).toFixed(1)}s |

### File Type Breakdown

| Extension | Count |
|-----------|-------|
${Object.entries(stats.fileBreakdown).sort((a, b) => b[1] - a[1]).map(([ext, count]) => `| ${ext} | ${count} |`).join('\n')}

---
`);

  // ─── Severity Overview ───────────────────────────────────────────────────────

  sections.push(`## Severity Distribution

| Severity | Count | Percentage |
|----------|-------|------------|
| Critical | ${stats.severityCounts['Critical'] || 0} | ${pct(stats.severityCounts['Critical'] || 0, stats.totalFindings)} |
| High | ${stats.severityCounts['High'] || 0} | ${pct(stats.severityCounts['High'] || 0, stats.totalFindings)} |
| Medium | ${stats.severityCounts['Medium'] || 0} | ${pct(stats.severityCounts['Medium'] || 0, stats.totalFindings)} |
| Low | ${stats.severityCounts['Low'] || 0} | ${pct(stats.severityCounts['Low'] || 0, stats.totalFindings)} |
| Info | ${stats.severityCounts['Info'] || 0} | ${pct(stats.severityCounts['Info'] || 0, stats.totalFindings)} |

---
`);

  // ─── Category Analysis ───────────────────────────────────────────────────────

  sections.push(`## Detailed Category Analysis\n`);

  const sortedCategories = [...findings.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [category, catFindings] of sortedCategories) {
    sections.push(generateCategoryNarrative(category, catFindings));
    sections.push('\n');

    // Top findings table (max 15 per category)
    const topFindings = [...catFindings]
      .sort((a, b) => {
        const sevOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
        return (sevOrder[a.severity] || 4) - (sevOrder[b.severity] || 4);
      })
      .slice(0, 15);

    sections.push(`| # | Rule ID | Priority | Module | File | Line | What's Wrong |`);
    sections.push(`|---|---------|----------|--------|------|------|--------------|`);
    for (let i = 0; i < topFindings.length; i++) {
      const f = topFindings[i];
      const relPath = path.relative(projectRoot, f.filePath).replace(/\\/g, '/');
      const shortPath = relPath.length > 50 ? '...' + relPath.slice(-47) : relPath;
      const shortDesc = f.description.length > 80 ? f.description.substring(0, 77) + '...' : f.description;
      sections.push(`| ${i + 1} | \`${f.ruleId}\` | ${f.severity} | ${f.module} | \`${shortPath}\` | ${f.lineNum} | ${shortDesc} |`);
    }
    if (catFindings.length > 15) {
      sections.push(`\n> *... and ${catFindings.length - 15} more findings in this category. See Excel report for complete list.*\n`);
    }
    sections.push('\n---\n');
  }

  // ─── Top Recommendations ─────────────────────────────────────────────────────

  sections.push(`## Top 20 Prioritized Recommendations\n`);
  const recommendations = generateTopRecommendations(findings);
  sections.push(recommendations.join('\n'));
  sections.push('\n\n---\n');

  // ─── Module Risk Matrix ──────────────────────────────────────────────────────

  sections.push(`## Module Risk Matrix\n`);
  const moduleAgg = new Map<string, { total: number; critical: number; high: number }>();
  for (const [_, catFindings] of findings) {
    for (const f of catFindings) {
      const existing = moduleAgg.get(f.module) || { total: 0, critical: 0, high: 0 };
      existing.total++;
      if (f.severity === 'Critical') existing.critical++;
      else if (f.severity === 'High') existing.high++;
      moduleAgg.set(f.module, existing);
    }
  }

  sections.push(`| Module | Total | Critical | High | Risk Level | Recommended Wave |`);
  sections.push(`|--------|-------|----------|------|------------|-----------------|`);
  const sortedModules = [...moduleAgg.entries()].sort((a, b) => (b[1].critical * 100 + b[1].high) - (a[1].critical * 100 + a[1].high));
  for (const [mod, data] of sortedModules) {
    const risk = data.critical > 5 ? '🔴 Critical' : data.critical > 0 ? '🟠 High' : data.high > 10 ? '🟡 Medium' : '🟢 Low';
    const wave = data.critical > 5 ? 'Wave 0' : data.critical > 0 ? 'Wave 1' : data.high > 10 ? 'Wave 2' : 'Wave 3';
    sections.push(`| ${mod} | ${data.total} | ${data.critical} | ${data.high} | ${risk} | ${wave} |`);
  }
  sections.push('\n---\n');

  // ─── Conclusion ──────────────────────────────────────────────────────────────

  sections.push(`## Conclusion

This report was generated by the **AEM Quick Scan Engine** using deterministic rule-pack analysis. All ${stats.rulesEvaluated} rules from the ${platformLabel} rule pack were evaluated against the project codebase.

**Key Takeaways:**
- ${stats.rulesTriggered} of ${stats.rulesEvaluated} rules triggered, indicating ${Math.round(stats.rulesTriggered / stats.rulesEvaluated * 100)}% rule activation rate
- The analysis processed ${stats.tokensProcessed.toLocaleString()} tokens across ${stats.filesScanned} files in ${(stats.scanDuration / 1000).toFixed(1)} seconds
- ${stats.severityCounts['Critical'] || 0} critical issues require immediate attention before next deployment

**Next Steps:**
1. Review critical findings with the development team
2. Create JIRA tickets for all Critical and High findings
3. Schedule a remediation sprint for Wave 0 items
4. Integrate quick-scan into the CI/CD pipeline for regression prevention

---

*Report generated by BMAD AEM Quick Scan Engine v1.0 — Rule-Pack Driven Analysis*
*No LLM or external API was used in generating this report.*
`);

  // Write file
  const output = sections.join('\n');
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`📝 Markdown report: ${outputPath}`);
}

function pct(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${((count / total) * 100).toFixed(1)}%`;
}
