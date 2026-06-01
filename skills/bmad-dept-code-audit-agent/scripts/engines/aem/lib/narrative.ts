/**
 * Narrative Generator — Produces LLM-quality text for reports WITHOUT using any LLM.
 * Pre-built templates generate professional executive summaries, recommendations,
 * and impact assessments that read as if written by a senior consultant.
 */
import { QuickFinding, QuickScanStats } from './quick-scanner';

// ─── Executive Summary Narrative ──────────────────────────────────────────────

export function generateExecutiveNarrative(stats: QuickScanStats, projectName: string, projectRoot: string): string {
  const { totalFindings, severityCounts, rulesTriggered, rulesEvaluated, categories, platform } = stats;
  const critical = severityCounts['Critical'] || 0;
  const high = severityCounts['High'] || 0;
  const medium = severityCounts['Medium'] || 0;
  const low = severityCounts['Low'] || 0;

  const healthScore = calculateHealthScore(stats);
  const riskLevel = critical > 10 ? 'HIGH RISK' : critical > 3 ? 'ELEVATED RISK' : high > 20 ? 'MODERATE RISK' : 'ACCEPTABLE RISK';
  const platformLabel = platform === 'aemams' ? 'AEM Managed Services' : platform === 'aemcs' ? 'AEM as a Cloud Service' : 'AEM (AMS + Cloud Service)';

  return `## Executive Summary

### Project Health Assessment

**Project:** ${projectName}
**Platform:** ${platformLabel}
**Overall Health Score:** ${healthScore}/100
**Risk Level:** ${riskLevel}
**Analysis Date:** ${new Date().toISOString().split('T')[0]}

### Key Findings

The automated rule-based analysis evaluated **${rulesEvaluated} rules** from the ${platformLabel} rule pack against the project codebase. Of these, **${rulesTriggered} rules triggered** across **${categories} categories**, producing a total of **${totalFindings.toLocaleString()} findings**.

${critical > 0 ? `⚠️ **${critical} Critical findings** require immediate attention. These represent deployment blockers, security vulnerabilities, or patterns that will cause production failures.` : '✅ No critical findings detected.'}

${high > 0 ? `**${high} High-severity findings** should be addressed within the current sprint. These include deprecated API usage, performance anti-patterns, and architectural violations that accumulate significant technical debt.` : ''}

${medium > 0 ? `**${medium} Medium-severity findings** represent best-practice violations that should be planned for remediation within 1-2 sprints.` : ''}

${low > 0 ? `**${low} Low-severity findings** are minor optimizations suitable for backlog grooming.` : ''}

### Risk Assessment

${generateRiskParagraph(stats)}

### Recommended Action Plan

${generateActionPlan(stats)}

### Technical Debt Estimate

Based on the findings distribution and effort estimates:
- **Immediate (Sprint 0):** ${critical} critical issues — estimated ${Math.ceil(critical * 2)} developer-days
- **Short-term (Sprint 1-2):** ${high} high issues — estimated ${Math.ceil(high * 0.5)} developer-days
- **Medium-term (Sprint 3-6):** ${medium} medium issues — estimated ${Math.ceil(medium * 0.25)} developer-days
- **Backlog:** ${low} low-priority improvements — estimated ${Math.ceil(low * 0.15)} developer-days

**Total estimated remediation effort:** ${Math.ceil(critical * 2 + high * 0.5 + medium * 0.25 + low * 0.15)} developer-days
`;
}

function calculateHealthScore(stats: QuickScanStats): number {
  const { totalFindings, severityCounts, totalFiles } = stats;
  if (totalFiles === 0) return 100;

  const critical = severityCounts['Critical'] || 0;
  const high = severityCounts['High'] || 0;
  const medium = severityCounts['Medium'] || 0;

  // Weighted deductions
  let score = 100;
  score -= critical * 5;
  score -= high * 1.5;
  score -= medium * 0.3;
  score -= (totalFindings / totalFiles) * 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateRiskParagraph(stats: QuickScanStats): string {
  const critical = stats.severityCounts['Critical'] || 0;
  const high = stats.severityCounts['High'] || 0;

  if (critical > 10) {
    return `The project exhibits **significant risk** with ${critical} critical violations. These findings indicate systemic architectural issues, security vulnerabilities, or patterns incompatible with the target deployment model. A focused remediation sprint is strongly recommended before any production deployment.`;
  }
  if (critical > 3) {
    return `The project has **elevated risk** with ${critical} critical findings that need immediate attention. While the majority of the codebase follows acceptable patterns, the critical findings represent potential production incidents if not addressed.`;
  }
  if (high > 20) {
    return `The project shows **moderate risk** primarily driven by ${high} high-severity findings. These are not immediate deployment blockers but represent accumulated technical debt that will impact maintainability and upgrade readiness.`;
  }
  return `The project is in **acceptable condition** with no critical deployment blockers. The findings primarily represent opportunities for optimization and alignment with current best practices.`;
}

function generateActionPlan(stats: QuickScanStats): string {
  const critical = stats.severityCounts['Critical'] || 0;
  const high = stats.severityCounts['High'] || 0;

  const steps: string[] = [];
  if (critical > 0) {
    steps.push(`1. **Immediate Triage (Day 1-2):** Review all ${critical} critical findings. Assign owners and create JIRA tickets for each.`);
    steps.push(`2. **Critical Fix Sprint (Week 1):** Address all critical security and deployment-blocking issues before next release.`);
  }
  if (high > 0) {
    steps.push(`${steps.length + 1}. **High-Priority Remediation (Sprint 1-2):** Tackle deprecated API replacements and performance anti-patterns in priority order.`);
  }
  steps.push(`${steps.length + 1}. **Continuous Improvement:** Integrate rule-pack scanning into CI/CD pipeline to prevent regression.`);
  steps.push(`${steps.length + 1}. **Knowledge Transfer:** Share findings report with the team; conduct a 1-hour review session per category.`);

  return steps.join('\n');
}

// ─── Category Narrative ───────────────────────────────────────────────────────

export function generateCategoryNarrative(category: string, findings: QuickFinding[]): string {
  const count = findings.length;
  const critical = findings.filter(f => f.severity === 'Critical').length;
  const high = findings.filter(f => f.severity === 'High').length;
  const uniqueRules = new Set(findings.map(f => f.ruleId));
  const modules = new Set(findings.map(f => f.module));

  const categoryInsights = getCategoryInsight(category);

  return `### ${category} Analysis

**Total Findings:** ${count} | **Rules Triggered:** ${uniqueRules.size} | **Affected Modules:** ${[...modules].join(', ')}
${critical > 0 ? `\n⚠️ **${critical} Critical** | ` : ''}${high > 0 ? `**${high} High** | ` : ''}Remaining: Medium/Low

${categoryInsights}

**Top Violations:**
${getTopViolations(findings)}

**Remediation Priority:**
${getRemediationPriority(findings)}
`;
}

function getCategoryInsight(category: string): string {
  const insights: Record<string, string> = {
    'Architecture': 'Architecture findings indicate structural issues in the project layout, module organization, content packaging, or component design. These are typically higher-effort fixes but have the broadest positive impact when addressed.',
    'Sling & OSGi': 'Sling/OSGi findings relate to service registration, resource resolution, dependency injection, and lifecycle management. These are common sources of memory leaks and production instability.',
    'Performance': 'Performance findings highlight code patterns that cause excessive JCR queries, uncached operations, inefficient traversals, or resource-intensive operations that degrade author/publish response times.',
    'Security': 'Security findings identify XSS vectors, CSRF gaps, insecure deserialization, hardcoded credentials, and missing access control checks. Critical security findings must be treated as P0.',
    'AMS-Specific': 'AMS-Specific findings are unique to Adobe Managed Services environments — replication agents, dispatcher flush rules, AMS-specific configurations, and patterns that differ from Cloud Service.',
    'Cloud Readiness': 'Cloud Readiness findings identify patterns incompatible with AEM as a Cloud Service. Address these to enable future cloud migration or if the target is already AEMaaCS.',
    'Frontend Framework': 'Frontend findings cover SPA framework usage (React/Angular/Vue), client library management, asset optimization, and modern JavaScript/TypeScript patterns within ui.frontend.',
  };
  return insights[category] || `This category covers ${category.toLowerCase()}-related patterns and best practices for AEM development.`;
}

function getTopViolations(findings: QuickFinding[]): string {
  const ruleCount = new Map<string, number>();
  for (const f of findings) {
    ruleCount.set(f.ruleId, (ruleCount.get(f.ruleId) || 0) + 1);
  }
  const sorted = [...ruleCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return sorted.map(([id, count]) => `- \`${id}\`: ${count} occurrences`).join('\n');
}

function getRemediationPriority(findings: QuickFinding[]): string {
  const priorities: string[] = [];
  const critical = findings.filter(f => f.severity === 'Critical');
  const high = findings.filter(f => f.severity === 'High');

  if (critical.length > 0) {
    const topCritical = [...new Set(critical.map(f => f.ruleId))].slice(0, 3);
    priorities.push(`1. **P0 — Fix immediately:** ${topCritical.join(', ')}`);
  }
  if (high.length > 0) {
    const topHigh = [...new Set(high.map(f => f.ruleId))].slice(0, 3);
    priorities.push(`${priorities.length + 1}. **P1 — Fix this sprint:** ${topHigh.join(', ')}`);
  }
  if (priorities.length === 0) {
    priorities.push('All findings are medium/low priority. Plan in regular sprint backlog.');
  }
  return priorities.join('\n');
}

// ─── Finding-Level Narrative ──────────────────────────────────────────────────

export function generateFindingNarrative(finding: QuickFinding): string {
  return `**${finding.ruleId}** — ${finding.description}

**Location:** \`${finding.filePath}\` (Line ${finding.lineNum})
**Module:** ${finding.module}
**Matched Pattern:** \`${finding.matchedPattern}\`

**Impact:** ${finding.impact}
**Effort:** ${finding.effort}
**Recommendation:** ${finding.recommendation}
${finding.references.length > 0 ? `\n**References:**\n${finding.references.map(r => `- ${r}`).join('\n')}` : ''}`;
}

// ─── Overall Recommendations ──────────────────────────────────────────────────

export function generateTopRecommendations(findings: Map<string, QuickFinding[]>): string[] {
  const allFindings: QuickFinding[] = [];
  for (const [_, f] of findings) allFindings.push(...f);

  // Priority: Critical > High, then by frequency
  const ruleAgg = new Map<string, { count: number; severity: string; description: string; effort: string }>();
  for (const f of allFindings) {
    const existing = ruleAgg.get(f.ruleId);
    if (!existing) {
      ruleAgg.set(f.ruleId, { count: 1, severity: f.severity, description: f.description, effort: f.effort });
    } else {
      existing.count++;
    }
  }

  // Score: Critical=100, High=50, Medium=10, Low=1, multiplied by count
  const scored = [...ruleAgg.entries()].map(([id, data]) => {
    const sevScore = data.severity === 'Critical' ? 100 : data.severity === 'High' ? 50 : data.severity === 'Medium' ? 10 : 1;
    return { id, score: sevScore * Math.sqrt(data.count), ...data };
  }).sort((a, b) => b.score - a.score);

  return scored.slice(0, 20).map((item, i) => {
    return `${i + 1}. **${item.id}** (${item.severity}, ${item.count} occurrences) — ${item.description.substring(0, 120)}${item.description.length > 120 ? '...' : ''}`;
  });
}
