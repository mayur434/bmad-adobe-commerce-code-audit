// ─── Engine registry ──────────────────────────────────────────────────────────
// Add new platform engines here as they are implemented.
// Each engine exports a run(config, args) function.

export type EngineId = "git";

export interface Engine {
  id:          EngineId;
  description: string;
  run:         (args: string[]) => Promise<void>;
}

export async function resolveEngine(id: EngineId): Promise<Engine> {
  switch (id) {
    case "git": {
      const mod = await import("./git/audit");
      return { id: "git", description: "Git staged diff security reviewer", run: mod.run };
    }
    default:
      throw new Error(`Unknown engine: ${id}. Available: git`);
  }
}

export function detectEngine(): EngineId {
  // Only one engine for now — git diff reviewer
  // Future: detect Adobe Commerce, AEM, EDS etc. from project signals
  return "git";
}
