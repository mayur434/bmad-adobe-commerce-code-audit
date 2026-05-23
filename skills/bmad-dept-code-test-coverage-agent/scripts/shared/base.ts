/**
 * BMAD Test Coverage Agent — Base Engine
 * ========================================
 * Abstract base class for platform-specific coverage engines.
 */

export interface CoverageOptions {
  name: string | null;
  module: string | null;
  output: string | null;
}

export interface CoverageGap {
  file: string;
  className: string | null;
  method: string | null;
  complexity: number;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
}

export interface CoverageReport {
  projectName: string;
  engine: string;
  totalSourceFiles: number;
  testedFiles: number;
  untestedFiles: number;
  coveragePercent: number;
  gaps: CoverageGap[];
}

export abstract class BaseEngine {
  abstract readonly name: string;
  abstract readonly id: string;

  /**
   * Analyze existing test coverage and identify gaps.
   */
  abstract analyzeCoverage(projectPath: string, options: CoverageOptions): Promise<CoverageReport>;

  /**
   * Generate test files for identified gaps.
   * Returns paths of generated test files.
   */
  abstract generateTests(projectPath: string, options: CoverageOptions): Promise<string[]>;
}
