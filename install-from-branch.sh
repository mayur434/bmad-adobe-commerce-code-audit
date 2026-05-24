#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# install-from-branch.sh - Install BMAD DEPT Code Agent from a specific branch
# ──────────────────────────────────────────────────────────────────────────────
# Usage:
#   ./install-from-branch.sh <branch-name> [target-project-path]
#
# Examples:
#   ./install-from-branch.sh feature/aemcs-changes .
#   ./install-from-branch.sh feature/frontend-audit /d/WIPRO/Code/MyProject
#   ./install-from-branch.sh main .
# ──────────────────────────────────────────────────────────────────────────────

set -e

REPO_URL="https://github.com/mayur434/bmad-dept-coding-agents.git"
BRANCH="${1:-main}"
TARGET_DIR="${2:-.}"

echo ""
echo "================================================================"
echo " BMAD DEPT Code Agent - Branch Installer"
echo "================================================================"
echo ""
echo "  Repository: ${REPO_URL}"
echo "  Branch:     ${BRANCH}"
echo "  Target:     ${TARGET_DIR}"
echo ""

# Validate target directory
if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: Target directory '${TARGET_DIR}' does not exist."
  exit 1
fi

TARGET_DIR=$(cd "$TARGET_DIR" && pwd)

# Create temp directory
TEMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'bmad-branch')
trap "rm -rf $TEMP_DIR" EXIT

# Step 1: Clone branch
echo "[1/5] Cloning branch '${BRANCH}'..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TEMP_DIR" 2>/dev/null
echo "  Done"
echo ""

# Verify source
SOURCE_SKILL="$TEMP_DIR/skills/bmad-dept-code-audit-agent"
if [ ! -d "$SOURCE_SKILL" ]; then
  echo "Error: bmad-dept-code-audit-agent not found in cloned branch."
  exit 1
fi

# Step 2: Ensure BMAD core is installed
CLAUDE_DIR="$TARGET_DIR/.claude/skills"
if [ ! -d "$CLAUDE_DIR" ]; then
  echo "[2/5] Installing BMAD core framework..."
  cd "$TARGET_DIR"
  npx bmad-method install --directory . --modules bmm --tools claude-code --yes 2>/dev/null
  echo "  Done"
else
  echo "[2/5] BMAD core already installed - skipping"
fi
echo ""

# Step 3: Sync audit agent from branch
echo "[3/5] Syncing bmad-dept-code-audit-agent from branch..."
DEST_SKILL="$CLAUDE_DIR/bmad-dept-code-audit-agent"

# Remove old version
if [ -d "$DEST_SKILL" ]; then
  rm -rf "$DEST_SKILL"
fi

# Copy from cloned branch
cp -r "$SOURCE_SKILL" "$DEST_SKILL"
echo "  Copied skill files"
echo ""

# Step 4: Install npm dependencies
echo "[4/5] Installing scanner dependencies..."
SCRIPTS_DIR="$DEST_SKILL/scripts"
if [ -f "$SCRIPTS_DIR/package.json" ]; then
  cd "$SCRIPTS_DIR"
  npm install --silent 2>/dev/null
  cd "$TARGET_DIR"
  echo "  Done"
else
  echo "  Skipped - no package.json found"
fi
echo ""

# Step 5: Cleanup (handled by trap)
echo "[5/5] Cleaning up temp clone..."
echo "  Done"

# Verify
echo ""
echo "================================================================"
echo " Installation complete from branch: ${BRANCH}"
echo "================================================================"
echo ""

AEM_ENGINE="$DEST_SKILL/scripts/engines/aem"
if [ -d "$AEM_ENGINE" ]; then
  FILE_COUNT=$(find "$AEM_ENGINE" -type f | wc -l)
  echo "  AEM Engine: ${FILE_COUNT} files installed"
else
  echo "  AEM Engine: NOT FOUND"
fi

RULES_DIR="$DEST_SKILL/resources/rule-packs"
if [ -d "$RULES_DIR" ]; then
  PACKS=$(ls "$RULES_DIR" | tr '\n' ', ' | sed 's/,$//')
  echo "  Rule Packs: ${PACKS}"
fi

echo ""
echo "  Run the AEM audit:"
echo "    cd .claude/skills/bmad-dept-code-audit-agent/scripts"
echo "    node --require ts-node/register engines/aem/audit.ts --path \"$TARGET_DIR\" --name MyProject --output ./audit-reports"
echo ""
