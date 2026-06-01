#!/usr/bin/env node
/**
 * AEM Quick Scan — Rule-Pack Based Audit Engine
 *
 * Performs a deep deterministic audit using parsed rule packs (AEM AMS / AEM ACS)
 * WITHOUT any LLM or internet. Produces LLM-quality reports in Excel and Markdown.
 *
 * Usage:
 *   npx ts-node quick-scan.ts --path /project --platform aemams
 *   npx ts-node quick-scan.ts --path /project --platform aemcs
 *   npx ts-node quick-scan.ts --path /project --platform both
 *
 * Options:
 *   --path <dir>       Project root (required)
 *   --platform <p>     aemams | aemcs | both (default: both)
 *   --name <name>      Project name (default: folder name)
 *   --output <dir>     Output directory (default: ./output)
 *   --format <fmt>     excel | md | both (default: both)
 *   --json             Also output raw findings as JSON
 *   --help             Show this help
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { parseRulePack, RulePack } from './lib/rule-parser';
import { QuickScanner } from './lib/quick-scanner';
import { QuickReportGenerator } from './lib/quick-report';
import { generateQuickMarkdownReport } from './lib/quick-report-md';

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, any> {
  const args: Record<string, any> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--path') args.path = argv[++i];
    else if (arg === '--platform') args.platform = argv[++i];
    else if (arg === '--name') args.name = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--format') args.format = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`AEM Quick Scan — Rule-Pack Based Audit Engine v1.0

Usage:
  npx ts-node quick-scan.ts --path /project
  npx ts-node quick-scan.ts --path /project --platform aemams
  npx ts-node quick-scan.ts --path /project --platform aemcs --format excel

Options:
  --path <dir>       Project root directory (required)
  --platform <p>     Target platform: aemams | aemcs | both (default: both)
  --name <name>      Project name (default: directory name)
  --output <dir>     Output directory (default: ./output)
  --format <fmt>     Report format: excel | md | both (default: both)
  --json             Also output raw findings as JSON
  --help             Show this help message

Description:
  Parses AEM rule packs and evaluates regex-based detections against your
  project's source files. Produces LLM-quality reports without any LLM or
  internet connection. All analysis is deterministic and reproducible.

Platforms:
  aemams    AEM Managed Services (48 rules)
  aemcs     AEM as a Cloud Service (39 rules)
  both      All rules from both platforms (87 rules)
`);
      process.exit(0);
    }
  }
  return args;
}

// ─── Rule Pack Resolution ─────────────────────────────────────────────────────

function resolveRulePackPaths(): { ams: string; acs: string } {
  // Look relative to script location
  const scriptDir = __dirname;

  // Try multiple locations
  const candidates = [
    // From engines/aem/ → ../../resources/rule-packs/
    path.resolve(scriptDir, '..', '..', 'resources', 'rule-packs'),
    // From engines/aem/ → ../../../resources/rule-packs/
    path.resolve(scriptDir, '..', '..', '..', 'resources', 'rule-packs'),
    // From scripts/engines/aem/ → ../../resources/
    path.resolve(scriptDir, '..', '..', '..', '..', 'resources', 'rule-packs'),
  ];

  for (const base of candidates) {
    const ams = path.join(base, 'aemams', 'rules.md');
    const acs = path.join(base, 'aemcs', 'rules.md');
    if (fs.existsSync(ams) || fs.existsSync(acs)) {
      return { ams, acs };
    }
  }

  // Fallback: absolute path from workspace root
  const workspaceRoot = path.resolve(scriptDir, '..', '..', '..');
  return {
    ams: path.join(workspaceRoot, 'resources', 'rule-packs', 'aemams', 'rules.md'),
    acs: path.join(workspaceRoot, 'resources', 'rule-packs', 'aemcs', 'rules.md'),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Validate project path
  const projectPath = args.path ? path.resolve(args.path) : '';
  if (!projectPath) {
    console.error('❌ Error: --path is required. Use --help for usage.');
    process.exit(1);
  }
  if (!fs.existsSync(projectPath)) {
    console.error(`❌ Error: Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const platform = (args.platform || 'both') as 'aemams' | 'aemcs' | 'both';
  const validPlatforms = ['aemams', 'aemcs', 'both'];
  if (!validPlatforms.includes(platform)) {
    console.error(`❌ Error: Invalid platform "${platform}". Valid: aemams, aemcs, both`);
    process.exit(1);
  }

  const projectName = args.name || path.basename(projectPath);
  const outputDir = path.resolve(args.output || 'output');
  const format = (args.format || 'both').toLowerCase();
  if (!['excel', 'md', 'both'].includes(format)) {
    console.error(`❌ Error: Invalid format "${format}". Valid: excel, md, both`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Detect git branch
  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath, timeout: 5000 })
      .toString().trim().replace(/\//g, '-');
  } catch { /* ignore */ }

  // ─── Banner ──────────────────────────────────────────────────────────────────

  console.log('═'.repeat(70));
  console.log(' AEM Quick Scan Engine v1.0 — Rule-Pack Based Audit');
  console.log(' No LLM • No Internet • Deterministic • Reproducible');
  console.log('═'.repeat(70));
  console.log(`   Project:    ${projectName}`);
  console.log(`   Platform:   ${platform.toUpperCase()}`);
  console.log(`   Path:       ${projectPath}`);
  console.log(`   Output:     ${outputDir}`);
  console.log(`   Format:     ${format}`);
  if (branch) console.log(`   Branch:     ${branch}`);
  console.log('');

  // ─── Load Rule Packs ─────────────────────────────────────────────────────────

  console.log('📦 Loading rule packs...');
  const paths = resolveRulePackPaths();
  const rulePacks: RulePack[] = [];

  if (platform === 'aemams' || platform === 'both') {
    if (fs.existsSync(paths.ams)) {
      const pack = parseRulePack(paths.ams, 'aemams');
      rulePacks.push(pack);
      console.log(`   ✓ AEM AMS: ${pack.rules.length} rules loaded (${pack.categories.length} categories)`);
    } else {
      console.log(`   ⚠ AEM AMS rules not found at: ${paths.ams}`);
    }
  }

  if (platform === 'aemcs' || platform === 'both') {
    if (fs.existsSync(paths.acs)) {
      const pack = parseRulePack(paths.acs, 'aemcs');
      rulePacks.push(pack);
      console.log(`   ✓ AEM ACS: ${pack.rules.length} rules loaded (${pack.categories.length} categories)`);
    } else {
      console.log(`   ⚠ AEM ACS rules not found at: ${paths.acs}`);
    }
  }

  const totalRules = rulePacks.reduce((sum, p) => sum + p.rules.length, 0);
  if (totalRules === 0) {
    console.error('❌ Error: No rules loaded. Check rule-pack paths.');
    process.exit(1);
  }
  console.log(`   Total: ${totalRules} rules ready\n`);

  // ─── Run Scan ────────────────────────────────────────────────────────────────

  console.log('🔍 Starting rule-pack scan...\n');
  const scanner = new QuickScanner(projectPath, platform, rulePacks);
  const result = await scanner.scan();

  // ─── Print Summary ───────────────────────────────────────────────────────────

  const { stats } = result;
  console.log('\n' + '─'.repeat(70));
  console.log('📈 QUICK SCAN SUMMARY');
  console.log('─'.repeat(70));
  console.log(`   Total Files:        ${stats.totalFiles}`);
  console.log(`   Files Scanned:      ${stats.filesScanned}`);
  console.log(`   Rules Evaluated:    ${stats.rulesEvaluated}`);
  console.log(`   Rules Triggered:    ${stats.rulesTriggered}`);
  console.log(`   Total Findings:     ${stats.totalFindings}`);
  console.log(`   Categories:         ${stats.categories}`);
  console.log(`   Tokens Processed:   ${stats.tokensProcessed.toLocaleString()}`);
  console.log(`   Duration:           ${(stats.scanDuration / 1000).toFixed(1)}s`);
  console.log('');
  console.log('   Severity Distribution:');
  for (const sev of ['Critical', 'High', 'Medium', 'Low', 'Info']) {
    const count = stats.severityCounts[sev] || 0;
    if (count > 0) {
      const bar = '█'.repeat(Math.min(40, Math.round(count / Math.max(1, stats.totalFindings) * 40)));
      console.log(`     ${sev.padEnd(9)} ${String(count).padStart(5)} ${bar}`);
    }
  }
  console.log('');
  console.log('   Category Breakdown:');
  for (const [cat, findings] of [...result.findings.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`     ${cat.padEnd(22)} ${findings.length} findings`);
  }
  console.log('');

  // ─── Generate Reports ────────────────────────────────────────────────────────

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
  const branchPart = branch ? `-${branch}` : '';
  const baseFileName = `${projectName}-quick-scan-${platform}-${timestamp}${branchPart}`;

  if (format === 'excel' || format === 'both') {
    const excelPath = path.join(outputDir, `${baseFileName}.xlsx`);
    const report = new QuickReportGenerator(result.findings, stats, projectName, projectPath);
    await report.generate(excelPath);
  }

  if (format === 'md' || format === 'both') {
    const mdPath = path.join(outputDir, `${baseFileName}.md`);
    await generateQuickMarkdownReport(result.findings, stats, projectName, projectPath, mdPath);
  }

  if (args.json) {
    const jsonPath = path.join(outputDir, `${baseFileName}.json`);
    const jsonData = {
      stats,
      findings: Object.fromEntries(result.findings),
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    console.log(`📋 JSON: ${jsonPath}`);
  }

  // ─── Done ────────────────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(70));
  console.log(' ✅ AEM Quick Scan Complete');
  console.log(`    ${stats.totalFindings} findings from ${stats.rulesTriggered} triggered rules`);
  console.log('═'.repeat(70));
}

main().catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
