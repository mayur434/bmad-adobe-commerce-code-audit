/**
 * BMAD Code Generation Agent — Base Types
 * ==========================================
 * Shared interfaces for code generation engines.
 */

export interface GenerationOptions {
  platform: string | null;
  template: string | null;
  output: string | null;
  scaffold: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
  action: "create" | "modify" | "append";
}

export interface GenerationResult {
  platform: string;
  strategy: "mcp" | "llm-skill" | "hybrid";
  files: GeneratedFile[];
  instructions: string[];
}
