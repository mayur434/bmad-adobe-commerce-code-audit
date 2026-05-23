#!/usr/bin/env npx ts-node
/**
 * BMAD Code Generation Agent — Dispatcher
 * =========================================
 * Entry point for the code generation engine.
 * Includes MCP setup automation for zero-config consumer experience.
 */

import * as fs from "fs";
import * as path from "path";

const SKILL_ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(SKILL_ROOT, "assets");

function setupMcp(projectRoot: string): void {
  const mcpSource = path.join(ASSETS_DIR, "sample.mcp.json");
  const registrySource = path.join(ASSETS_DIR, "mcp-registry.toml");

  // ── .mcp.json (project root) ──
  const mcpTarget = path.join(projectRoot, ".mcp.json");
  if (fs.existsSync(mcpTarget)) {
    const existing = JSON.parse(fs.readFileSync(mcpTarget, "utf-8"));
    const ours = JSON.parse(fs.readFileSync(mcpSource, "utf-8"));

    const mergedServers = existing.mcpServers ?? {};
    for (const [key, val] of Object.entries(ours.mcpServers)) {
      if (key.startsWith("_comment")) continue;
      if (!(key in mergedServers)) {
        mergedServers[key] = val;
        console.log(`  + Added MCP server: ${key}`);
      } else {
        console.log(`  ~ Skipped (already exists): ${key}`);
      }
    }

    existing.mcpServers = mergedServers;
    fs.writeFileSync(mcpTarget, JSON.stringify(existing, null, 2));
    console.log(`  ✓ Merged into ${mcpTarget}`);
  } else {
    const data = JSON.parse(fs.readFileSync(mcpSource, "utf-8"));
    data.mcpServers = Object.fromEntries(
      Object.entries(data.mcpServers).filter(([k]) => !k.startsWith("_comment"))
    );
    fs.writeFileSync(mcpTarget, JSON.stringify(data, null, 2));
    console.log(`  ✓ Created ${mcpTarget}`);
  }

  // ── .bmad/mcp-registry.toml ──
  const bmadDir = path.join(projectRoot, ".bmad");
  if (!fs.existsSync(bmadDir)) fs.mkdirSync(bmadDir, { recursive: true });
  const registryTarget = path.join(bmadDir, "mcp-registry.toml");
  fs.copyFileSync(registrySource, registryTarget);
  console.log(`  ✓ Installed ${registryTarget}`);

  // ── .env template (if missing) ──
  const envTarget = path.join(projectRoot, ".env");
  if (!fs.existsSync(envTarget)) {
    fs.writeFileSync(
      envTarget,
      [
        "# AEM MCP — Local SDK connection",
        "AEM_HOST=http://localhost:4502",
        "AEM_USER=admin",
        "AEM_PASSWORD=admin",
        "AEM_INSTANCES_CONFIG=~/aem-instances.yaml",
        "",
      ].join("\n")
    );
    console.log(`  ✓ Created ${envTarget} (local SDK defaults)`);
  } else {
    console.log("  ~ .env already exists, skipped");
  }

  // ── .gitignore additions ──
  const gitignore = path.join(projectRoot, ".gitignore");
  const entriesNeeded = [".env", ".bmad/"];
  if (fs.existsSync(gitignore)) {
    const content = fs.readFileSync(gitignore, "utf-8");
    const added = entriesNeeded.filter((e) => !content.includes(e));
    if (added.length > 0) {
      fs.appendFileSync(
        gitignore,
        "\n# BMAD MCP config (local secrets)\n" + added.join("\n") + "\n"
      );
      console.log(`  ✓ Added to .gitignore: ${added.join(", ")}`);
    }
  }

  console.log();
  console.log("  MCP setup complete.");
  console.log(
    "  → Remote (Adobe Cloud): Sign in with Adobe ID when prompted by your IDE"
  );
  console.log(
    "  → Local (AEM SDK): Ensure local instance is running on localhost:4502"
  );
}

function detectProject(projectRoot: string): void {
  const checks: Record<string, string> = {
    "core/": "Java source (Sling Models, OSGi Services)",
    "ui.apps/": "Component definitions (HTL, dialogs)",
    "ui.content/": "Content (templates, policies, pages)",
    "ui.frontend/": "Frontend build (CSS/JS)",
    "ui.config/": "OSGi configurations (AEMaaCS)",
    "dispatcher/": "Dispatcher configs",
    "all/": "All-in-one package",
  };

  console.log("AEM Project Detection:");
  let found = 0;
  for (const [folder, desc] of Object.entries(checks)) {
    const fullPath = path.join(projectRoot, folder);
    if (fs.existsSync(fullPath)) {
      console.log(`  ✓ ${folder.padEnd(15)} ${desc}`);
      found++;
    } else {
      console.log(`  ✗ ${folder.padEnd(15)} (not found)`);
    }
  }

  // Platform detection
  const hasUiConfig = fs.existsSync(path.join(projectRoot, "ui.config/"));
  const hasRunmodeFolders = fs.existsSync(
    path.join(projectRoot, "ui.apps/src/main/content/jcr_root/apps")
  );

  if (hasUiConfig) {
    console.log("\n  Platform: AEMaaCS (ui.config/ detected)");
  } else if (hasRunmodeFolders) {
    console.log("\n  Platform: AEM AMS (runmode config folders detected)");
  }

  if (found === 0) {
    console.log(
      "\n  ⚠ No AEM project structure detected. Is this the right directory?"
    );
  } else {
    console.log(`\n  Found ${found}/${Object.keys(checks).length} AEM modules.`);
  }
}

function listTemplates(): void {
  const templatesDir = path.join(SKILL_ROOT, "templates");
  console.log("Available generation templates:");
  if (fs.existsSync(templatesDir)) {
    const files = fs
      .readdirSync(templatesDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    for (const f of files) {
      console.log(`  • ${path.parse(f).name}`);
    }
  } else {
    console.log("  (none found)");
  }
}

// ── CLI ──
function main(): void {
  const args = process.argv.slice(2);
  const projectRoot = path.resolve(
    args.includes("--path")
      ? args[args.indexOf("--path") + 1]
      : "."
  );

  if (args.includes("--setup")) {
    console.log("⚡ BMAD Code Generation Agent — MCP Setup");
    console.log(`   Project: ${projectRoot}\n`);
    setupMcp(projectRoot);
    return;
  }

  if (args.includes("--detect")) {
    detectProject(projectRoot);
    return;
  }

  if (args.includes("--list-templates")) {
    listTemplates();
    return;
  }

  const engine = args.includes("--engine")
    ? args[args.indexOf("--engine") + 1]
    : "auto-detect";
  const scaffold = args.includes("--scaffold");

  console.log("⚡ BMAD Code Generation Agent");
  console.log(`   Path: ${projectRoot}`);
  console.log(`   Engine: ${engine}`);
  console.log(`   Mode: ${scaffold ? "scaffold" : "generate"}`);
  console.log("\n⚠️  Not yet implemented. Add generation logic to scripts/engines/");
}

main();
