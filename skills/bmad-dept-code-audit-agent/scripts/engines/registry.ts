/**
 * Engine Registry
 * ================
 * Maps platform identifiers to their engine modules and detection logic.
 * New engines register here to be discoverable by the dispatcher.
 */

import * as fs from "fs";
import * as path from "path";

interface EngineEntry {
  description: string;
  detect: (projectPath: string) => boolean;
  module: string;
}

const ENGINES: Record<string, EngineEntry> = {};

export function register(
  platformId: string,
  description: string,
  detectFn: (projectPath: string) => boolean,
  modulePath: string
): void {
  ENGINES[platformId] = {
    description,
    detect: detectFn,
    module: modulePath,
  };
}

export function detectPlatform(projectPath: string): string[] {
  const matches: string[] = [];
  for (const [pid, engine] of Object.entries(ENGINES)) {
    if (engine.detect(projectPath)) {
      matches.push(pid);
    }
  }
  return matches;
}

export function getEngine(platformId: string): EngineEntry | undefined {
  return ENGINES[platformId];
}

export function listEngines(): Array<[string, string]> {
  return Object.entries(ENGINES).map(([pid, eng]) => [pid, eng.description]);
}

// ─── Detection Functions ──────────────────────────────────────────────────

function detectCommerce(p: string): boolean {
  const indicators = [
    fs.existsSync(path.join(p, "app", "code")),
    fs.existsSync(path.join(p, "composer.json")),
    fs.existsSync(path.join(p, "app", "etc")),
  ];
  return indicators.filter(Boolean).length >= 2;
}

function detectAem(p: string): boolean {
  const indicators = [
    fs.existsSync(path.join(p, "ui.apps")),
    fs.existsSync(path.join(p, "ui.content")),
    fs.existsSync(path.join(p, "core")),
    fs.existsSync(path.join(p, "pom.xml")),
  ];
  return indicators.filter(Boolean).length >= 2;
}

function detectEds(p: string): boolean {
  const indicators = [
    fs.existsSync(path.join(p, "blocks")),
    fs.existsSync(path.join(p, "scripts")),
    fs.existsSync(path.join(p, "fstab.yaml")),
    fs.existsSync(path.join(p, "helix-query.yaml")),
    fs.existsSync(path.join(p, "paths.json")),
  ];
  return indicators.filter(Boolean).length >= 2;
}

function detectEdsCommerce(p: string): boolean {
  if (!detectEds(p)) return false;
  const blocksDir = path.join(p, "blocks");
  if (fs.existsSync(blocksDir)) {
    const items = fs.readdirSync(blocksDir);
    for (const item of items) {
      if (item.startsWith("commerce-") || item.startsWith("product-")) {
        return true;
      }
    }
  }
  return false;
}

// ─── Register Built-in Engines ────────────────────────────────────────────

register("commerce", "Adobe Commerce / Magento 2", detectCommerce, "engines/commerce/audit");
register("aem", "AEM as a Cloud Service", detectAem, "engines/aem/audit");
register("eds", "Edge Delivery Services", detectEds, "engines/eds/audit");
register("eds-commerce", "EDS + Commerce Hybrid", detectEdsCommerce, "engines/eds_commerce/audit");
