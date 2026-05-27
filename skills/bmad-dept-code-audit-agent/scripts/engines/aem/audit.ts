#!/usr/bin/env node
/**
 * AEM Code Audit Engine v1.0
 * Enterprise-grade static code analysis for AEM (AMS & Cloud Service) projects.
 * Generates comprehensive Excel report with sub-sheets for:
 * Performance, Code Quality, Security, SEO, Accessibility,
 * Architecture, Sling & OSGi, Cloud Readiness, Dispatcher,
 * HTL & Frontend, Test Coverage, Maintainability
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { AemAuditScanner, FindingsMap, StatsMap } from './lib/scanner';
import { AemReportGenerator } from './lib/report';

interface Config {
  project?: { path?: string; name?: string };
  output?: { directory?: string };
  scanner?: { platform?: 'aemcs' | 'aemams' | 'both'; categories?: string[]; modules?: string[] };
  thresholds?: Record<string, number>;
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
  const args: Record<string, any> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config') args.config = argv[++i];
    else if (arg === '--path') args.path = argv[++i];
    else if (arg === '--name') args.name = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--platform') args.platform = argv[++i];
    else if (arg === '--module') args.module = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`AEM Code Audit Engine v1.0

Usage:
  npx ts-node audit.ts --path /aem-project
  npx ts-node audit.ts --path /aem-project --platform aemcs
  npx ts-node audit.ts --config config.json

Options:
  --config <path>      Config JSON (default: config.json)
  --path <path>        AEM project root
  --name <name>        Project name (default: folder name)
  --output <dir>       Output directory (default: output)
  --platform <type>    Platform type: aemcs, aemams, or both (default: both)
  --module <mods>      Module filter (comma-separated: core,ui.apps)
  --json               Also output findings as JSON
  --help               Show this help

Categories audited:
  - Performance: queries, caching, threading, response times
  - Code Quality: patterns, standards, deprecated APIs, dead code
  - Security: XSS, SSRF, credentials, CSRF, injections
  - SEO: meta tags, structure, canonicals, Open Graph
  - Accessibility: WCAG 2.1, ARIA, keyboard, screen readers
  - Architecture: project structure, overlays, design patterns
  - Sling & OSGi: resolver leaks, service config, lifecycle
  - Cloud Readiness: AEMaaCS compatibility checks
  - Dispatcher: cache rules, filters, security
  - HTL & Frontend: template quality, clientlibs, JS/CSS
  - Test Coverage: unit tests, integration tests, coverage ratio
  - Maintainability: complexity, duplication, naming
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

  // Resolve values: CLI > config > defaults
  let projectPath = args.path || projectCfg.path || '';
  const platform = (args.platform || scannerCfg.platform || 'both') as 'aemcs' | 'aemams' | 'both';

  // Validate project path
  if (!projectPath) {
    console.error('❌ Error: No project path provided. Use --path or set in config.json.');
    process.exit(1);
  }

  projectPath = path.resolve(projectPath);
  if (!fs.existsSync(projectPath)) {
    console.error(`❌ Error: Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  // Verify it's an AEM project
  const pomPath = path.join(projectPath, 'pom.xml');
  const uiApps = path.join(projectPath, 'ui.apps');
  const core = path.join(projectPath, 'core');
  if (!fs.existsSync(pomPath) && !fs.existsSync(uiApps) && !fs.existsSync(core)) {
    console.log('⚠️  Warning: This may not be a standard AEM project (no pom.xml, ui.apps, or core found).');
  }

  const projectName = args.name || projectCfg.name || path.basename(projectPath);
  const outputDir = path.resolve(args.output || outputCfg.directory || 'output');
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
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath, timeout: 5000 })
      .toString().trim().replace(/\//g, '-');
  } catch { /* ignore */ }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
  const branchPart = branch ? `-${branch}` : '';
  const outputFile = path.join(outputDir, `${projectName}-aem-audit-${timestamp}${branchPart}.xlsx`);

  // Print summary
  console.log('═'.repeat(60));
  console.log(' AEM Code Audit Engine v1.0');
  console.log('═'.repeat(60));
  console.log(`📄 Config: ${fs.existsSync(configPath) ? configPath : 'defaults'}`);
  console.log(`   Project: ${projectName}`);
  console.log(`   Platform: ${platform.toUpperCase()}`);
  console.log(`   Path: ${projectPath}`);
  console.log(`   Output: ${outputDir}`);
  if (modules.length > 0) console.log(`   Modules: ${modules.join(', ')}`);
  console.log('');

  // Run scanner
  console.log('🔍 Starting AEM code audit...\n');
  const scanner = new AemAuditScanner({
    root: projectPath,
    platform,
    thresholds: thresholds as any,
    categories: scannerCfg.categories,
    modules,
  });

  const { findings, stats } = await scanner.scan();

  // Print summary
  console.log('\n' + '─'.repeat(60));
  console.log('📈 SCAN SUMMARY');
  console.log('─'.repeat(60));
  console.log(`   Total Files: ${stats.totalFiles}`);
  console.log(`   Total Findings: ${stats.totalFindings}`);
  console.log(`   Categories: ${stats.categories}`);
  console.log(`   Duration: ${(stats.scanDuration / 1000).toFixed(1)}s`);
  console.log('');
  console.log('   Severity Distribution:');
  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
    const count = stats.severityCounts[sev] || 0;
    if (count > 0) {
      const bar = '█'.repeat(Math.min(40, Math.round(count / Math.max(1, stats.totalFindings) * 40)));
      console.log(`     ${sev.padEnd(9)} ${String(count).padStart(4)} ${bar}`);
    }
  }
  console.log('');

  // Generate report
  const platformLabel = platform === 'aemcs' ? 'AEM as a Cloud Service' : platform === 'aemams' ? 'AEM Managed Services' : 'AEM (AMS + Cloud Service)';
  const report = new AemReportGenerator(findings, stats, projectName, projectPath, platformLabel);
  await report.generate(outputFile);

  // Optionally output JSON
  if (args.json) {
    const jsonFile = outputFile.replace('.xlsx', '.json');
    fs.writeFileSync(jsonFile, JSON.stringify({ findings, stats }, null, 2));
    console.log(`📋 JSON: ${jsonFile}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(' ✅ AEM Code Audit Complete');
  console.log('═'.repeat(60));
}

main().catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
