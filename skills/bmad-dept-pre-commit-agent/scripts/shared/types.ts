// ─── Shared types used by all engines and shared utilities ───────────────────

export interface ReviewIssue {
  line:           string;
  type:           string;
  description:    string;
  recommendation: string;
}

export type Severity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface FileReview {
  hasIssues:    boolean;
  severity:     Severity;
  issues:       ReviewIssue[];
  summary:      string;
  safeToCommit: boolean;
}

export interface FileEntry {
  filePath: string;
  language: string;
  diff:     string;
}

export interface ReviewResult {
  filePath: string;
  language: string;
  result:   FileReview;
}

export interface RunConfig {
  model:                  string;
  maxTokens:              number;
  apiUrl:                 string;
  blockOnIssues:          boolean;
  blockSeverityThreshold: Severity;
  outputFile:             string;
}
