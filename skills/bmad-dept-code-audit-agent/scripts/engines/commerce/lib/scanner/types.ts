/**
 * Types and interfaces for the Adobe Commerce Audit Scanner
 */

export interface Finding {
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

export type FindingsMap = Record<string, Finding[]>;

export interface StatsMap {
  totalFiles: number;
  phpFiles: number;
  xmlFiles: number;
  phtmlFiles: number;
  totalFindings: number;
  categories: number;
  severityCounts: Record<string, number>;
  scanDuration: number;
}

export interface ScannerOptions {
  root?: string;
  namespace?: string;
  thresholds?: Partial<Thresholds>;
  categories?: string[];
  sqlDump?: string;
  modules?: string[];
}

export interface Thresholds {
  god_class_lines: number;
  fat_constructor_deps: number;
  large_file_lines: number;
  very_large_file_lines: number;
  verbose_log_limit: number;
  max_php_blocks_in_template: number;
  max_methods_per_class: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  god_class_lines: 500,
  fat_constructor_deps: 10,
  large_file_lines: 300,
  very_large_file_lines: 600,
  verbose_log_limit: 10,
  max_php_blocks_in_template: 10,
  max_methods_per_class: 20,
};

export interface GrepResult {
  lineNum: number;
  lineText: string;
  match: RegExpExecArray;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  engine: string;
  charset: string;
  rowFormat: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  hasDefault: boolean;
  comment: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  type: string;
}

export interface ForeignKeyInfo {
  name: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete: string;
  onUpdate: string;
}

export type ScanMethod = (php: string[], xml: string[], phtml: string[]) => void;

export interface ScannerCategory {
  name: string;
  fn: ScanMethod;
}

/**
 * Context interface exposing scanner helpers to scan modules
 */
export interface ScanContext {
  root: string | null;
  appCode: string | null;
  namespace: string;
  findings: FindingsMap;
  stats: Record<string, number>;
  thresholds: Thresholds;
  dbDumpPath: string | null;
  enabledCategories: Set<string> | null;
  selectedModules: Set<string>;

  rel(fp: string): string;
  module(fp: string): string;
  read(fp: string): string;
  grep(fp: string, pattern: RegExp): GrepResult[];
  lineOf(content: string, pos: number): number;
  context(fp: string, lineNum: number, window?: number): string;
  add(
    category: string,
    module: string,
    fp: string,
    line: number,
    issueType: string,
    desc: string,
    code: string,
    severity: string,
    rec: string,
    effort?: string,
    impact?: string,
    confidence?: string,
    justification?: string
  ): void;
  dbAdd(
    category: string,
    tableName: string,
    descType: number | string,
    description: string,
    detail: string,
    severity: string,
    recommendation: string,
    effort?: string
  ): void;
}
