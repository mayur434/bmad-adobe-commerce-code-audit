/**
 * Preflight Validation
 * =====================
 * Pre-run checks before dispatching to an engine:
 *   1. Engine availability — scripts exist and are runnable
 *   2. LLM model auto-detection — identifies model from runtime context
 *   3. Project size estimation — counts source files/LOC to gauge token needs
 *   4. Mode viability — compares project size against model's context window
 *   5. User confirmation prompt with mode recommendation
 *
 * Everything is auto-detected. No user configuration required.
 *   PREFLIGHT_SKIP=1  — only env var: bypass all checks (for CI)
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ─── Known Model Registry ─────────────────────────────────────────────────
// Context windows for known models (tokens). Used for capacity estimation.

const MODEL_REGISTRY: Record<string, { contextWindow: number; tier: "small" | "medium" | "large" }> = {
  // Anthropic
  "claude-opus-4": { contextWindow: 200000, tier: "large" },
  "claude-sonnet-4": { contextWindow: 200000, tier: "large" },
  "claude-3.5-sonnet": { contextWindow: 200000, tier: "large" },
  "claude-3-opus": { contextWindow: 200000, tier: "large" },
  "claude-3-sonnet": { contextWindow: 200000, tier: "large" },
  "claude-3-haiku": { contextWindow: 200000, tier: "medium" },
  // OpenAI
  "gpt-4o": { contextWindow: 128000, tier: "large" },
  "gpt-4-turbo": { contextWindow: 128000, tier: "large" },
  "gpt-4": { contextWindow: 8192, tier: "small" },
  "gpt-3.5-turbo": { contextWindow: 16384, tier: "small" },
  "o1": { contextWindow: 200000, tier: "large" },
  "o1-mini": { contextWindow: 128000, tier: "medium" },
  "o3": { contextWindow: 200000, tier: "large" },
  "o3-mini": { contextWindow: 200000, tier: "medium" },
  "o4-mini": { contextWindow: 200000, tier: "medium" },
  // Google
  "gemini-2.5-pro": { contextWindow: 1000000, tier: "large" },
  "gemini-2.0-flash": { contextWindow: 1000000, tier: "medium" },
  "gemini-1.5-pro": { contextWindow: 2000000, tier: "large" },
  "gemini-1.5-flash": { contextWindow: 1000000, tier: "medium" },
  // Fallback
  "unknown": { contextWindow: 128000, tier: "medium" },
};

// Approximate tokens-per-LOC for source code (conservative: ~4 tokens/line avg)
const TOKENS_PER_LOC = 4;

// Overhead multiplier: scanner output + prompt framing consumes ~30% of context
const OVERHEAD_FACTOR = 0.7;

// Minimum LOC thresholds per mode (how much code the LLM needs to analyze)
const MODE_MIN_CONTEXT = {
  script: 0, // No LLM needed
  deep: 2000, // LLM needs to see significant code
  full: 2000, // Same code + scanner results in context
};

// ─── Interfaces ───────────────────────────────────────────────────────────

export interface PreflightResult {
  engineReady: boolean;
  modelName: string;
  modelContextWindow: number;
  projectFiles: number;
  projectLOC: number;
  estimatedTokens: number;
  canScript: boolean;
  canDeep: boolean;
  canFull: boolean;
  recommendation: "script" | "deep" | "full";
  warnings: string[];
}

export type AuditMode = "script" | "deep" | "full";

// ─── Model Auto-Detection ─────────────────────────────────────────────────

function detectModel(): { name: string; contextWindow: number } {
  // Try known environment variables from various AI providers/runtimes
  const envCandidates = [
    process.env.ANTHROPIC_MODEL,
    process.env.OPENAI_MODEL,
    process.env.COPILOT_MODEL,
    process.env.AI_MODEL,
    process.env.LLM_MODEL,
    process.env.MODEL_ID,
    process.env.CLAUDE_MODEL,
  ];

  for (const candidate of envCandidates) {
    if (candidate) {
      const match = findModelEntry(candidate);
      if (match) return match;
    }
  }

  // Try reading from BMAD customize.toml if present
  const customizePaths = [
    path.join(__dirname, "..", "customize.toml"),
    path.join(__dirname, "..", "..", "customize.toml"),
  ];
  for (const p of customizePaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      const modelMatch = content.match(/model\s*=\s*["']([^"']+)["']/);
      if (modelMatch) {
        const match = findModelEntry(modelMatch[1]);
        if (match) return match;
      }
    }
  }

  // Default: assume a capable model (most BMAD users run Claude/GPT-4o)
  return { name: "auto-detected (large)", contextWindow: 200000 };
}

function findModelEntry(input: string): { name: string; contextWindow: number } | null {
  const normalized = input.toLowerCase().trim();

  // Direct match
  if (MODEL_REGISTRY[normalized]) {
    return { name: normalized, contextWindow: MODEL_REGISTRY[normalized].contextWindow };
  }

  // Partial match (e.g. "claude-3-5-sonnet-20241022" → "claude-3.5-sonnet")
  for (const [key, entry] of Object.entries(MODEL_REGISTRY)) {
    if (key === "unknown") continue;
    const keyParts = key.replace(/[.-]/g, "");
    const inputParts = normalized.replace(/[.-]/g, "");
    if (inputParts.includes(keyParts) || keyParts.includes(inputParts)) {
      return { name: key, contextWindow: entry.contextWindow };
    }
  }

  return null;
}

// ─── Project Size Estimation ──────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set([
  ".php", ".xml", ".phtml", ".js", ".ts", ".jsx", ".tsx",
  ".java", ".kt", ".groovy", ".html", ".htl", ".css", ".scss",
  ".json", ".yaml", ".yml", ".graphql", ".sql",
]);

function estimateProjectSize(projectPath: string): { files: number; loc: number } {
  let files = 0;
  let loc = 0;

  const ignoreDirs = new Set(["node_modules", "vendor", "target", ".git", "dist", "build", "generated", "var", "pub/static"]);

  function walk(dir: string, depth: number): void {
    if (depth > 10) return; // Prevent runaway recursion
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.isDirectory()) continue;
      if (ignoreDirs.has(entry.name) && entry.isDirectory()) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
          files++;
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            loc += content.split("\n").length;
          } catch {
            loc += 100; // Estimate if unreadable
          }
        }
      }
    }
  }

  walk(projectPath, 0);
  return { files, loc };
}

// ─── Engine Availability Check ────────────────────────────────────────────

export function checkEngineAvailability(engineId: string, scriptsDir: string): { ready: boolean; issues: string[] } {
  const issues: string[] = [];
  const engineDirName = engineId.replace(/-/g, "_");

  let engineDir = path.join(scriptsDir, "engines", engineDirName);
  if (!fs.existsSync(engineDir)) {
    engineDir = path.join(scriptsDir, "engines", engineId);
  }

  if (!fs.existsSync(engineDir)) {
    issues.push(`Engine directory not found: engines/${engineId}/`);
    return { ready: false, issues };
  }

  const auditEntry = path.join(engineDir, "audit.ts");
  if (!fs.existsSync(auditEntry)) {
    issues.push(`Engine entry point missing: engines/${engineId}/audit.ts`);
    return { ready: false, issues };
  }

  const configFile = path.join(engineDir, "config.ts");
  if (!fs.existsSync(configFile)) {
    issues.push(`Engine config missing: engines/${engineId}/config.ts (report generation may fail)`);
  }

  return { ready: issues.length === 0 || issues.every((i) => i.includes("may fail")), issues };
}

// ─── Full Preflight ───────────────────────────────────────────────────────

export function runPreflight(engineId: string, scriptsDir: string, projectPath?: string): PreflightResult {
  const engineCheck = checkEngineAvailability(engineId, scriptsDir);
  const model = detectModel();
  const warnings: string[] = [...engineCheck.issues];

  // Estimate project size
  let projectFiles = 0;
  let projectLOC = 0;
  if (projectPath && fs.existsSync(projectPath)) {
    const size = estimateProjectSize(projectPath);
    projectFiles = size.files;
    projectLOC = size.loc;
  }

  const estimatedTokens = projectLOC * TOKENS_PER_LOC;
  const usableContext = Math.floor(model.contextWindow * OVERHEAD_FACTOR);

  // Determine mode viability
  const canScript = engineCheck.ready; // Script only needs engine scripts
  const canDeep = estimatedTokens <= usableContext && projectLOC >= MODE_MIN_CONTEXT.deep;
  const canFull = estimatedTokens <= (usableContext * 0.6) && projectLOC >= MODE_MIN_CONTEXT.full; // Full needs room for scanner output too

  let recommendation: AuditMode = "full";
  if (!canFull && canDeep) {
    recommendation = "deep";
    warnings.push(
      `Project size (~${estimatedTokens.toLocaleString()} tokens) leaves limited room for scanner output. ` +
      `Deep audit recommended over full.`
    );
  } else if (!canDeep && canScript) {
    recommendation = "script";
    warnings.push(
      `Project size (~${estimatedTokens.toLocaleString()} tokens) exceeds model context ` +
      `(${usableContext.toLocaleString()} usable). Only script-based scan is viable.`
    );
  } else if (!canScript) {
    recommendation = "script";
    warnings.push("Engine not ready — script mode may still fail.");
  }

  // Small projects: if LOC < deep threshold, only script makes sense
  if (projectLOC > 0 && projectLOC < MODE_MIN_CONTEXT.deep) {
    recommendation = "script";
    if (!warnings.some((w) => w.includes("small"))) {
      warnings.push(`Project is small (${projectLOC} LOC). Script scan is sufficient.`);
    }
  }

  return {
    engineReady: engineCheck.ready,
    modelName: model.name,
    modelContextWindow: model.contextWindow,
    projectFiles,
    projectLOC,
    estimatedTokens,
    canScript,
    canDeep,
    canFull,
    recommendation,
    warnings,
  };
}

// ─── Display & Confirmation ───────────────────────────────────────────────

export function displayPreflightReport(result: PreflightResult, engineId: string): void {
  console.log("");
  console.log("┌──────────────────────────────────────────────────────────────┐");
  console.log("│                    PREFLIGHT VALIDATION                       │");
  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log(`│  Engine:       ${engineId.padEnd(46)}│`);
  console.log(`│  Status:       ${(result.engineReady ? "✅ Ready" : "❌ Not Available").padEnd(46)}│`);
  console.log(`│  Model:        ${result.modelName.padEnd(46)}│`);
  console.log(`│  Context:      ${(result.modelContextWindow.toLocaleString() + " tokens").padEnd(46)}│`);
  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log(`│  Project:      ${(result.projectFiles + " files / " + result.projectLOC.toLocaleString() + " LOC").padEnd(46)}│`);
  console.log(`│  Est. Tokens:  ${("~" + result.estimatedTokens.toLocaleString()).padEnd(46)}│`);
  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log("│  Mode Viability:                                             │");
  console.log(`│    Script (Tier 1):  ${(result.canScript ? "✅ Viable" : "❌ Engine not ready").padEnd(40)}│`);
  console.log(`│    Deep (Tier 2):    ${(result.canDeep ? "✅ Viable" : "❌ Project too large for context").padEnd(40)}│`);
  console.log(`│    Full (T1 + T2):   ${(result.canFull ? "✅ Viable" : "❌ Insufficient context headroom").padEnd(40)}│`);
  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log(`│  ➤ Recommendation:   ${result.recommendation.toUpperCase().padEnd(40)}│`);
  console.log("└──────────────────────────────────────────────────────────────┘");

  if (result.warnings.length > 0) {
    console.log("");
    for (const w of result.warnings) {
      console.log(`  ⚠️  ${w}`);
    }
  }
  console.log("");
}

export async function confirmProceed(result: PreflightResult): Promise<{ proceed: boolean; mode: AuditMode }> {
  // Non-interactive mode (CI/piped input)
  if (!process.stdin.isTTY || process.env.PREFLIGHT_SKIP === "1") {
    return { proceed: result.engineReady, mode: result.recommendation };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  try {
    if (!result.engineReady) {
      const answer = await ask("Engine is not fully available. Proceed anyway? (y/N): ");
      if (!answer.toLowerCase().startsWith("y")) {
        return { proceed: false, mode: result.recommendation };
      }
    }

    // If only script mode is viable, inform and confirm
    if (!result.canDeep) {
      console.log(`ℹ️  Only script-based analysis is viable for this project size.`);
      const answer = await ask("Proceed with script-only mode? (Y/n): ");
      if (answer.toLowerCase() === "n") {
        return { proceed: false, mode: "script" };
      }
      return { proceed: true, mode: "script" };
    }

    // If full is not viable but deep is, offer choice
    if (!result.canFull && result.canDeep) {
      console.log(`ℹ️  Full audit not viable for this project size. Available: script, deep`);
      const answer = await ask(`Select mode [${result.recommendation}]: `);
      const selected = (answer.trim().toLowerCase() || result.recommendation) as AuditMode;
      if (selected !== "script" && selected !== "deep") {
        console.log(`Invalid mode. Using: ${result.recommendation}`);
        return { proceed: true, mode: result.recommendation };
      }
      return { proceed: true, mode: selected };
    }

    // All modes available — confirm
    const answer = await ask(`Proceed with ${result.recommendation} mode? (Y/n/[s]cript/[d]eep/[f]ull): `);
    const a = answer.trim().toLowerCase();
    if (a === "n" || a === "no") {
      return { proceed: false, mode: result.recommendation };
    }
    if (a === "s" || a === "script") return { proceed: true, mode: "script" };
    if (a === "d" || a === "deep") return { proceed: true, mode: "deep" };
    if (a === "f" || a === "full") return { proceed: true, mode: "full" };
    return { proceed: true, mode: result.recommendation };
  } finally {
    rl.close();
  }
}
