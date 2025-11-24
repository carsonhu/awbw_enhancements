# Build Instructions

This document explains how to build the AWBW Enhancements extension from source.

## Prerequisites

- **Python 3.7+** (for build scripts)
- **Node.js and npm** (optional, for running Firefox with `web-ext`)

## Building for Firefox

1. **Generate the Firefox manifest and create distribution package:**
   ```powershell
   ./manage.ps1 pack-ff
   ```

2. **Output:**
   - The packaged extension will be in `dist/awbw_enhancements_ff.zip`
   - This file can be uploaded to addons.mozilla.org for signing

## Building for Chrome

1. **Generate the Chrome manifest:**
   ```powershell
   ./manage.ps1 chrome
   ```

2. **Load the extension:**
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this directory

## Development (Firefox)

To run the extension in a persistent Firefox instance during development:

```powershell
./manage.ps1 run-ff
```

This will:
1. Generate the Firefox manifest
2. Launch Firefox with the extension loaded using `web-ext`

## Build Scripts

- **`manage.ps1`** - Main build script (PowerShell)
- **`merge_json.py`** - Merges manifest files
- **`zip_dist.py`** - Creates zip archives with proper path separators
- **`Makefile`** - Alternative build system (requires `make`)

## Manifest Structure

The extension uses a modular manifest system:

- **`manifests/manifest_common.json`** - Shared configuration
- **`manifests/manifest_chrome.json`** - Chrome-specific settings
- **`manifests/manifest_ff.json`** - Firefox-specific settings

The build process merges these files to create the final `manifest.json`.
