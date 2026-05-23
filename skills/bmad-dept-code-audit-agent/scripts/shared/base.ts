/**
 * Base Engine Interface
 * ======================
 * All platform engines should follow this interface for consistency.
 */

export interface AuditFinding {
  module: string;
  file: string;
  line: number;
  type: string;
  description: string;
  code: string;
  severity: string;
  recommendation: string;
  effort: string;
  impact: string;
  confidence: string;
  justification: string;
}

export type FindingsMap = Record<string, AuditFinding[]>;

export interface AuditEngine {
  readonly PLATFORM_ID: string;
  readonly PLATFORM_NAME: string;
  detect(path: string): boolean;
  scan(): FindingsMap;
  generateReport(findings: FindingsMap, outputPath: string): Promise<void>;
}

export abstract class BaseAuditEngine implements AuditEngine {
  abstract readonly PLATFORM_ID: string;
  abstract readonly PLATFORM_NAME: string;

  protected projectRoot: string;
  protected config: Record<string, unknown>;

  constructor(projectRoot: string, config: Record<string, unknown> = {}) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  abstract detect(path: string): boolean;
  abstract scan(): FindingsMap;
  abstract generateReport(findings: FindingsMap, outputPath: string): Promise<void>;
}
