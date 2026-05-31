import * as fs        from "fs";
import * as path      from "path";
import { execSync }   from "child_process";
import { FileEntry, ReviewResult, RunConfig, Severity } from "../../shared/types";
import { isHigherSeverity, meetsThreshold }             from "../../shared/severity";
import { reviewWithClaude }                             from "../../shared/claude-client";
import { paint, printFileResult, printFinalVerdict }    from "../../shared/output";

// ─── Language detection — driven by resources/language-map.md ─────────────────
// Hardcoded here for runtime performance; the .md file is the source of truth
// for humans to read and update. Keep in sync.

const FILENAME_MAP: Record<string, string> = {
  "Dockerfile":           "Dockerfile",
  "Makefile":             "Makefile",
  ".env":                 "Environment Config",
  ".htaccess":            "Apache Config",
  "nginx.conf":           "Nginx Config",
  "docker-compose.yml":   "Docker Compose",
  "docker-compose.yaml":  "Docker Compose",
  "package.json":         "Node.js Package Config",
};

const EXTENSION_MAP: Record<string, string> = {
  // Web
  ".html": "HTML",  ".htm": "HTML",
  ".css":  "CSS",   ".scss": "SCSS", ".sass": "SASS", ".less": "LESS",
  ".js":   "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".jsx":  "JavaScript (React)",
  ".ts":   "TypeScript",
  ".tsx":  "TypeScript (React)",
  ".vue":  "Vue",   ".svelte": "Svelte",
  // Backend
  ".java": "Java",  ".kt": "Kotlin",
  ".py":   "Python", ".rb": "Ruby",
  ".php":  "PHP",   ".go": "Go", ".rs": "Rust",
  ".cs":   "C#",    ".cpp": "C++", ".c": "C", ".h": "C/C++ Header",
  ".swift": "Swift", ".scala": "Scala", ".groovy": "Groovy",
  // Data / Config
  ".xml":   "XML",   ".json": "JSON",
  ".yaml":  "YAML",  ".yml": "YAML",
  ".toml":  "TOML",  ".env": "Environment Config",
  ".properties": "Java Properties",
  // Query
  ".sql":     "SQL",
  ".graphql": "GraphQL", ".gql": "GraphQL",
  // Shell
  ".sh":   "Shell Script", ".bash": "Bash",
  ".zsh":  "Zsh",          ".fish": "Fish Shell",
  ".ps1":  "PowerShell",
  // Templates
  ".ejs":   "EJS Template", ".hbs": "Handlebars",
  ".pug":   "Pug",          ".jinja": "Jinja2", ".j2": "Jinja2",
  // Infra
  ".tf":    "Terraform (HCL)",
  ".proto": "Protocol Buffers",
};

function detectLanguage(filePath: string): string {
  const basename = path.basename(filePath);
  const ext      = path.extname(basename).toLowerCase();
  return FILENAME_MAP[basename] ?? EXTENSION_MAP[ext] ?? "Unknown";
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

function getStagedDiff(): string {
  return execSync("git diff --cached --unified=5", {
    encoding:  "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function getDiffFromFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    console.error(`[reviewer] File not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseDiffByFile(rawDiff: string): FileEntry[] {
  const files: FileEntry[] = [];
  const chunks = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of chunks) {
    const firstLine = chunk.split("\n")[0];
    const match     = firstLine.match(/b\/(.+)$/);
    if (!match) continue;

    const filePath = match[1].trim();
    const language = detectLanguage(filePath);

    files.push({ filePath, language, diff: "diff --git " + chunk });
  }

  return files;
}

// ─── Engine entry point ───────────────────────────────────────────────────────

export async function run(args: string[]): Promise<void> {
  require("dotenv").config();

  // Read config from customize.toml defaults (can be overridden by CLI args)
  const config: RunConfig = {
    model:                  "claude-sonnet-4-6",
    maxTokens:              1024,
    apiUrl:                 "https://api.anthropic.com/v1/messages",
    blockOnIssues:          true,
    blockSeverityThreshold: (process.env.BLOCK_SEVERITY as Severity) ?? "MEDIUM",
    outputFile:             ".last-security-review.json",
  };

  // CLI arg overrides
  const thresholdIdx = args.indexOf("--threshold");
  if (thresholdIdx !== -1 && args[thresholdIdx + 1]) {
    config.blockSeverityThreshold = args[thresholdIdx + 1] as Severity;
  }

  // Diff source
  let rawDiff: string;
  const diffIdx = args.indexOf("--diff");

  if (diffIdx !== -1) {
    const diffFile = args[diffIdx + 1];
    if (!diffFile) { console.error("[reviewer] --diff requires a file path."); process.exit(1); }
    console.log(paint(`\n🔐 Security Reviewer — reading from ${diffFile}\n`, "bold", "cyan"));
    rawDiff = getDiffFromFile(diffFile);
  } else {
    console.log(paint("\n🔐 Security Reviewer — staged changes\n", "bold", "cyan"));
    rawDiff = getStagedDiff();
  }

  if (!rawDiff.trim()) {
    console.log(paint("   No changes to review.\n", "gray"));
    process.exit(0);
  }

  const files = parseDiffByFile(rawDiff);

  if (files.length === 0) {
    console.log(paint("   No reviewable file changes found.\n", "gray"));
    process.exit(0);
  }

  console.log(paint(`   ${files.map(f => `${f.filePath} [${f.language}]`).join("\n   ")}\n`, "gray"));

  // Review each file
  let worstSeverity: Severity = "NONE";
  let blockCommit             = false;
  let totalIssues             = 0;
  const allResults: ReviewResult[] = [];

  for (const { filePath, language, diff } of files) {
    process.stdout.write(paint(`   Reviewing ${filePath}...`, "gray"));

    try {
      const result = await reviewWithClaude(filePath, language, diff, config);
      process.stdout.write(paint(" done\n", "green"));

      printFileResult(filePath, language, result);
      allResults.push({ filePath, language, result });

      totalIssues += result.issues?.length ?? 0;

      if (isHigherSeverity(result.severity, worstSeverity)) {
        worstSeverity = result.severity;
      }

      if (
        config.blockOnIssues &&
        !result.safeToCommit &&
        meetsThreshold(result.severity, config.blockSeverityThreshold)
      ) {
        blockCommit = true;
      }
    } catch (err) {
      process.stdout.write(paint(" failed\n", "red"));
      console.error(paint(`   Error: ${(err as Error).message}`, "red"));
      // Fail open — do not block commits on API/network errors
    }
  }

  // Persist results
  fs.writeFileSync(
    config.outputFile,
    JSON.stringify({ timestamp: new Date().toISOString(), worstSeverity, blockCommit, files: allResults }, null, 2)
  );

  printFinalVerdict(worstSeverity, blockCommit, totalIssues, files.length);

  process.exit(blockCommit ? 1 : 0);
}
