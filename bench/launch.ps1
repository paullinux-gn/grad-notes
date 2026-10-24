# Starts the release build on a workspace folder, with DevTools on port 9223
# so the scripts here can drive it. Prints the app's process id.
#
#   powershell -File bench/launch.ps1 -Data <workspace folder>
param([Parameter(Mandatory)][string]$Data)
# Stop on a bad path rather than open the real notes folder.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$env:GRAD_NOTES_DATA_DIR = (Resolve-Path $Data).Path
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $env:TEMP 'grad-notes-bench-webview'
# This variable replaces the app's own browser arguments, so they're repeated
# here (from tauri.conf.json); the rest keep a background window running.
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = @(
  '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion'
  '--force-gpu-mem-available-mb=160 --force-gpu-mem-discardable-limit-mb=32'
  '--disable-backgrounding-occluded-windows --disable-renderer-backgrounding'
  '--remote-debugging-port=9223'
) -join ' '
$p = Start-Process -FilePath (Join-Path $root 'src-tauri\target\release\grad-notes.exe') -PassThru
$p.Id
