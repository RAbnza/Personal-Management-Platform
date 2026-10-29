param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$exePath = [IO.Path]::GetFullPath((Join-Path $repoRoot 'apps/salapiya/build/windows/x64/runner/Debug/salapiya.exe'))
if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) { throw 'Build the isolated Debug harness first.' }
$registryPath = 'Registry::HKEY_CURRENT_USER\Software\Classes\dev.salapiya.p0'
$commandPath = "$registryPath\shell\open\command"
$command = '"' + $exePath + '" "%1"'
if (Test-Path -LiteralPath $registryPath) {
  if (-not (Test-Path -LiteralPath $commandPath) -or (Get-Item -LiteralPath $commandPath).GetValue('') -ne $command) {
    throw 'Existing protocol registration is not this harness; preserve it for owner review.'
  }
  if ($Remove) {
    Remove-Item -LiteralPath $registryPath -Recurse
    Write-Output 'Removed this harness development protocol registration.'
  } else { Write-Output 'Development protocol already points to the isolated Debug executable.' }
} elseif (-not $Remove) {
  New-Item -Path $commandPath -Force | Out-Null
  Set-Item -LiteralPath $registryPath -Value 'URL:Salapiya P0 development callback'
  New-ItemProperty -LiteralPath $registryPath -Name 'URL Protocol' -Value '' -PropertyType String | Out-Null
  Set-Item -LiteralPath $commandPath -Value $command
  Write-Output 'Registered the current user development callback to the isolated Debug executable.'
}
