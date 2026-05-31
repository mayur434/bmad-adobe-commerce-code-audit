import { FileReview, Severity } from "./types";

// ─── ANSI colour codes ────────────────────────────────────────────────────────

const C: Record<string, string> = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  cyan:    "\x1b[36m",
  gray:    "\x1b[90m",
  magenta: "\x1b[35m",
};

export function paint(text: string | number, ...codes: string[]): string {
  return codes.map((k) => C[k] ?? "").join("") + String(text) + C.reset;
}

export function severityTag(severity: Severity): string {
  switch (severity) {
    case "CRITICAL": return paint(severity, "bold", "red");
    case "HIGH":     return paint(severity, "red");
    case "MEDIUM":   return paint(severity, "yellow");
    case "LOW":      return paint(severity, "cyan");
    default:         return paint(severity, "green");
  }
}

// ─── Per-file result block ────────────────────────────────────────────────────

export function printFileResult(filePath: string, language: string, result: FileReview): void {
  const line = paint("─".repeat(64), "gray");
  console.log("\n" + line);
  console.log(paint("📄 " + filePath, "bold") + paint(` [${language}]`, "gray"));
  console.log(
    "   Severity    : " + severityTag(result.severity) +
    "   Safe to commit: " +
    (result.safeToCommit ? paint("✓ YES", "green") : paint("✗ NO", "red"))
  );
  console.log(paint("   " + result.summary, "gray"));

  if (result.issues && result.issues.length > 0) {
    console.log("");
    for (const issue of result.issues) {
      console.log("   " + paint("⚠  " + issue.type, "bold", "yellow"));
      console.log(paint("   Line: ", "gray") + issue.line);
      console.log(paint("   Risk: ", "gray") + issue.description);
      console.log(paint("   Fix:  ", "gray") + paint(issue.recommendation, "cyan"));
      console.log("");
    }
  }
}

// ─── Final verdict block ──────────────────────────────────────────────────────

export function printFinalVerdict(
  worstSeverity: Severity,
  blockCommit:   boolean,
  totalIssues:   number,
  fileCount:     number
): void {
  const line = paint("═".repeat(64), "gray");
  console.log("\n" + line);
  console.log(paint("  Files reviewed : ", "gray") + fileCount);
  console.log(paint("  Issues found   : ", "gray") + (totalIssues > 0 ? paint(totalIssues, "yellow") : paint(totalIssues, "green")));
  console.log(paint("  Worst severity : ", "gray") + severityTag(worstSeverity));

  if (blockCommit) {
    console.log(paint(`\n  ✗  COMMIT BLOCKED — fix ${worstSeverity} issue(s) above.\n`, "bold", "red"));
    console.log(paint("  To bypass (not recommended): git commit --no-verify\n", "yellow"));
  } else {
    console.log(paint("\n  ✓  All clear — commit approved.\n", "bold", "green"));
  }
}
