#!/usr/bin/env ts-node
/**
 * BMAD Test Coverage Agent — Dispatcher
 * ========================================
 * Entry point for the test coverage analysis and generation engine.
 *
 * Usage:
 *   npx ts-node run.ts --mode analyze --path /project --engine commerce
 *   npx ts-node run.ts --list-engines
 */

import { resolve } from "path";
import { existsSync } from "fs";

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

interface Args {
  mode: "analyze" | "generate" | "full";
  path: string;
  engine: string | null;
  name: string | null;
  module: string | null;
  output: string | null;
  listEngines: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Args = {
    mode: "analyze",
    path: ".",
    engine: null,
    name: null,
    module: null,
    output: null,
    listEngines: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--mode":
        parsed.mode = args[++i] as Args["mode"];
        break;
      case "--path":
        parsed.path = args[++i];
        break;
      case "--engine":
        parsed.engine = args[++i];
        break;
      case "--name":
        parsed.name = args[++i];
        break;
      case "--module":
        parsed.module = args[++i];
        break;
      case "--output":
        parsed.output = args[++i];
        break;
      case "--list-engines":
        parsed.listEngines = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }

  return parsed;
}

function printHelp(): void {
  console.log(`
BMAD Test Coverage Agent

Usage:
  npx ts-node run.ts [options]

Options:
  --mode <analyze|generate|full>   Operation mode (default: analyze)
  --path <dir>                     Path to project root (default: .)
  --engine <engine>                Platform engine (auto-detect if omitted)
  --name <name>                    Report title
  --module <name>                  Scope to specific module/package
  --output <dir>                   Output directory for reports
  --list-engines                   List available engines
  --help                           Show this help

Engines:
  commerce      Adobe Commerce / Magento 2
  aem           AEM as a Cloud Service
  eds           Edge Delivery Services
  eds-commerce  EDS + Commerce Hybrid
`);
}

// ---------------------------------------------------------------------------
// Engine Registry
// ---------------------------------------------------------------------------

import { getEngine, listEngines } from "./engines/registry";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.listEngines) {
    listEngines();
    return;
  }

  const projectPath = resolve(args.path);
  if (!existsSync(projectPath)) {
    console.error(`❌ Project path not found: ${projectPath}`);
    process.exit(1);
  }

  const engine = getEngine(args.engine, projectPath);
  if (!engine) {
    console.error("❌ Could not detect platform engine. Use --engine to specify.");
    process.exit(1);
  }

  console.log(`🧪 BMAD Test Coverage Agent`);
  console.log(`   Path:   ${projectPath}`);
  console.log(`   Engine: ${engine.name}`);
  console.log(`   Mode:   ${args.mode}`);
  if (args.module) console.log(`   Scope:  ${args.module}`);
  console.log("");

  switch (args.mode) {
    case "analyze":
      await engine.analyzeCoverage(projectPath, {
        name: args.name,
        module: args.module,
        output: args.output,
      });
      break;
    case "generate":
      await engine.generateTests(projectPath, {
        name: args.name,
        module: args.module,
        output: args.output,
      });
      break;
    case "full":
      await engine.analyzeCoverage(projectPath, {
        name: args.name,
        module: args.module,
        output: args.output,
      });
      await engine.generateTests(projectPath, {
        name: args.name,
        module: args.module,
        output: args.output,
      });
      break;
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
