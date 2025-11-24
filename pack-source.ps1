param (
    [string]$Command
)

$ErrorActionPreference = "Stop"

Write-Host "Creating source code archive for Mozilla submission..."

# Files and directories to include in source archive
$SourceFiles = @(
    "background",
    "content_scripts",
    "lib",
    "options",
    "res",
    "vendor",
    "manifests",
    "docs",
    "manage.ps1",
    "merge_json.py",
    "zip_dist.py",
    "Makefile",
    "README.md",
    "BUILD.md"
)

# Check if LICENSE exists and add it
if (Test-Path "LICENSE") {
    $SourceFiles += "LICENSE"
}

# Create dist directory if it doesn't exist
$OutputDir = "dist"
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$Output = "$OutputDir/awbw_enhancements_source.zip"

Write-Host "Zipping source files to $Output..."
if (Test-Path $Output) { 
    Remove-Item $Output 
}

# Use python script to ensure forward slashes
python zip_dist.py $Output $SourceFiles

Write-Host ""
Write-Host "Source archive created successfully!"
Write-Host "Upload this file to Mozilla when submitting your extension:"
Write-Host "  $Output"
