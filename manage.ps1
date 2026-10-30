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
        # Put the checked-in Chrome manifest back so the folder still loads unpacked in Chrome
        Build-Manifest "chrome"
    }
    "sign-ff" {
        # Mozilla signs it as a self-distributed (unlisted) add-on, which then installs for good in regular Firefox.
        # web-ext reads the API credentials from https://addons.mozilla.org/en-US/developers/addon/api/key/ from these.
        if (-not $env:WEB_EXT_API_KEY -or -not $env:WEB_EXT_API_SECRET) {
            Write-Host "Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET to your addons.mozilla.org API credentials first."
            Write-Host "Get them at https://addons.mozilla.org/en-US/developers/addon/api/key/"
            exit 1
        }
        Build-Manifest "ff"
        Zip-Extension "awbw_enhancements_ff.zip"
        # Put the checked-in Chrome manifest back so the folder still loads unpacked in Chrome
        Build-Manifest "chrome"

        # web-ext signs a folder, so it signs exactly what's in the zip rather than the whole checkout
        $SrcDir = "dist/ff-src"
        $SignedDir = "dist/signed"
        foreach ($Dir in @($SrcDir, $SignedDir)) {
            if (Test-Path $Dir) { Remove-Item -Recurse -Force $Dir }
        }
        Expand-Archive "dist/awbw_enhancements_ff.zip" $SrcDir
        npx --yes web-ext sign --channel=unlisted --source-dir $SrcDir --artifacts-dir $SignedDir
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $Xpi = Get-ChildItem $SignedDir -Filter *.xpi | Select-Object -First 1
        Copy-Item $Xpi.FullName "dist/awbw_enhancements_ff.xpi" -Force

        # updates.json tells installed copies about this version (manifest_ff.json's update_url points to it on main).
        # Its download link is the .xpi on the GitHub release tagged with the version.
        $Manifest = Get-Content "$SrcDir/manifest.json" -Raw | ConvertFrom-Json
        $Version = $Manifest.version
        $Id = $Manifest.browser_specific_settings.gecko.id
        $Link = "https://github.com/carsonhu/awbw_enhancements/releases/download/$Version/awbw_enhancements_ff.xpi"
        $UpdatesJson = @"
{
    "addons": {
        "$Id": {
            "updates": [
                {
                    "version": "$Version",
                    "update_link": "$Link"
                }
            ]
        }
    }
}
"@
        [IO.File]::WriteAllText("$PWD/updates.json", ($UpdatesJson -replace "`r`n", "`n") + "`n")
        Write-Host "Signed dist/awbw_enhancements_ff.xpi ($Version) and updated updates.json."
        Write-Host "Attach the .xpi to the GitHub release $Version, and commit updates.json to main."
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
        Write-Host "  sign-ff  - Pack and have Mozilla sign it (needs WEB_EXT_API_KEY / WEB_EXT_API_SECRET)"
        Write-Host "  clean    - Remove dist directory"
    }
}
