#!/usr/bin/env npx ts-node
/**
 * BMAD DEPT Code Agent — Unified Dispatcher
 * ============================================
 * Single entry point for all platform-specific audit engines.
 *
 * Auto-detects project type or accepts explicit --engine flag.
 * Dispatches to the appropriate engine under engines/<platform>/audit.ts.
 *
 * Usage:
 *   npx ts-node run.ts --path /path/to/project                    # auto-detect platform
 *   npx ts-node run.ts --path /path/to/project --engine commerce  # explicit engine
 *   npx ts-node run.ts --list-engines                             # show available engines
 */

import * as fs from "fs";
import * as path from "path";
import { detectPlatform, getEngine, listEngines } from "./engines/registry";

function parseArgs(argv: string[]): { engine?: string; path?: string; format?: string; listEngines: boolean; help: boolean; remaining: string[] } {
  const result = { engine: undefined as string | undefined, path: undefined as string | undefined, format: undefined as string | undefined, listEngines: false, help: false, remaining: [] as string[] };
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "--engine" && i + 1 < argv.length) {
      result.engine = argv[++i];
    } else if (argv[i] === "--path" && i + 1 < argv.length) {
      result.path = argv[++i];
    } else if (argv[i] === "--format" && i + 1 < argv.length) {
      result.format = argv[++i];
    } else if (argv[i] === "--list-engines") {
      result.listEngines = true;
    } else if (argv[i] === "-h" || argv[i] === "--help") {
      result.help = true;
    } else {
      result.remaining.push(argv[i]);
    }
    i++;
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.listEngines) {
    console.log("Available audit engines:");
    console.log("─".repeat(50));
    for (const [eid, desc] of listEngines()) {
      console.log(`  ${eid.padEnd(15)} ${desc}`);
    }
    console.log(`\nUsage: npx ts-node run.ts --engine <name> --path /project [engine-specific flags]`);
    return;
  }

  if (args.help && !args.engine) {
    console.log("BMAD DEPT Code Agent — Unified Dispatcher\n");
    console.log("Usage:");
    console.log("  npx ts-node run.ts --path <project>              Auto-detect and audit");
    console.log("  npx ts-node run.ts --engine <name> --path <path> Explicit engine");
    console.log("  npx ts-node run.ts --format <type>               Output format: excel, md, pdf, all");
    console.log("  npx ts-node run.ts --list-engines                Show available engines");
    console.log("\nEngine-specific help: npx ts-node run.ts --engine <name> --help");
    return;
  }

  // Resolve project path
  let projectPath = args.path;
  if (projectPath) {
    projectPath = path.resolve(projectPath);
    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      console.error(`❌ Error: Project path does not exist: ${projectPath}`);
      process.exit(1);
    }
  }

  // Determine engine
  let engineId = args.engine;
  if (!engineId) {
    if (!projectPath) {
      console.error("❌ Error: Either --engine or --path is required.");
      console.error("   Use --list-engines to see available platforms.");
      process.exit(1);
    }

    const detected = detectPlatform(projectPath);
    if (detected.length === 0) {
      console.error(`❌ Could not auto-detect project type at: ${projectPath}`);
      console.error("   Use --engine to specify explicitly. Available engines:");
      for (const [eid, desc] of listEngines()) {
        console.error(`     ${eid.padEnd(15)} ${desc}`);
      }
      process.exit(1);
    }

    if (detected.length > 1) {
      engineId = detected.includes("eds-commerce") ? "eds-commerce" : detected[0];
      console.log(`🔍 Multiple platforms detected: ${detected.join(", ")}`);
      console.log(`   Using: ${engineId} (override with --engine)`);
    } else {
      engineId = detected[0];
      console.log(`🔍 Detected platform: ${engineId}`);
    }
  }

  // Validate engine exists
  const engineCfg = getEngine(engineId);
  if (!engineCfg) {
    console.error(`❌ Unknown engine: ${engineId}`);
    console.error("   Available engines:");
    for (const [eid, desc] of listEngines()) {
      console.error(`     ${eid.padEnd(15)} ${desc}`);
    }
    process.exit(1);
  }

  // Build forwarded argv for the engine
  const engineArgv: string[] = [];
  if (projectPath) {
    engineArgv.push("--path", projectPath);
  }
  if (args.format) {
    engineArgv.push("--format", args.format);
  }
  engineArgv.push(...args.remaining);
  if (args.help) {
    engineArgv.push("--help");
  }

  // Dispatch to engine
  const engineDirName = engineId.replace(/-/g, "_");
  let engineDir = path.join(__dirname, "engines", engineDirName);
  if (!fs.existsSync(engineDir)) {
    engineDir = path.join(__dirname, "engines", engineId);
  }

  if (!fs.existsSync(engineDir)) {
    console.error(`⚠️  Engine '${engineId}' is registered but not yet implemented.`);
    console.error(`   Expected directory: engines/${engineId}/`);
    console.error(`   Create engines/${engineId}/audit.ts to implement this engine.`);
    process.exit(1);
  }

  const engineEntry = path.join(engineDir, "audit.ts");
  if (!fs.existsSync(engineEntry)) {
    console.error(`⚠️  Engine '${engineId}' directory exists but audit.ts not found.`);
    console.error(`   Expected: ${engineEntry}`);
    process.exit(1);
  }

  // Override process.argv for the engine's arg parsing
  process.argv = ["ts-node", "audit.ts", ...engineArgv];

  console.log(`\n${"=".repeat(60)}`);
  console.log(` Dispatching to: ${engineCfg.description}`);
  console.log(`${"=".repeat(60)}\n`);

  // Import and run the engine
  const engine = await import(engineEntry);
  if (typeof engine.main === "function") {
    await engine.main();
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
