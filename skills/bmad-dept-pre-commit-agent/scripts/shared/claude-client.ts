import * as fs   from "fs";
import * as path from "path";
import { FileReview, RunConfig } from "./types";

// ─── Load language rules from resources/security-rules.md ────────────────────

const RULES_PATH = path.resolve(__dirname, "../../resources/security-rules.md");
const TEMPLATE_PATH = path.resolve(__dirname, "../../templates/review-output.md");

function loadSection(filePath: string, heading: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)(?=\\n## |$)`)
  );
  return match ? match[1].trim() : null;
}

function getSecurityRules(language: string): string {
  const rules = loadSection(RULES_PATH, language)
    ?? loadSection(RULES_PATH, "Default")
    ?? "- Hardcoded credentials or secrets\n- Injection vulnerabilities\n- Insecure data handling";
  return rules;
}

function getOutputSchema(): string {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    return `Respond with raw JSON: { hasIssues, severity, issues[], summary, safeToCommit }`;
  }
  return fs.readFileSync(TEMPLATE_PATH, "utf8");
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildPrompt(filePath: string, language: string, diff: string): string {
  const rules  = getSecurityRules(language);
  const schema = getOutputSchema();

  return `You are a senior application security engineer performing a pre-commit security review.

## File Under Review
- **Path**: \`${filePath}\`
- **Language**: ${language}

## Security Focus Areas for ${language}
${rules}

## Diff to Review
\`\`\`diff
${diff}
\`\`\`

## Instructions
Analyse ONLY the changed lines (lines starting with + or -) for real, exploitable security issues.
Do not flag unchanged context lines. Do not flag style or best-practice issues.
Focus on genuine vulnerabilities only.

${schema}`;
}

// ─── Claude API call ──────────────────────────────────────────────────────────

export async function reviewWithClaude(
  filePath: string,
  language: string,
  diff:     string,
  config:   RunConfig
): Promise<FileReview> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[reviewer] ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      config.model,
      max_tokens: config.maxTokens,
      messages: [
        { role: "user", content: buildPrompt(filePath, language, diff) },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };

  const rawText = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip markdown fences if the model wrapped the JSON
  const cleaned = rawText.replace(/```json|```/g, "").trim();

  return JSON.parse(cleaned) as FileReview;
}
