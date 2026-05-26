/**
 * EDS Audit Engine — Main Entry Point
 * =====================================
 * Usage:
 *   npx ts-node engines/eds/audit.ts --path /local/project
 *   npx ts-node engines/eds/audit.ts --github https://github.com/org/repo
 *   npx ts-node engines/eds/audit.ts --github https://github.com/org/repo --name "My Project" --output ./reports
 */
import * as fs from 'fs';
import * as path from 'path';
import { EDSConfig, AuditResult, CategoryResult, Finding, Severity, PageSpeedSummary, FileScoreSummary } from './lib/types';
import { fetchGitHubRepo } from './lib/github-fetcher';
import { collectLocalFiles, categorizeFiles } from './lib/file-collector';
import { getAllAnalyzers } from './lib/analyzers';
import { generateReport } from './lib/report';
import { runPageSpeedChecks, PageSpeedConfig, PageSpeedResult } from './lib/pagespeed-checker';

interface CliArgs {
  path?: string;
  github?: string;
  name?: string;
  output?: string;
  config?: string;
  json?: boolean;
  pagespeed?: boolean;
  pages?: string[];
  psiKey?: string;
  domain?: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--path':
        args.path = argv[++i];
        break;
      case '--github':
        args.github = argv[++i];
        break;
      case '--name':
        args.name = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--config':
        args.config = argv[++i];
        break;
      case '--json':
        args.json = true;
        break;
      case '--pagespeed':
        args.pagespeed = true;
        break;
      case '--pages':
        args.pages = argv[++i]?.split(',').map((p) => p.trim()) || [];
        break;
      case '--psi-key':
        args.psiKey = argv[++i];
        break;
      case '--domain':
        args.domain = argv[++i];
        break;
    }
  }

  return args;
}

function loadConfig(configPath?: string): EDSConfig {
  const defaultConfigPath = path.join(__dirname, 'config.json');
  const defaultConfig: EDSConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));

  if (configPath && fs.existsSync(configPath)) {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { ...defaultConfig, ...userConfig };
  }

  return defaultConfig;
}

/** Category weights for overall score (total = 100%) */
const CATEGORY_WEIGHTS: Record<string, number> = {
  'Performance': 20,
  'Architecture': 15,
  'Security': 15,
  'Accessibility': 12,
  'CSS': 8,
  'JavaScript': 8,
  'Code Quality': 6,
  'Content Practices': 5,
  'SEO': 4,
  'Dev Workflow': 3,
  'Linting': 2,
  'Git Hooks': 2,
};

/** Severity impact multipliers */
const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 0.5,
};

function calculateCategoryScore(findings: Finding[], category?: string, totalFiles?: number): number {
  if (findings.length === 0) return 100;

  const fileCount = Math.max(totalFiles || 50, 1);

  // Calculate weighted penalty from all findings
  const weightedPenalty = findings.reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] || 1), 0);

  // Exponential decay: score decreases smoothly as findings grow
  // Calibrated so penalty equal to 2× file count ≈ score of 37
  // Few findings relative to project size = high score
  const score = Math.round(100 * Math.exp(-weightedPenalty / (fileCount * 2)));
  return Math.max(0, Math.min(100, score));
}

function calculateOverallScore(categories: CategoryResult[]): number {
  const totalFindings = categories.reduce((sum, c) => sum + c.findings.length, 0);
  if (totalFindings === 0) return 100;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const cat of categories) {
    const weight = CATEGORY_WEIGHTS[cat.category] || 2;
    weightedSum += cat.score * weight;
    totalWeight += weight;
  }

  return Math.round(weightedSum / totalWeight);
}

/** Calculate per-file scores and return files scoring below 90 */
function calculateFileScores(findings: Finding[], totalFiles: number): FileScoreSummary[] {
  const fileFindings = new Map<string, Finding[]>();

  for (const f of findings) {
    if (!f.file) continue;
    const existing = fileFindings.get(f.file) || [];
    existing.push(f);
    fileFindings.set(f.file, existing);
  }

  const results: FileScoreSummary[] = [];

  for (const [file, fFindings] of fileFindings) {
    const critical = fFindings.filter((f) => f.severity === 'CRITICAL').length;
    const high = fFindings.filter((f) => f.severity === 'HIGH').length;
    const medium = fFindings.filter((f) => f.severity === 'MEDIUM').length;
    const low = fFindings.filter((f) => f.severity === 'LOW').length;

    // Score: start at 100, deduct per severity
    const penalty = (critical * 15) + (high * 8) + (medium * 3) + (low * 1);
    const score = Math.max(0, Math.min(100, 100 - penalty));

    if (score < 90) {
      const topIssue = fFindings.sort((a, b) => {
        const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
      })[0];

      results.push({
        file,
        score,
        critical,
        high,
        medium,
        low,
        topIssue: topIssue?.description || '',
        recommendation: topIssue?.recommendation?.split('\n')[0] || '',
      });
    }
  }

  return results.sort((a, b) => a.score - b.score);
}

async function run(): Promise<void> {
  const args = parseArgs();
  const config = loadConfig(args.config);

  if (!args.path && !args.github) {
    console.error('Error: Provide --path <local_dir> or --github <repo_url>');
    process.exit(1);
  }

  const source = args.github || args.path!;
  const projectName = args.name || config.project.name || path.basename(source.replace(/\/$/, ''));

  console.log(`\n⚡ EDS Audit Engine v1.0.0`);
  console.log(`📁 Source: ${source}`);
  console.log(`📋 Project: ${projectName}\n`);

  // Collect files
  console.log('Collecting files...');
  let rawFiles;
  if (args.github) {
    rawFiles = await fetchGitHubRepo(args.github);
  } else {
    rawFiles = collectLocalFiles(args.path!);
  }

  console.log(`Found ${rawFiles.length} files to analyze`);
  const files = categorizeFiles(rawFiles);

  // Run analyzers
  console.log('Running analyzers...');
  const analyzers = getAllAnalyzers();
  const categories: CategoryResult[] = [];
  const totalFiles = rawFiles.length;

  for (const analyzer of analyzers) {
    const findings = analyzer.analyze(files, config);
    categories.push({
      category: analyzer.category,
      findings,
      score: calculateCategoryScore(findings, analyzer.category, totalFiles),
    });
    const sev = findings.length > 0
      ? ` (${findings.filter(f => f.severity === 'CRITICAL').length}C/${findings.filter(f => f.severity === 'HIGH').length}H/${findings.filter(f => f.severity === 'MEDIUM').length}M/${findings.filter(f => f.severity === 'LOW').length}L)`
      : '';
    console.log(`  ✓ ${analyzer.category}: ${findings.length} findings${sev}`);
  }

  // Build result
  const allFindings = categories.flatMap((c) => c.findings);
  const result: AuditResult = {
    projectName,
    timestamp: new Date().toISOString(),
    source,
    filesScanned: rawFiles.length,
    totalFindings: allFindings.length,
    overallScore: calculateOverallScore(categories),
    severityBreakdown: {
      CRITICAL: allFindings.filter((f) => f.severity === 'CRITICAL').length,
      HIGH: allFindings.filter((f) => f.severity === 'HIGH').length,
      MEDIUM: allFindings.filter((f) => f.severity === 'MEDIUM').length,
      LOW: allFindings.filter((f) => f.severity === 'LOW').length,
    },
    categories,
  };

  // Per-file score tracking — flag files scoring below 90
  result.lowScoreFiles = calculateFileScores(allFindings, totalFiles);

  if (result.lowScoreFiles.length > 0) {
    console.log(`\n⚠️  Files scoring below 90:`);
    for (const f of result.lowScoreFiles) {
      console.log(`    ${f.file}: ${f.score}/100 (${f.critical}C/${f.high}H/${f.medium}M/${f.low}L)`);
    }
  }

  // Run PageSpeed Insights if requested
  if (args.pagespeed && args.github) {
    console.log('\nRunning PageSpeed Insights checks...');
    const psiConfig: PageSpeedConfig = {
      enabled: true,
      apiKey: args.psiKey,
      pages: args.pages || ['/'],
      strategy: ['mobile', 'desktop'],
      threshold: 90,
      maxPages: 5,
      domain: args.domain,
    };

    const psiResults = await runPageSpeedChecks(psiConfig, args.github);
    result.pageSpeedResults = psiResults
      .filter((r) => r.score >= 0)
      .map((r) => ({
        url: r.url,
        strategy: r.strategy,
        score: r.score,
        lcp: r.metrics.lcp,
        cls: r.metrics.cls,
        inp: r.metrics.inp,
        fcp: r.metrics.fcp,
        ttfb: r.metrics.ttfb,
        tbt: r.metrics.tbt,
        topOpportunity: r.opportunities[0]?.title || 'None',
        status: r.score >= 90 ? 'PASS' as const : r.score >= 50 ? 'NEEDS_WORK' as const : 'FAIL' as const,
      }));

    // Generate findings from PSI results
    for (const r of psiResults) {
      if (r.score >= 0 && r.score < 90) {
        const perfCategory = categories.find((c) => c.category === 'Performance');
        if (perfCategory) {
          const finding: Finding = {
            rule: 'EDS-PERF-PSI',
            severity: r.score < 50 ? 'CRITICAL' : 'HIGH',
            category: 'Performance',
            description: `PageSpeed score ${r.score}/100 (${r.strategy}) for ${r.url} — LCP: ${(r.metrics.lcp / 1000).toFixed(1)}s, CLS: ${r.metrics.cls}, TBT: ${r.metrics.tbt}ms`,
            recommendation: `[WHAT] Page "${r.url}" scores ${r.score}/100 on ${r.strategy}\n[WHY] Core Web Vitals:\n  • LCP: ${(r.metrics.lcp / 1000).toFixed(1)}s (target: < 2.5s)\n  • CLS: ${r.metrics.cls} (target: < 0.1)\n  • INP: ${r.metrics.inp}ms (target: < 200ms)\n  • TBT: ${r.metrics.tbt}ms (target: < 200ms)\n  • TTFB: ${r.metrics.ttfb}ms (target: < 800ms)\n[HOW] Top opportunities:\n${r.opportunities.slice(0, 3).map((o) => `  • ${o.title}${o.savings ? ` (save ${o.savings})` : ''}`).join('\n')}\n[IMPACT] Fixing top 3 issues typically improves score by 15-30 points`,
            score: r.score < 50 ? 10 : 7,
          };
          perfCategory.findings.push(finding);
          result.totalFindings++;
          if (finding.severity === 'CRITICAL') result.severityBreakdown.CRITICAL++;
          else result.severityBreakdown.HIGH++;
        }
      }
    }

    // Print PSI summary
    const failingPages = psiResults.filter((r) => r.score >= 0 && r.score < 90);
    if (failingPages.length > 0) {
      console.log(`\n❌ Pages below 90 score:`);
      for (const p of failingPages) {
        console.log(`    ${p.strategy.padEnd(7)} ${p.url} → ${p.score}/100 (LCP: ${(p.metrics.lcp / 1000).toFixed(1)}s)`);
      }
    } else if (psiResults.some((r) => r.score >= 0)) {
      console.log(`\n✅ All pages score 90+ on PageSpeed Insights`);
    }
  }

  // Generate output
  const outputDir = args.output || '.';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const safeName = projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

  if (args.json) {
    const jsonPath = path.join(outputDir, `${safeName}-eds-audit-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    console.log(`\n📄 JSON report: ${jsonPath}`);
  }

  const xlsxPath = path.join(outputDir, `${safeName}-eds-audit-${timestamp}.xlsx`);
  await generateReport(result, xlsxPath);

  // Print summary
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Overall Score: ${result.overallScore}/100`);
  console.log(`  Total Findings: ${result.totalFindings}`);
  console.log(`  CRITICAL: ${result.severityBreakdown.CRITICAL} | HIGH: ${result.severityBreakdown.HIGH} | MEDIUM: ${result.severityBreakdown.MEDIUM} | LOW: ${result.severityBreakdown.LOW}`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`\n📊 Excel report: ${xlsxPath}\n`);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
