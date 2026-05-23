/**
 * BMAD Code Scan Agent — Base Engine
 * =====================================
 * Abstract base class for platform-specific scan engines.
 */

export interface ScanOptions {
  quick: boolean;
  output: string | null;
}

export interface ScanFinding {
  file: string;
  line: number | null;
  rule: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  category: string;
}

export interface ScanReport {
  projectName: string;
  engine: string;
  mode: "quick" | "full";
  totalFiles: number;
  filesScanned: number;
  findings: ScanFinding[];
  summary: Record<string, number>;
}

export abstract class BaseEngine {
  abstract readonly name: string;
  abstract readonly id: string;

  /**
   * Run static analysis scan on the project.
   */
  abstract scan(projectPath: string, options: ScanOptions): Promise<ScanReport>;
}
