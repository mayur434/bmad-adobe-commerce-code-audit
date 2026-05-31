#!/usr/bin/env ts-node

/**
 * BMAD Pre-Commit Agent — CLI Dispatcher
 * ----------------------------------------
 * Usage:
 *   npx ts-node run.ts                        ← reviews staged git diff
 *   npx ts-node run.ts --diff path/file.diff  ← reviews a specific diff file
 *   npx ts-node run.ts --threshold HIGH        ← override block severity
 *   npx ts-node run.ts --list-engines          ← list available engines
 *   npx ts-node run.ts --help                  ← show usage
 *
 * Requirements:
 *   - Node.js >= 18 (native fetch)
 *   - ANTHROPIC_API_KEY env var set
 */

import { detectEngine, resolveEngine } from "./engines/registry";
import { paint } from "./shared/output";

const args = process.argv.slice(2);

// ─── --help ───────────────────────────────────────────────────────────────────

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage:
  npx ts-node run.ts                       Review staged git diff
  npx ts-node run.ts --diff <file>         Review a specific .diff file
  npx ts-node run.ts --threshold <level>   Override block severity (NONE|LOW|MEDIUM|HIGH|CRITICAL)
  npx ts-node run.ts --list-engines        List available engines
  npx ts-node run.ts --help                Show this help

Environment:
  ANTHROPIC_API_KEY    Required — your Anthropic API key
  BLOCK_SEVERITY       Optional — override block severity threshold
`);
  process.exit(0);
}

// ─── --list-engines ───────────────────────────────────────────────────────────

if (args.includes("--list-engines")) {
  console.log("\nAvailable engines:\n  git   Git staged diff reviewer (✅ implemented)\n");
  process.exit(0);
}

// ─── Preflight: check Node version ───────────────────────────────────────────

const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  console.error(paint("\n[reviewer] Node.js >= 18 required (for native fetch). Current: " + process.version, "red"));
  process.exit(1);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

(async () => {
  const engineId = detectEngine();

  try {
    const engine = await resolveEngine(engineId);
    await engine.run(args);
  } catch (err) {
    console.error(paint("\n[reviewer] Fatal: " + (err as Error).message, "red"));
    process.exit(0); // Fail open on unexpected errors
  }
})();
