# Review Output Contract

The LLM reviewer must respond with **raw JSON only** — no markdown fences, no preamble, no trailing text.

## Schema

```json
{
  "hasIssues": boolean,
  "severity": "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "issues": [
    {
      "line": "the specific changed line containing the issue (max 120 chars)",
      "type": "short issue category — e.g. SQL Injection, Hardcoded Secret",
      "description": "clear explanation of the security risk and why it is exploitable",
      "recommendation": "concrete fix or mitigation — specific, actionable"
    }
  ],
  "summary": "1–2 sentence overall assessment of the file's security posture",
  "safeToCommit": boolean
}
```

## Rules

- `hasIssues` is `true` if and only if `issues` is non-empty.
- `severity` is the highest severity across all issues. If `issues` is empty, `severity` is `"NONE"`.
- `safeToCommit` is `false` if any issue is present with severity >= the configured `block_severity` threshold.
- `issues[].line` must be copied verbatim from the diff (the `+` or `-` prefixed line). Truncate at 120 characters if longer.
- `issues[].type` is a short category label, not a sentence.
- `issues[].description` explains the actual risk — not a generic statement.
- `issues[].recommendation` is a concrete code-level fix, not "sanitise your inputs".

## Clean file response (no issues)

```json
{
  "hasIssues": false,
  "severity": "NONE",
  "issues": [],
  "summary": "No security issues detected in the changed lines.",
  "safeToCommit": true
}
```

## Severity scale

| Level | Meaning |
|-------|---------|
| `NONE` | No issues |
| `LOW` | Informational — unlikely to be exploited in practice |
| `MEDIUM` | Real vulnerability, exploitable under certain conditions |
| `HIGH` | Easily exploitable, significant impact |
| `CRITICAL` | Immediate risk — exposed credentials, RCE, auth bypass |
