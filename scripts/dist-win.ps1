$ErrorActionPreference = 'Stop'

$outputDir = "release-win"

Write-Host "Building Windows installer into $outputDir"

& electron-builder --win nsis --x64 --publish never --config.directories.output="$outputDir"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$installer = Get-ChildItem -LiteralPath $outputDir -Filter '*.exe' -File |
Where-Object { $_.Name -notlike '*.__uninstaller.exe' } |
Select-Object -First 1

if (-not $installer) {
  throw "Windows installer was not generated in $outputDir"
}

Write-Host "Windows installer generated: $($installer.FullName)"
