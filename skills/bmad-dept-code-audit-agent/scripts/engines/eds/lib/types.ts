/**
 * EDS Audit Engine — Shared Types
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Finding {
  rule: string;
  severity: Severity;
  category: string;
  description: string;
  file?: string;
  line?: number;
  code?: string;
  recommendation: string;
  score: number;
}

export interface CategoryResult {
  category: string;
  findings: Finding[];
  score: number;
}

export interface AuditResult {
  projectName: string;
  timestamp: string;
  source: string;
  filesScanned: number;
  totalFindings: number;
  overallScore: number;
  severityBreakdown: Record<Severity, number>;
  categories: CategoryResult[];
  pageSpeedResults?: PageSpeedSummary[];
  lowScoreFiles?: FileScoreSummary[];
}

export interface PageSpeedSummary {
  url: string;
  strategy: 'mobile' | 'desktop';
  score: number;
  lcp: number;
  cls: number;
  inp: number;
  fcp: number;
  ttfb: number;
  tbt: number;
  topOpportunity: string;
  status: 'PASS' | 'NEEDS_WORK' | 'FAIL';
}

export interface FileScoreSummary {
  file: string;
  score: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  topIssue: string;
  recommendation: string;
}

export interface EDSConfig {
  project: { path: string; name: string; github_url: string };
  output: { directory: string };
  scoring: { weights: Record<Severity, number> };
  defaults: {
    production: boolean;
    team: boolean;
    cdn: string;
    content_source: string;
    ci_pipeline: boolean;
  };
  categories: string[];
}

export interface FileContent {
  path: string;
  content: string;
}

export interface ProjectFiles {
  all: FileContent[];
  js: FileContent[];
  css: FileContent[];
  html: FileContent[];
  json: FileContent[];
  blockJs: FileContent[];
  blockCss: FileContent[];
  scriptJs: FileContent[];
  headHtml: FileContent | null;
  packageJson: FileContent | null;
  eslintConfig: FileContent | null;
  stylelintConfig: FileContent | null;
  gitattributes: FileContent | null;
  huskyPreCommit: FileContent | null;
  prTemplate: FileContent | null;
  robotsTxt: FileContent | null;
  fstabYaml: FileContent | null;
}

export interface Analyzer {
  name: string;
  category: string;
  analyze(files: ProjectFiles, config: EDSConfig): Finding[];
}
