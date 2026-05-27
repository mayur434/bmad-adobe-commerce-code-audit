/**
 * AEM Code Audit — Markdown Report Generator
 * Generates a comprehensive Markdown report from Tier 1 scan findings.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FindingsMap, StatsMap, Finding } from './scanner/types';

const CATEGORY_ORDER = [
  'Performance', 'Code Quality', 'Security', 'SEO', 'Accessibility',
  'Architecture', 'Sling & OSGi', 'Cloud Readiness', 'Dispatcher',
  'HTL & Frontend', 'Test Coverage', 'Maintainability', 'Dependencies & Versions',
];

export async function generateMarkdownReport(
  findings: FindingsMap,
  stats: StatsMap,
  projectName: string,
  projectRoot: string,
  platform: string,
  outputPath: string,
): Promise<void> {
  console.log('\n📝 Generating AEM Audit Markdown Report...');

  const lines: string[] = [];
  const nl = () => lines.push('');

  // Title
  lines.push(`# ${projectName} — AEM Code Audit Report`);
  nl();
  lines.push(`**Platform:** ${platform}  `);
  lines.push(`**Generated:** ${new Date().toISOString().replace('T', ' ').substring(0, 19)}  `);
  lines.push(`**Project Root:** \`${projectRoot}\`  `);
  lines.push(`**Tool:** AEM Code Audit Engine v1.0 (BMAD)  `);
  nl();

  // Executive Summary
  lines.push('---');
  lines.push('## Executive Summary');
  nl();
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Files Analyzed | ${stats.totalFiles} |`);
  lines.push(`| Java Files | ${stats.javaFiles} |`);
  lines.push(`| XML Files | ${stats.xmlFiles} |`);
  lines.push(`| HTL Files | ${stats.htlFiles} |`);
  lines.push(`| JS Files | ${stats.jsFiles} |`);
  lines.push(`| CSS Files | ${stats.cssFiles} |`);
  lines.push(`| Frontend Framework | ${stats.frontendFramework}${stats.frontendVersion ? ' ' + stats.frontendVersion : ''} |`);
  lines.push(`| Total Findings | **${stats.totalFindings}** |`);
  lines.push(`| Categories | ${stats.categories} |`);
  lines.push(`| Scan Duration | ${(stats.scanDuration / 1000).toFixed(1)}s |`);
  nl();

  // Severity Breakdown
  lines.push('### Severity Distribution');
  nl();
  lines.push('| Severity | Count | % |');
  lines.push('|----------|------:|---:|');
  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
    const count = stats.severityCounts[sev] || 0;
    if (count > 0) {
      const pct = ((count / stats.totalFindings) * 100).toFixed(1);
      lines.push(`| ${sev} | ${count} | ${pct}% |`);
    }
  }
  nl();

  // Tech Stack
  lines.push('### Tech Stack');
  nl();
  lines.push('| Component | Version |');
  lines.push('|-----------|---------|');
  if (stats.techStack.javaVersion) lines.push(`| Java | ${stats.techStack.javaVersion} |`);
  if (stats.techStack.aemVersion) lines.push(`| AEM | ${stats.techStack.aemVersion} |`);
  if (stats.techStack.aemSdkVersion) lines.push(`| AEM SDK | ${stats.techStack.aemSdkVersion} |`);
  if (stats.techStack.coreComponentsVersion) lines.push(`| Core Components | ${stats.techStack.coreComponentsVersion} |`);
  if (stats.techStack.nodeVersion) lines.push(`| Node.js | ${stats.techStack.nodeVersion} |`);
  nl();

  // Category Summary
  lines.push('---');
  lines.push('## Category Summary');
  nl();
  lines.push('| Category | Findings | Critical | High | Medium | Low |');
  lines.push('|----------|:--------:|:--------:|:----:|:------:|:---:|');
  for (const cat of CATEGORY_ORDER) {
    const items = findings[cat];
    if (!items || items.length === 0) continue;
    const crit = items.filter(f => f.severity === 'CRITICAL').length;
    const high = items.filter(f => f.severity === 'HIGH').length;
    const med = items.filter(f => f.severity === 'MEDIUM').length;
    const low = items.filter(f => f.severity === 'LOW').length;
    lines.push(`| ${cat} | ${items.length} | ${crit || '-'} | ${high || '-'} | ${med || '-'} | ${low || '-'} |`);
  }
  nl();

  // Detailed Findings by Category
  lines.push('---');
  lines.push('## Detailed Findings');
  nl();

  for (const cat of CATEGORY_ORDER) {
    const items = findings[cat];
    if (!items || items.length === 0) continue;

    lines.push(`### ${cat} (${items.length} findings)`);
    nl();

    // Group by severity for readability
    const bySeverity = groupBySeverity(items);

    for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
      const sevItems = bySeverity[sev];
      if (!sevItems || sevItems.length === 0) continue;

      lines.push(`#### ${sev} (${sevItems.length})`);
      nl();

      // Show up to 25 items per severity, then summarize
      const showItems = sevItems.slice(0, 25);
      const remaining = sevItems.length - showItems.length;

      lines.push('| # | File | Issue | Recommendation |');
      lines.push('|---|------|-------|----------------|');

      for (let i = 0; i < showItems.length; i++) {
        const f = showItems[i];
        const relFile = makeRelative(f.file, projectRoot);
        const fileLine = f.line > 0 ? `${relFile}:${f.line}` : relFile;
        const issue = escapeMd(f.type);
        const rec = escapeMd(truncate(f.recommendation, 100));
        lines.push(`| ${i + 1} | \`${fileLine}\` | ${issue} | ${rec} |`);
      }

      if (remaining > 0) {
        lines.push(`| ... | | *+${remaining} more ${sev} findings* | |`);
      }
      nl();
    }
  }

  // Top Recommendations
  lines.push('---');
  lines.push('## Top Recommendations');
  nl();

  const topRecs = getTopRecommendations(findings);
  lines.push('| # | Category | Issue Type | Count | Severity | Recommendation |');
  lines.push('|---|----------|-----------|:-----:|----------|----------------|');
  for (let i = 0; i < topRecs.length; i++) {
    const r = topRecs[i];
    lines.push(`| ${i + 1} | ${r.category} | ${escapeMd(r.type)} | ${r.count} | ${r.severity} | ${escapeMd(truncate(r.recommendation, 80))} |`);
  }
  nl();

  // Action Plan
  lines.push('---');
  lines.push('## Action Plan');
  nl();

  const plan = generateActionPlan(findings, stats);
  lines.push('| Phase | Focus Area | Key Actions | Impact |');
  lines.push('|-------|-----------|-------------|--------|');
  for (const item of plan) {
    lines.push(`| ${item.phase} | ${item.focus} | ${item.actions} | ${item.impact} |`);
  }
  nl();
  lines.push('---');
  lines.push('*Report generated by AEM Code Audit Engine v1.0 (BMAD DEPT Code Agent)*');

  // Write file
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`✅ Markdown report generated: ${outputPath}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupBySeverity(items: Finding[]): Record<string, Finding[]> {
  const result: Record<string, Finding[]> = {};
  for (const item of items) {
    if (!result[item.severity]) result[item.severity] = [];
    result[item.severity].push(item);
  }
  return result;
}

function makeRelative(filePath: string, root: string): string {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  const normalizedRoot = root.replace(/\\/g, '/');
  if (normalized.startsWith(normalizedRoot)) {
    return normalized.substring(normalizedRoot.length + 1);
  }
  return path.basename(filePath);
}

function escapeMd(str: string): string {
  if (!str) return '';
  return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.substring(0, max - 3) + '...' : str;
}

interface RecSummary {
  category: string;
  type: string;
  count: number;
  severity: string;
  recommendation: string;
}

function getTopRecommendations(findings: FindingsMap): RecSummary[] {
  const typeMap = new Map<string, RecSummary>();

  for (const [cat, items] of Object.entries(findings)) {
    for (const item of items) {
      const key = `${cat}::${item.type}`;
      if (!typeMap.has(key)) {
        typeMap.set(key, {
          category: cat,
          type: item.type,
          count: 0,
          severity: item.severity,
          recommendation: item.recommendation,
        });
      }
      typeMap.get(key)!.count++;
    }
  }

  const all = Array.from(typeMap.values());
  const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  all.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) || b.count - a.count);
  return all.slice(0, 50);
}

interface ActionPlanItem {
  phase: string;
  focus: string;
  actions: string;
  impact: string;
}

function generateActionPlan(findings: FindingsMap, stats: StatsMap): ActionPlanItem[] {
  const plan: ActionPlanItem[] = [];
  const critCount = stats.severityCounts['CRITICAL'] || 0;
  const highCount = stats.severityCounts['HIGH'] || 0;
  const secCount = (findings['Security'] || []).length;
  const testCount = (findings['Test Coverage'] || []).length;

  if (critCount > 0) {
    plan.push({
      phase: 'P0 — Immediate',
      focus: 'Critical Findings',
      actions: `Fix ${critCount} CRITICAL issues (security vulns, resource leaks, accessibility blockers)`,
      impact: 'Eliminate production risk, WCAG compliance',
    });
  }
  if (highCount > 0) {
    plan.push({
      phase: 'P1 — Sprint 1-2',
      focus: 'High-Priority Fixes',
      actions: `Address ${highCount} HIGH findings across Security, Performance, Accessibility`,
      impact: 'Stability improvement, reduced attack surface',
    });
  }
  if (secCount > 50) {
    plan.push({
      phase: 'P1 — Sprint 1-2',
      focus: 'Security Hardening',
      actions: `Triage ${secCount} security findings — prioritize XSS, SSRF, credential exposure`,
      impact: 'Compliance readiness, reduced breach risk',
    });
  }
  if (testCount > 10) {
    plan.push({
      phase: 'P2 — Sprint 3-4',
      focus: 'Test Coverage',
      actions: `${testCount} coverage gaps — add JaCoCo, unit tests for models/servlets`,
      impact: 'BPO score improvement, deployment confidence',
    });
  }
  plan.push({
    phase: 'P3 — Ongoing',
    focus: 'Code Quality & Maintainability',
    actions: 'Address MEDIUM/LOW findings, add SonarQube gate, refactor complex code',
    impact: 'Long-term maintainability, developer velocity',
  });

  return plan;
}
