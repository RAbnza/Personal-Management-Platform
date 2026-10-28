param(
  [string]$Compiler = $env:SALAPIYA_ISCC,
  [switch]$BundleOnly
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$app = Join-Path $repo 'apps/salapiya'
$source = Join-Path $app 'build/windows/x64/runner/Release'
$pubspec = Get-Content -LiteralPath (Join-Path $app 'pubspec.yaml') -Raw
if ($pubspec -notmatch '(?m)^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$') { throw 'Missing semantic version/build' }
$version = $Matches[1]
$buildNumber = $Matches[2]
if (-not (Test-Path -LiteralPath (Join-Path $source 'salapiya.exe'))) { throw 'Build the normal release application first.' }
$info = (Get-Item -LiteralPath (Join-Path $source 'salapiya.exe')).VersionInfo
if ($info.ProductVersion -ne "$version+$buildNumber") { throw "Stale executable version: $($info.ProductVersion)" }
foreach ($required in @('flutter_windows.dll','vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll','data/icudtl.dat','data/app.so')) {
  if (-not (Test-Path -LiteralPath (Join-Path $source $required))) { throw "Incomplete release bundle: $required" }
}
$output = Join-Path $app 'build/private-release'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$bundle = Join-Path $output "Salapiya-$version-$buildNumber-windows-x64-UNSIGNED-STAGING.zip"
Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $source).FullName -DestinationPath $bundle -Force
Get-FileHash -LiteralPath $bundle -Algorithm SHA256
if (-not $BundleOnly) {
  if (-not $Compiler -or -not (Test-Path -LiteralPath $Compiler)) { throw 'Set SALAPIYA_ISCC to the verified Inno Setup 6.7.3 compiler; ZIP is staging only.' }
  & $Compiler "/DAppVersion=$version" "/DBuildNumber=$buildNumber" "/DSourceDir=$source" "/DOutputDir=$output" (Join-Path $app 'windows/packaging/salapiya.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
}
Write-Output 'UNSIGNED staging only. Signed install/update and native activation acceptance remain mandatory.'
