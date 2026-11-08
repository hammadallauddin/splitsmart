#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Set up and publish SplitSmart as a Claude Code plugin.
.DESCRIPTION
    1. Installs dependencies and builds dist/
    2. Initializes git and pushes to GitHub
    3. Prints the commands that install the plugin in Claude Code
#>

param(
    [string]$GitHubUsername = "",
    [string]$RepoName = "splitsmart"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== SplitSmart - Plugin Setup ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "package.json")) {
    Write-Host "This script must be run from the splitsmart project directory" -ForegroundColor Yellow
    exit 1
}

if ([string]::IsNullOrWhiteSpace($GitHubUsername)) {
    Write-Host "Enter your GitHub username: " -NoNewline
    $GitHubUsername = Read-Host
}

$RepoUrl = "https://github.com/$GitHubUsername/$RepoName.git"

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Building dist/..." -ForegroundColor Yellow
npm run build

if (-not (Test-Path ".git")) {
    Write-Host "Initializing git repository..." -ForegroundColor Yellow
    git init -b main
    git add .
    git commit -m "Initial commit: SplitSmart plugin"
}

Write-Host "Adding GitHub remote: $RepoUrl" -ForegroundColor Yellow
git remote add origin $RepoUrl 2>$null
git push -u origin main

Write-Host ""
Write-Host "=== Ready to install ===" -ForegroundColor Green
Write-Host ""
Write-Host "Your plugin is published at:" -ForegroundColor Cyan
Write-Host "  $RepoUrl" -ForegroundColor White
Write-Host ""
Write-Host "To install in Claude Code, run:" -ForegroundColor Cyan
Write-Host "  claude plugin marketplace add $GitHubUsername/$RepoName" -ForegroundColor Green
Write-Host "  claude plugin install splitsmart@splitsmart" -ForegroundColor Green
Write-Host ""
Write-Host "Then restart Claude Code and run:" -ForegroundColor White
Write-Host "  /split-bill 40 paid by Ali for pizza" -ForegroundColor White
Write-Host ""
