/**
 * BMAD Code Scan Agent — Engine Registry
 * =========================================
 * Auto-detects platform engine or resolves explicit engine ID.
 */

import { existsSync } from "fs";
import { join } from "path";
import { BaseEngine } from "../shared/base";

// ---------------------------------------------------------------------------
// Engine imports (add new engines here)
// ---------------------------------------------------------------------------

// import { CommerceEngine } from "./commerce/scan";
// import { AemEngine } from "./aem/scan";
// import { EdsEngine } from "./eds/scan";
// import { EdsCommerceEngine } from "./eds_commerce/scan";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface EngineEntry {
  id: string;
  name: string;
  detect: (projectPath: string) => boolean;
  create: () => BaseEngine;
}

const ENGINES: EngineEntry[] = [
  {
    id: "commerce",
    name: "Adobe Commerce / Magento 2",
    detect: (p) =>
      existsSync(join(p, "composer.json")) &&
      (existsSync(join(p, "app/etc/env.php")) || existsSync(join(p, "app/code"))),
    create: () => {
      // TODO: return new CommerceEngine();
      throw new Error("Commerce scan engine not yet implemented");
    },
  },
  {
    id: "aem",
    name: "AEM as a Cloud Service",
    detect: (p) =>
      existsSync(join(p, "pom.xml")) &&
      (existsSync(join(p, "ui.apps")) || existsSync(join(p, "core"))),
    create: () => {
      // TODO: return new AemEngine();
      throw new Error("AEM scan engine not yet implemented");
    },
  },
  {
    id: "eds",
    name: "Edge Delivery Services",
    detect: (p) =>
      existsSync(join(p, "scripts")) &&
      existsSync(join(p, "blocks")) &&
      existsSync(join(p, "helix-query.yaml")),
    create: () => {
      // TODO: return new EdsEngine();
      throw new Error("EDS scan engine not yet implemented");
    },
  },
  {
    id: "eds-commerce",
    name: "EDS + Commerce Hybrid",
    detect: (p) =>
      existsSync(join(p, "blocks")) &&
      (existsSync(join(p, "scripts/commerce.js")) || existsSync(join(p, "commerce"))),
    create: () => {
      // TODO: return new EdsCommerceEngine();
      throw new Error("EDS Commerce scan engine not yet implemented");
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getEngine(engineId: string | null, projectPath: string): BaseEngine | null {
  if (engineId) {
    const entry = ENGINES.find((e) => e.id === engineId);
    if (!entry) {
      console.error(`❌ Unknown engine: ${engineId}`);
      listEngines();
      return null;
    }
    return entry.create();
  }

  // Auto-detect
  for (const entry of ENGINES) {
    if (entry.detect(projectPath)) {
      console.log(`✓ Auto-detected engine: ${entry.name}`);
      return entry.create();
    }
  }

  return null;
}

export function listEngines(): void {
  console.log("Available scan engines:");
  console.log("");
  for (const entry of ENGINES) {
    console.log(`  ${entry.id.padEnd(15)} ${entry.name}`);
  }
}

export function detectPlatform(projectPath: string): string | null {
  for (const entry of ENGINES) {
    if (entry.detect(projectPath)) return entry.id;
  }
  return null;
}
