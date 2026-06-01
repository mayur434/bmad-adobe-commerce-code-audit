/**
 * Types and interfaces for the AEM Audit Scanner
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
  platform?: 'aemcs' | 'aemams' | 'both';
}

export type FrontendFramework = 'react' | 'angular' | 'vue' | 'vanilla' | 'unknown';

export interface FrontendInfo {
  framework: FrontendFramework;
  version: string;
  hasTypeScript: boolean;
  hasSCSS: boolean;
  hasWebpack: boolean;
  hasVite: boolean;
  packageJsonPath: string;
  srcDir: string;
}

export type FindingsMap = Record<string, Finding[]>;

export interface TechStackInfo {
  javaVersion: string;
  mavenCompilerVersion: string;
  aemVersion: string;
  aemSdkVersion: string;
  coreComponentsVersion: string;
  frontendMavenPluginVersion: string;
  nodeVersion: string;
  npmVersion: string;
  frontendDeps: Record<string, string>;
  mavenDeps: Record<string, string>;
  plugins: Record<string, string>;
}

export interface StatsMap {
  totalFiles: number;
  javaFiles: number;
  xmlFiles: number;
  htlFiles: number;
  jsFiles: number;
  cssFiles: number;
  frontendSrcFiles: number;
  frontendFramework: string;
  frontendVersion: string;
  techStack: TechStackInfo;
  totalFindings: number;
  categories: number;
  severityCounts: Record<string, number>;
  scanDuration: number;
  tokensProcessed: number;
}

export interface ScannerOptions {
  root?: string;
  thresholds?: Partial<Thresholds>;
  categories?: string[];
  modules?: string[];
  platform?: 'aemcs' | 'aemams' | 'both';
}

export interface Thresholds {
  god_class_lines: number;
  large_file_lines: number;
  max_methods_per_class: number;
  max_constructor_deps: number;
  max_catch_blocks: number;
  max_nested_depth: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  god_class_lines: 500,
  large_file_lines: 300,
  max_methods_per_class: 20,
  max_constructor_deps: 8,
  max_catch_blocks: 5,
  max_nested_depth: 4,
};

export interface GrepResult {
  lineNum: number;
  lineText: string;
  match: RegExpExecArray;
}

export interface ScanContext {
  root: string | null;
  findings: FindingsMap;
  stats: Record<string, number>;
  thresholds: Thresholds;
  enabledCategories: Set<string> | null;
  selectedModules: Set<string>;
  platform: 'aemcs' | 'aemams' | 'both';

  javaFiles(): string[];
  xmlFiles(): string[];
  htlFiles(): string[];
  jsFiles(): string[];
  cssFiles(): string[];
  allContentXml(): string[];
  frontendSrcFiles(): string[];
  detectFrontendFramework(): FrontendInfo | null;

  rel(fp: string): string;
  module(fp: string): string;
  read(fp: string): string;
  grep(fp: string, pattern: RegExp): GrepResult[];
  lineOf(content: string, pos: number): number;
  context(fp: string, lineNum: number, window?: number): string;
  add(
    category: string, mod: string, fp: string, line: number,
    issueType: string, desc: string, code: string, severity: string,
    rec: string, effort?: string, impact?: string, confidence?: string, justification?: string
  ): void;
  addWithPlatform(
    category: string, mod: string, fp: string, line: number,
    issueType: string, desc: string, code: string, severity: string,
    rec: string, platform: 'aemcs' | 'aemams' | 'both',
    effort?: string, impact?: string, confidence?: string, justification?: string
  ): void;
}
