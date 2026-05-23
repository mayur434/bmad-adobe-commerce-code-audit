#!/usr/bin/env node
/**
 * Adobe Commerce Code Audit & Impact Analysis Tool v4.0
 * Enterprise-grade static code analysis + multi-mode impact analysis.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { AdobeCommerceAuditScanner, FindingsMap, StatsMap, Finding } from './lib/scanner';
import { AuditReportGenerator } from './lib/report';
import { BRDAnalysisEngine } from './lib/brd_analyzer';
import { ImpactAnalyzer } from './lib/impact';

interface Config {
  project?: { path?: string; name?: string };
  output?: { directory?: string };
  scanner?: { namespace?: string; categories?: string[]; modules?: string | string[] };
  thresholds?: Record<string, number>;
  database?: { dump_path?: string };
  analysis?: { code_audit?: string; brd?: string | string[]; bug_report?: string; patch?: { enabled?: boolean; from_version?: string; to_version?: string } };
}

function loadConfig(configPath: string): Config {
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e: any) {
    console.log(`⚠️  Warning: Could not parse ${configPath}: ${e.message}`);
    return {};
  }
}

function parseArgs(argv: string[]): Record<string, any> {
  const args: Record<string, any> = { brd: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config') args.config = argv[++i];
    else if (arg === '--path') args.path = argv[++i];
    else if (arg === '--db') args.db = argv[++i];
    else if (arg === '--name') args.name = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--namespace') args.namespace = argv[++i];
    else if (arg === '--module') args.module = argv[++i];
    else if (arg === '--brd') args.brd.push(argv[++i]);
    else if (arg === '--bugs') args.bugs = argv[++i];
    else if (arg === '--no-code-audit') args.noCodeAudit = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Adobe Commerce Enterprise Code Audit & Impact Analysis Tool v4.0

Usage:
  npx ts-node audit.ts                        # uses config.json
  npx ts-node audit.ts --path /project        # code audit only
  npx ts-node audit.ts --db /dump.sql         # DB audit only
  npx ts-node audit.ts --brd /brd.txt         # BRD analysis
  npx ts-node audit.ts --bugs /bugs.xlsx      # Bug impact analysis
  npx ts-node audit.ts --no-code-audit --brd /brd.txt

Options:
  --config <path>      Config JSON (default: config.json)
  --path <path>        Project root
  --db <path>          SQL dump file
  --name <name>        Project name
  --output <dir>       Output directory
  --namespace <ns>     Custom module namespace
  --module <mods>      Module filter (comma-separated)
  --brd <path>         BRD file (repeatable)
  --bugs <path>        Bug report Excel file
  --no-code-audit      Skip code audit
  --json               Output findings as JSON
`);
      process.exit(0);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const configPath = args.config || 'config.json';
  const cfg = loadConfig(configPath);

  const projectCfg = cfg.project || {};
  const outputCfg = cfg.output || {};
  const scannerCfg = cfg.scanner || {};
  const thresholds = cfg.thresholds || {};
  const dbCfg = cfg.database || {};
  const analysisCfg = cfg.analysis || {};

  // Resolve values: CLI > config > defaults
  let projectPath = args.path || projectCfg.path || '';
  let dbPath = args.db || dbCfg.dump_path || '';

  const codeAuditEnabled = !args.noCodeAudit && (analysisCfg.code_audit || 'yes').toLowerCase() === 'yes';

  // BRD paths
  let brdPaths: string[] = [];
  if (args.brd && args.brd.length > 0) {
    brdPaths = args.brd.filter((p: string) => {
      if (!fs.existsSync(p)) { console.log(`⚠️  BRD file not found, skipping: ${p}`); return false; }
      return true;
    });
  } else {
    const configBrds = analysisCfg.brd || [];
    const brdArr = typeof configBrds === 'string' ? (configBrds ? [configBrds] : []) : configBrds;
    brdPaths = brdArr.filter((p) => p && fs.existsSync(p));
  }

  // Bug report
  let bugPath = args.bugs || analysisCfg.bug_report || '';
  if (bugPath && !fs.existsSync(bugPath)) {
    if (args.bugs) { console.error(`❌ Error: Bug report file does not exist: ${bugPath}`); process.exit(1); }
    console.log(`⚠️  Configured bug report not found, skipping: ${bugPath}`);
    bugPath = '';
  }

  // Patch
  const patchConfig = analysisCfg.patch || {};
  const patchEnabled = patchConfig.enabled || false;

  // Validate inputs
  const hasAnyInput = projectPath || dbPath || brdPaths.length > 0 || bugPath || patchEnabled;
  if (!hasAnyInput) {
    console.error('❌ Error: No analysis input provided. Use --help for usage.');
    process.exit(1);
  }

  if (projectPath) {
    projectPath = path.resolve(projectPath);
    if (!fs.existsSync(projectPath)) { console.error(`❌ Error: Project path does not exist: ${projectPath}`); process.exit(1); }
    if (!fs.existsSync(path.join(projectPath, 'app', 'code'))) {
      console.log('⚠️  Warning: No app/code directory found. This may not be an Adobe Commerce project.');
    }
  }

  if ((brdPaths.length > 0 || bugPath || patchEnabled) && !projectPath) {
    console.error('❌ Error: BRD, bug, and patch analysis require --path (project root).');
    process.exit(1);
  }

  if (dbPath) {
    dbPath = path.resolve(dbPath);
    if (!fs.existsSync(dbPath)) {
      if (args.db) { console.error(`❌ Error: DB dump file does not exist: ${dbPath}`); process.exit(1); }
      console.log(`⚠️  Warning: Configured DB dump does not exist, skipping: ${dbPath}`);
      dbPath = '';
    }
  }

  const projectName = args.name || projectCfg.name || (projectPath ? path.basename(projectPath) : 'Analysis');
  const outputDir = path.resolve(args.output || outputCfg.directory || 'output');
  const namespace = args.namespace || scannerCfg.namespace || 'Custom';
  const categories = scannerCfg.categories || undefined;
  let modules: string[] = [];
  const moduleFilter = args.module || scannerCfg.modules;
  if (typeof moduleFilter === 'string') {
    modules = moduleFilter.split(',').map((m: string) => m.trim()).filter(Boolean);
  } else if (Array.isArray(moduleFilter)) {
    modules = moduleFilter;
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Detect git branch
  let branch = '';
  if (projectPath) {
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath, timeout: 5000 })
        .toString().trim().replace(/\//g, '-');
    } catch { /* ignore */ }
  }

  // Determine mode
  const modeParts: string[] = [];
  if (projectPath && codeAuditEnabled) modeParts.push('code');
  if (dbPath) modeParts.push('db');
  if (brdPaths.length > 0) modeParts.push('brd');
  if (bugPath) modeParts.push('bugs');
  if (patchEnabled) modeParts.push('patch');
  const auditMode = modeParts.join('+') || 'analysis';

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
  const branchPart = branch ? `-branch-${branch}` : '';
  const outputFile = path.join(outputDir, `${projectName}-audit-${auditMode}-${timestamp}${branchPart}.xlsx`);

  // Print summary
  console.log('='.repeat(60));
  console.log(' Adobe Commerce Audit & Impact Analysis Tool v4.0');
  console.log('='.repeat(60));
  console.log(`📄 Config: ${configPath}`);
  console.log(`   Project: ${projectName}`);
  console.log(`   Analysis Mode: ${auditMode.toUpperCase()}`);
  if (projectPath) console.log(`   Code Path: ${projectPath}\n   Code Audit: ${codeAuditEnabled ? 'ENABLED' : 'DISABLED'}`);
  if (dbPath) console.log(`   DB Dump: ${dbPath}`);
  if (brdPaths.length > 0) { console.log(`   BRD Files: ${brdPaths.length}`); brdPaths.forEach((bp) => console.log(`     → ${bp}`)); }
  if (bugPath) console.log(`   Bug Report: ${bugPath}`);
  if (patchEnabled) console.log(`   Patch: ${patchConfig.from_version || '?'} → ${patchConfig.to_version || '?'}`);
  console.log(`   Output: ${outputDir}`);
  if (modules.length > 0) console.log(`   Modules: ${modules.join(', ')}\n   ⚠️  Module filter active.`);
  console.log('');

  // Phase 1: Code Audit
  let allFindings: FindingsMap = {};
  let allStats: StatsMap = { totalFiles: 0, phpFiles: 0, xmlFiles: 0, phtmlFiles: 0, totalFindings: 0, categories: 0, severityCounts: {}, scanDuration: 0 };

  if (codeAuditEnabled && projectPath) {
    const scanner = new AdobeCommerceAuditScanner({
      root: projectPath,
      namespace,
      thresholds,
      categories,
      sqlDump: dbPath || undefined,
      modules,
    });
    const startTime = Date.now();
    const result = await scanner.scan();
    result.stats.scanDuration = Date.now() - startTime;
    allFindings = result.findings;
    allStats = result.stats;

    // Impact enrichment
    console.log('\n🔗 Impact Analysis for code findings...');
    const impactAnalyzer = new ImpactAnalyzer(projectPath, namespace);
    impactAnalyzer.build();
    let enriched = 0;
    for (const items of Object.values(allFindings)) {
      for (const item of items) {
        if (item.file && !item.impact) {
          const impactText = impactAnalyzer.getImpactForFile(item.file);
          if (impactText) { item.impact = impactText; enriched++; }
        }
      }
    }
    console.log(`   ✅ Enriched ${enriched} findings with impact analysis`);

    // Justification enrichment
    console.log('\n📝 Generating justification for all findings...');
    let justified = 0;
    for (const [cat, items] of Object.entries(allFindings)) {
      const isDb = cat.startsWith('DB:');
      for (const item of items) {
        if (item.justification) { justified++; continue; }
        const parts: string[] = [];
        if (isDb) {
          parts.push(`SQL dump analysis: ${item.type} identified in parsed table definition`);
        } else if (item.file && item.line) {
          parts.push(`Source code inspection: ${item.type} detected at ${item.file}:L${item.line}`);
        } else {
          parts.push(`Static analysis: ${item.type}`);
        }
        if (item.code) parts.push(`Evidence: ${item.code.split('\n')[0].trim().substring(0, 120)}`);
        if (item.impact) parts.push(`Dependency chain: ${item.impact.substring(0, 200)}`);
        else if (!isDb) parts.push('Impact scope: localized — no cross-module dependencies detected');
        item.justification = parts.join(' | ');
        justified++;
      }
    }
    console.log(`   ✅ Generated justification for ${justified} findings`);
  } else if (dbPath && !codeAuditEnabled) {
    const scanner = new AdobeCommerceAuditScanner({
      root: '',
      namespace,
      thresholds,
      categories,
      sqlDump: dbPath,
      modules,
    });
    const result = await scanner.scan();
    allFindings = result.findings;
    allStats = result.stats;
  }

  // Phase 2: Impact Analysis (BRD / Bugs / Patch)
  function mergeFindings(newFindings: FindingsMap): void {
    for (const [cat, items] of Object.entries(newFindings)) {
      if (!allFindings[cat]) allFindings[cat] = [];
      allFindings[cat].push(...items);
      for (const item of items) {
        allStats.severityCounts[item.severity] = (allStats.severityCounts[item.severity] || 0) + 1;
      }
    }
  }

  if (brdPaths.length > 0 || bugPath || patchEnabled) {
    const engine = new BRDAnalysisEngine(projectPath, namespace, modules);
    for (const bp of brdPaths) {
      const brdFindings = await engine.analyzeBrd(bp);
      mergeFindings(brdFindings);
    }
    if (bugPath) {
      const bugFindings = await engine.analyzeBugs(bugPath);
      mergeFindings(bugFindings);
    }
    if (patchEnabled) {
      const patchFindings = engine.analyzePatch(patchConfig);
      mergeFindings(patchFindings);
    }
  }

  // Phase 3: Generate Report
  const totalFindings = Object.values(allFindings).reduce((sum, arr) => sum + arr.length, 0);
  if (totalFindings > 0) {
    if (args.json) {
      const output = {
        project: projectPath || '',
        total_findings: totalFindings,
        severity_breakdown: allStats.severityCounts,
        categories: Object.fromEntries(Object.entries(allFindings).map(([cat, items]) => [cat, items.length])),
        findings: allFindings,
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    allStats.totalFindings = totalFindings;
    allStats.categories = Object.keys(allFindings).length;

    const report = new AuditReportGenerator(allFindings, allStats, projectName, projectPath || dbPath || '');
    await report.generate(outputFile);
    console.log(`\n📁 Report saved to: ${outputFile}`);
  } else {
    console.log('\n⚠️  No findings generated. Check your configuration and inputs.');
  }
}

main().catch((err) => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
