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
import { EDSConfig, AuditResult, CategoryResult, Finding, Severity } from './lib/types';
import { fetchGitHubRepo } from './lib/github-fetcher';
import { collectLocalFiles, categorizeFiles } from './lib/file-collector';
import { getAllAnalyzers } from './lib/analyzers';
import { generateReport } from './lib/report';

// Severity weights
const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 10,
  HIGH: 7,
  MEDIUM: 4,
  LOW: 1,
};

interface CliArgs {
  path?: string;
  github?: string;
  name?: string;
  output?: string;
  config?: string;
  json?: boolean;
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

function calculateOverallScore(categories: CategoryResult[]): number {
  const totalFindings = categories.reduce((sum, c) => sum + c.findings.length, 0);
  if (totalFindings === 0) return 100;

  // Max possible penalty (100 findings of CRITICAL = 1000 points)
  const totalPenalty = categories.reduce((sum, c) => {
    return sum + c.findings.reduce((s, f) => s + f.score, 0);
  }, 0);

  // Scale: 0 penalty = 100, 200+ penalty = 0
  const score = Math.max(0, Math.round(100 - (totalPenalty / 2)));
  return Math.min(100, score);
}

function calculateCategoryScore(findings: Finding[]): number {
  if (findings.length === 0) return 100;
  const penalty = findings.reduce((sum, f) => sum + f.score, 0);
  return Math.max(0, Math.round(100 - penalty * 2));
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

  for (const analyzer of analyzers) {
    const findings = analyzer.analyze(files, config);
    categories.push({
      category: analyzer.category,
      findings,
      score: calculateCategoryScore(findings),
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
