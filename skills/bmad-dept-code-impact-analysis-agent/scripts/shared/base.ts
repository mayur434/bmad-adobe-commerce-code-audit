/**
 * BMAD Impact Analysis Agent — Base Engine
 * ==========================================
 * Abstract base class for platform-specific impact analysis engines.
 */

export interface ImpactOptions {
  mode: "analyze" | "trace" | "upgrade-risk";
  target: string | null;
  fromVersion: string | null;
  toVersion: string | null;
  output: string | null;
}

export interface AffectedItem {
  file: string;
  symbol: string;
  type: "class" | "method" | "config" | "template" | "plugin" | "observer" | "cron" | "api";
  impact: "breaking" | "behavioral" | "cosmetic";
  confidence: number;
  reason: string;
}

export interface ImpactReport {
  projectName: string;
  engine: string;
  mode: string;
  blastRadius: number;
  affectedItems: AffectedItem[];
  riskLevel: "critical" | "high" | "medium" | "low";
  summary: string;
}

export abstract class BaseEngine {
  abstract readonly name: string;
  abstract readonly id: string;

  /**
   * Analyze impact of changes in the project.
   */
  abstract analyzeImpact(projectPath: string, options: ImpactOptions): Promise<ImpactReport>;

  /**
   * Trace dependency chains for a specific target.
   */
  abstract traceDependencies(projectPath: string, target: string): Promise<AffectedItem[]>;

  /**
   * Assess upgrade risk between versions.
   */
  abstract assessUpgradeRisk(
    projectPath: string,
    fromVersion: string,
    toVersion: string
  ): Promise<ImpactReport>;
}
