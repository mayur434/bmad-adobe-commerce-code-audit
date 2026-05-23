#!/usr/bin/env ts-node
/**
 * BMAD Impact Analysis Agent — Dispatcher
 * ==========================================
 * Entry point for the impact analysis engine.
 *
 * Usage:
 *   npx ts-node run.ts --path /project --engine commerce
 *   npx ts-node run.ts --trace --path /project
 *   npx ts-node run.ts --upgrade-risk --from 2.4.6 --to 2.4.7
 *   npx ts-node run.ts --list-engines
 */

import { resolve } from "path";
import { existsSync } from "fs";

interface Args {
  path: string;
  engine: string | null;
  mode: "analyze" | "trace" | "upgrade-risk";
  fromVersion: string | null;
  toVersion: string | null;
  target: string | null;
  listEngines: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Args = {
    path: ".",
    engine: null,
    mode: "analyze",
    fromVersion: null,
    toVersion: null,
    target: null,
    listEngines: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--path": parsed.path = args[++i]; break;
      case "--engine": parsed.engine = args[++i]; break;
      case "--trace": parsed.mode = "trace"; break;
      case "--upgrade-risk": parsed.mode = "upgrade-risk"; break;
      case "--from": parsed.fromVersion = args[++i]; break;
      case "--to": parsed.toVersion = args[++i]; break;
      case "--target": parsed.target = args[++i]; break;
      case "--list-engines": parsed.listEngines = true; break;
      case "--help":
        console.log(`BMAD Impact Analysis Agent\n\nUsage:\n  npx ts-node run.ts [options]\n\nOptions:\n  --path <dir>         Project root (default: .)\n  --engine <id>        Platform engine (auto-detect if omitted)\n  --trace              Trace dependency chains for --target\n  --upgrade-risk       Assess upgrade risk (use --from / --to)\n  --from <version>     Source version for upgrade risk\n  --to <version>       Target version for upgrade risk\n  --target <class>     Class/module to trace\n  --list-engines       List available engines\n  --help               Show this help`);
        process.exit(0);
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.listEngines) {
    console.log("Available impact analysis engines:");
    console.log("  commerce        Adobe Commerce / Magento 2");
    console.log("  aem             AEM as a Cloud Service");
    console.log("  eds             Edge Delivery Services");
    console.log("  eds-commerce    EDS + Commerce Hybrid");
    return;
  }

  const projectPath = resolve(args.path);
  if (!existsSync(projectPath)) {
    console.error(`❌ Project path not found: ${projectPath}`);
    process.exit(1);
  }

  console.log(`💥 BMAD Impact Analysis Agent`);
  console.log(`   Path:   ${projectPath}`);
  console.log(`   Engine: ${args.engine || "auto-detect"}`);
  console.log(`   Mode:   ${args.mode}`);
  if (args.target) console.log(`   Target: ${args.target}`);
  if (args.fromVersion) console.log(`   From:   ${args.fromVersion}`);
  if (args.toVersion) console.log(`   To:     ${args.toVersion}`);
  console.log("");
  console.log("   TODO: Implement impact analysis engines.");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
