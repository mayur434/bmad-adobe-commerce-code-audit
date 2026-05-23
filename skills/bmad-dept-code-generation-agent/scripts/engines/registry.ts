/**
 * BMAD Code Generation Agent — Engine Registry
 * ===============================================
 * Detects project platform for code generation strategy selection.
 * Unlike scanner agents, the generation agent routes to:
 *   - MCP servers (AEMaaCS)
 *   - LLM skill templates (AMS, Commerce)
 */

import { existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface PlatformEntry {
  id: string;
  name: string;
  strategy: "mcp" | "llm-skill" | "hybrid";
  detect: (projectPath: string) => boolean;
}

const PLATFORMS: PlatformEntry[] = [
  {
    id: "aemcs",
    name: "AEM as a Cloud Service",
    strategy: "mcp",
    detect: (p) =>
      existsSync(join(p, "pom.xml")) &&
      (existsSync(join(p, "ui.apps")) || existsSync(join(p, "ui.config"))),
  },
  {
    id: "ams",
    name: "AEM Managed Services",
    strategy: "llm-skill",
    detect: (p) =>
      existsSync(join(p, "pom.xml")) &&
      existsSync(join(p, "ui.apps")) &&
      !existsSync(join(p, "ui.config")),
  },
  {
    id: "commerce",
    name: "Adobe Commerce / Magento 2",
    strategy: "llm-skill",
    detect: (p) =>
      existsSync(join(p, "composer.json")) &&
      (existsSync(join(p, "app/etc/env.php")) || existsSync(join(p, "app/code"))),
  },
  {
    id: "eds",
    name: "Edge Delivery Services",
    strategy: "llm-skill",
    detect: (p) =>
      existsSync(join(p, "scripts")) &&
      existsSync(join(p, "blocks")) &&
      existsSync(join(p, "helix-query.yaml")),
  },
  {
    id: "eds-commerce",
    name: "EDS + Commerce Hybrid",
    strategy: "hybrid",
    detect: (p) =>
      existsSync(join(p, "blocks")) &&
      (existsSync(join(p, "scripts/commerce.js")) || existsSync(join(p, "commerce"))),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectPlatform(projectPath: string): PlatformEntry | null {
  for (const entry of PLATFORMS) {
    if (entry.detect(projectPath)) {
      return entry;
    }
  }
  return null;
}

export function getPlatform(platformId: string): PlatformEntry | undefined {
  return PLATFORMS.find((e) => e.id === platformId);
}

export function listPlatforms(): void {
  console.log("Available generation platforms:");
  console.log("");
  for (const entry of PLATFORMS) {
    console.log(`  ${entry.id.padEnd(15)} ${entry.name.padEnd(30)} [${entry.strategy}]`);
  }
}
