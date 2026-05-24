param(
    [string]$RepoRoot,
    [switch]$InstallCodexUser,
    [switch]$InstallClaudeProject,
    [switch]$InstallGithubProject,
    [switch]$InstallAgentsProject,
    [switch]$AllProject
)

$ErrorActionPreference = "Stop"

$SkillDir = Split-Path -Parent $PSScriptRoot
if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $SkillDir "..\..")).Path
}

$RepoRoot = (Resolve-Path $RepoRoot).Path
$AdapterDir = Join-Path $SkillDir "adapters"

if ($AllProject) {
    $InstallClaudeProject = $true
    $InstallGithubProject = $true
    $InstallAgentsProject = $true
}

function Copy-FileSafe {
    param(
        [string]$Source,
        [string]$Destination
    )
    $parent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
    Write-Host "Installed $Destination"
}

function Copy-DirectorySafe {
    param(
        [string]$Source,
        [string]$Destination
    )
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
    Write-Host "Installed $Destination"
}

if ($InstallAgentsProject) {
    Copy-FileSafe `
        -Source (Join-Path $AdapterDir "AGENTS.md") `
        -Destination (Join-Path $RepoRoot "AGENTS.md")
}

if ($InstallGithubProject) {
    Copy-FileSafe `
        -Source (Join-Path $AdapterDir "github\copilot-instructions.md") `
        -Destination (Join-Path $RepoRoot ".github\copilot-instructions.md")
    Copy-FileSafe `
        -Source (Join-Path $AdapterDir "github\instructions\novel-to-shadiao-script.instructions.md") `
        -Destination (Join-Path $RepoRoot ".github\instructions\novel-to-shadiao-script.instructions.md")
}

if ($InstallClaudeProject) {
    Copy-DirectorySafe `
        -Source $SkillDir `
        -Destination (Join-Path $RepoRoot ".claude\skills\novel-to-shadiao-script")
}

if ($InstallCodexUser) {
    $CodexSkillDir = Join-Path $env:USERPROFILE ".codex\skills\novel-to-shadiao-script"
    Copy-DirectorySafe -Source $SkillDir -Destination $CodexSkillDir
}

if (-not ($InstallAgentsProject -or $InstallGithubProject -or $InstallClaudeProject -or $InstallCodexUser)) {
    Write-Host "No install target selected. Use -AllProject and/or -InstallCodexUser."
}
