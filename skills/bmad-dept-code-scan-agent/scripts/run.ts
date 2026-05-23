#!/usr/bin/env ts-node
/**
 * BMAD Code Scan Agent — Dispatcher
 * ====================================
 * Entry point for the code scanning engine.
 *
 * Usage:
 *   npx ts-node run.ts --path /project --engine commerce
 *   npx ts-node run.ts --quick --path /project
 *   npx ts-node run.ts --list-engines
 */

import { resolve } from "path";
import { existsSync } from "fs";

interface Args {
  path: string;
  engine: string | null;
  quick: boolean;
  listEngines: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Args = { path: ".", engine: null, quick: false, listEngines: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--path": parsed.path = args[++i]; break;
      case "--engine": parsed.engine = args[++i]; break;
      case "--quick": parsed.quick = true; break;
      case "--list-engines": parsed.listEngines = true; break;
      case "--help":
        console.log(`BMAD Code Scan Agent\n\nUsage:\n  npx ts-node run.ts [options]\n\nOptions:\n  --path <dir>       Project root (default: .)\n  --engine <id>      Platform engine (auto-detect if omitted)\n  --quick            Quick scan mode\n  --list-engines     List available engines\n  --help             Show this help`);
        process.exit(0);
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.listEngines) {
    console.log("Available scan engines:");
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

  console.log(`📡 BMAD Code Scan Agent`);
  console.log(`   Path:   ${projectPath}`);
  console.log(`   Engine: ${args.engine || "auto-detect"}`);
  console.log(`   Mode:   ${args.quick ? "quick" : "full"}`);
  console.log("");
  console.log("   TODO: Implement scanning engines.");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
