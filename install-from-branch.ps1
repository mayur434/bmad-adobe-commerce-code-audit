param(
    [Parameter(Mandatory=$true)]
    [string]$Branch,
    [string]$TargetDir = ".",
    [string]$RepoUrl = "https://github.com/mayur434/bmad-dept-coding-agents.git"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " BMAD DEPT Code Agent - Branch Installer" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Repository: $RepoUrl" -ForegroundColor Yellow
Write-Host "  Branch:     $Branch" -ForegroundColor Green
Write-Host "  Target:     $TargetDir"
Write-Host ""

$resolvedTarget = Resolve-Path $TargetDir -ErrorAction SilentlyContinue
if (-not $resolvedTarget) {
    Write-Host "Error: Target directory '$TargetDir' does not exist." -ForegroundColor Red
    exit 1
}
$resolvedTarget = $resolvedTarget.Path

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "bmad-branch-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Step 1: Clone branch
Write-Host "[1/5] Cloning branch '$Branch'..." -ForegroundColor Cyan
git clone --depth 1 --branch $Branch $RepoUrl $tempDir 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to clone branch '$Branch'. Does it exist?" -ForegroundColor Red
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Verify source exists
$sourceSkill = Join-Path $tempDir "skills\bmad-dept-code-audit-agent"
if (-not (Test-Path $sourceSkill)) {
    Write-Host "Error: bmad-dept-code-audit-agent not found in cloned branch." -ForegroundColor Red
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 1
}

# Step 2: Ensure BMAD core is installed
$claudeDir = Join-Path $resolvedTarget ".claude\skills"
if (-not (Test-Path $claudeDir)) {
    Write-Host "[2/5] Installing BMAD core framework..." -ForegroundColor Cyan
    Push-Location $resolvedTarget
    npx bmad-method install --directory . --modules bmm --tools claude-code --yes 2>&1 | Out-Null
    Pop-Location
    Write-Host "  Done" -ForegroundColor Green
} else {
    Write-Host "[2/5] BMAD core already installed - skipping" -ForegroundColor Green
}
Write-Host ""

# Step 3: Sync audit agent from branch
Write-Host "[3/5] Syncing bmad-dept-code-audit-agent from branch..." -ForegroundColor Cyan
$destSkill = Join-Path $claudeDir "bmad-dept-code-audit-agent"

# Remove old version if exists
if (Test-Path $destSkill) {
    Remove-Item -Recurse -Force $destSkill
}

# Copy from cloned branch
Copy-Item -Recurse -Force $sourceSkill $destSkill
Write-Host "  Copied skill files" -ForegroundColor Green

# Also sync rule-packs to the top-level skills/ if it exists
$topSkills = Join-Path $resolvedTarget "skills\bmad-dept-code-audit-agent"
if (Test-Path (Split-Path $topSkills)) {
    if (Test-Path $topSkills) { Remove-Item -Recurse -Force $topSkills }
    Copy-Item -Recurse -Force $sourceSkill $topSkills
    Write-Host "  Synced to top-level skills/ too" -ForegroundColor Green
}
Write-Host ""

# Step 4: Install npm dependencies
Write-Host "[4/5] Installing scanner dependencies..." -ForegroundColor Cyan
$scriptsDir = Join-Path $destSkill "scripts"
if (Test-Path (Join-Path $scriptsDir "package.json")) {
    Push-Location $scriptsDir
    npm install 2>&1 | Out-Null
    Pop-Location
    Write-Host "  Done" -ForegroundColor Green
} else {
    Write-Host "  Skipped - no package.json found" -ForegroundColor Yellow
}
Write-Host ""

# Step 5: Cleanup
Write-Host "[5/5] Cleaning up temp clone..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
Write-Host "  Done" -ForegroundColor Green

# Verify installation
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host " Installation complete from branch: $Branch" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Installed files:" -ForegroundColor Cyan
$engineDir = Join-Path $destSkill "scripts\engines\aem"
if (Test-Path $engineDir) {
    $fileCount = (Get-ChildItem -Recurse $engineDir -File).Count
    Write-Host "    AEM Engine: $fileCount files" -ForegroundColor Green
} else {
    Write-Host "    AEM Engine: NOT FOUND" -ForegroundColor Red
}

$rulesDir = Join-Path $destSkill "resources\rule-packs"
if (Test-Path $rulesDir) {
    $ruleFolders = (Get-ChildItem $rulesDir -Directory).Name -join ", "
    Write-Host "    Rule Packs: $ruleFolders" -ForegroundColor Green
} else {
    Write-Host "    Rule Packs: NOT FOUND" -ForegroundColor Red
}

Write-Host ""
Write-Host "  Run the AEM audit:" -ForegroundColor Cyan
Write-Host "    cd `".claude\skills\bmad-dept-code-audit-agent\scripts`""
Write-Host "    node --require ts-node/register engines/aem/audit.ts --path `"$resolvedTarget`" --name MyProject --output `".\audit-reports`""
Write-Host ""
