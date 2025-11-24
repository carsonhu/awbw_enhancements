param (
    [string]$Command
)

$ErrorActionPreference = "Stop"

function Build-Manifest {
    param ([string]$Type)
    Write-Host "Building manifest for $Type..."
    if (Test-Path "manifest.json") {
        Set-ItemProperty -Path "manifest.json" -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue
    }
    python merge_json.py manifests/manifest_common.json manifests/manifest_$Type.json --out=manifest.json
    Set-ItemProperty -Path "manifest.json" -Name IsReadOnly -Value $true
}

function Zip-Extension {
    param ([string]$Name)
    $OutputDir = "dist"
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir | Out-Null
    }
    $Output = "$OutputDir/$Name"
    $Srcs = @("manifest.json", "background", "content_scripts", "lib", "options", "res", "vendor")
    
    Write-Host "Zipping to $Output..."
    if (Test-Path $Output) { Remove-Item $Output }
    
    # Use python script to ensure forward slashes in zip (Compress-Archive uses backslashes on Windows)
    $SrcString = $Srcs -join " "
    python zip_dist.py $Output $Srcs
}

switch ($Command) {
    "chrome" {
        Build-Manifest "chrome"
    }
    "ff" {
        Build-Manifest "ff"
    }
    "run-ff" {
        Build-Manifest "ff"
        Write-Host "Starting web-ext..."
        npx web-ext run
    }
    "pack-ff" {
        Build-Manifest "ff"
        Zip-Extension "awbw_enhancements_ff.zip"
    }
    "clean" {
        if (Test-Path "dist") {
            Remove-Item -Recurse -Force "dist"
            Write-Host "Cleaned dist directory."
        }
    }
    Default {
        Write-Host "Usage: ./manage.ps1 <command>"
        Write-Host "Commands:"
        Write-Host "  chrome   - Build manifest for Chrome"
        Write-Host "  ff       - Build manifest for Firefox"
        Write-Host "  run-ff   - Run in Firefox (requires npx)"
        Write-Host "  pack-ff  - Pack for Firefox distribution"
        Write-Host "  clean    - Remove dist directory"
    }
}
