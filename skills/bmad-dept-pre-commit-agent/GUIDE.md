# BMAD Pre-Commit Agent — Guide

## What It Does

Reviews your staged git diff file-by-file before a commit lands. Each file is analysed against a language-specific set of vulnerability patterns (SQL injection, XSS, hardcoded secrets, etc.). If findings meet the configured severity threshold, the commit is blocked.

---

## Prerequisites

- Node.js v20.12+
- `ANTHROPIC_API_KEY` environment variable set

---

## Install (into your project)

```bash
# From the BMAD module repo
npx bmad-method install \
  --directory . \
  --modules bmm,pca \
  --custom-source https://github.com/your-org/bmad-pre-commit-agent.git \
  --tools claude-code \
  --yes

# Install Node dependencies
cd .claude/skills/bmad-dept-pre-commit-agent/scripts && npm install
```

---

## Wire as a Git Hook

```bash
# Pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
npx ts-node .claude/skills/bmad-dept-pre-commit-agent/scripts/run.ts
EOF
chmod +x .git/hooks/pre-commit
```

For pre-push instead:
```bash
cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh
npx ts-node .claude/skills/bmad-dept-pre-commit-agent/scripts/run.ts
EOF
chmod +x .git/hooks/pre-push
```

---

## Run Manually

```bash
# Review what's currently staged
npx ts-node .claude/skills/bmad-dept-pre-commit-agent/scripts/run.ts

# Review a specific diff file
npx ts-node .claude/skills/bmad-dept-pre-commit-agent/scripts/run.ts --diff path/to/changes.diff

# Override block threshold for this run
npx ts-node .claude/skills/bmad-dept-pre-commit-agent/scripts/run.ts --threshold HIGH

# Skip the review (emergency bypass — not recommended)
git commit --no-verify
```

---

## Configuration

Edit `customize.toml` to change defaults:

| Key | Default | Options |
|-----|---------|---------|
| `block_severity` | `MEDIUM` | `NONE` `LOW` `MEDIUM` `HIGH` `CRITICAL` |
| `model` | `claude-sonnet-4-6` | any Anthropic model string |
| `review_output` | `.last-security-review.json` | any file path |

---

## Adding a New Language

1. Open `resources/security-rules.md`
2. Add a new `## YourLanguage` section with a bullet list of vulnerability patterns
3. Open `resources/language-map.md`
4. Add the file extension(s) under the appropriate group

No code changes needed.

---

## Troubleshooting

**Hook not running:** check `chmod +x .git/hooks/pre-commit`

**API key error:** ensure `ANTHROPIC_API_KEY` is exported in your shell or `.env`

**Review too slow:** reduce `max_tokens` in `customize.toml` or set `--threshold CRITICAL` to only block on the most severe issues

**False positives:** tighten the rules in `resources/security-rules.md` for the relevant language
