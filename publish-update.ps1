# Publishes an OTA update to BOTH channels with the correct env variant baked in.
# Preview keeps dev controls (EXPO_PUBLIC_APP_VARIANT=preview);
# production strips them (EXPO_PUBLIC_APP_VARIANT=production).
#
# Usage:  .\publish-update.ps1 "Your update message"

param(
  [Parameter(Mandatory = $true)]
  [string]$Message
)

Write-Host "`n=== Publishing to PREVIEW channel ===" -ForegroundColor Cyan
$env:EXPO_PUBLIC_APP_VARIANT = 'preview'
npx eas update --branch preview --message $Message
if (-not $?) { Write-Host "Preview publish failed - aborting." -ForegroundColor Red; exit 1 }

Write-Host "`n=== Publishing to PRODUCTION channel ===" -ForegroundColor Cyan
$env:EXPO_PUBLIC_APP_VARIANT = 'production'
npx eas update --branch production --message $Message
if (-not $?) { Write-Host "Production publish failed." -ForegroundColor Red; exit 1 }

Write-Host "`nDone - both channels updated." -ForegroundColor Green
