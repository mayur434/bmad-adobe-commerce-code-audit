---
name: bmad-dept-pre-commit-agent
description: "Language-aware pre-commit security reviewer. Splits a staged git diff by file, applies language-specific vulnerability rules from resources/security-rules.md, calls Claude per file, and returns a structured JSON verdict that controls whether the commit is blocked."
---

# BMAD Pre-Commit Agent — Security Review Skill

## Purpose

Perform a security-focused review of staged git diffs before a commit is allowed through. The review is file-by-file and language-aware: each file gets a focused prompt that includes only the vulnerability categories relevant to its language.

The agent operates in two tiers:

- **Tier 1 (TypeScript engine)** — deterministic work: diff extraction, file splitting, language detection, API orchestration, severity aggregation, output file writing, exit code control.
- **Tier 2 (LLM — this skill)** — semantic work: reading the diff, applying the security rules from `resources/security-rules.md`, identifying real exploitable issues (not style/best-practice), and returning a structured JSON verdict.

---

## Activation

This skill activates when the user asks to:
- Review staged changes / run a pre-commit check
- Scan a diff for security issues
- Check code before committing
- Run the security reviewer on a `.diff` file
- Wire or install the pre-commit hook

---

## Pre-flight: Auto-install Dependencies

Before running any review, silently check and install Node dependencies:

```bash
cd .claude/skills/bmad-dept-pre-commit-agent/scripts && [ -d node_modules ] || npm install --silent
```

Do NOT ask the user for permission. These are required. Install silently if missing.

---

## Operating Modes

| Trigger phrase | Mode | Action |
|---|---|---|
| `review staged changes` / `run security review` / `check my diff` | **Staged review** | Run Tier 1 against `git diff --cached` |
| `review diff file` / `check diff at <path>` | **File review** | Run Tier 1 with `--diff <path>` |
| `install hook` / `wire hook` / `set up pre-commit` | **Hook install** | Write and chmod the `.git/hooks/pre-commit` script |

For ambiguous triggers ("check my code", "review this"), ask:

> **What would you like to review?**
> 1. **Staged changes** — review what's currently staged for commit
> 2. **A diff file** — review a specific `.diff` file (I'll ask for the path)

---

## Prompt → CLI Resolution (Tier 1)

When a review is triggered, build the CLI command:

```
npx ts-node {this_skill_path}/scripts/run.ts [flags]
```

| User says | Flag | Value |
|---|---|---|
| _(staged review, default)_ | _(no flag)_ | reads `git diff --cached` |
| `diff file at /path` / `--diff /path` | `--diff` | extracted file path |
| `block on HIGH` / `threshold HIGH` | `--threshold` | NONE \| LOW \| MEDIUM \| HIGH \| CRITICAL |

---

## Tier 2 — LLM Review Prompt

When called directly as an LLM reviewer (not via the CLI engine), use this prompt template for each file. Load the language's rule list from `resources/security-rules.md` before constructing the prompt.

```
You are a senior application security engineer performing a pre-commit security review.

## File Under Review
- Path: `{filePath}`
- Language: {language}

## Security Focus Areas for {language}
{numbered list from resources/security-rules.md for this language}

## Diff to Review
```diff
{diff}
```

## Instructions
Analyse ONLY the changed lines (lines starting with + or -) for real, exploitable security issues.
Do not flag unchanged context lines. Do not flag style or best-practice issues.
Focus on genuine vulnerabilities only.

Load the output contract from templates/review-output.md and respond in exactly that JSON shape.
```

---

## Post-review Actions

After a review completes, the agent can follow up:

- `summarise findings` → list all issues across files grouped by severity
- `show CRITICAL items` → filter to that severity
- `create fix plan` → ordered remediation steps for each finding
- `estimate effort` → rough time estimate to fix all HIGH and CRITICAL findings

---

## Error Handling

- API or network errors: fail open (do not block the commit), log the error.
- Empty diff: exit cleanly with "No changes to review."
- No staged files: exit cleanly.
- Missing `ANTHROPIC_API_KEY`: exit with a clear error message, do not block.
