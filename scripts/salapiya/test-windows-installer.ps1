param(
  [Parameter(Mandatory=$true)][string]$BaselineInstaller,
  [Parameter(Mandatory=$true)][string]$CandidateInstaller,
  [Parameter(Mandatory=$true)][string]$CandidateBundle,
  [Parameter(Mandatory=$true)][string]$TestRoot
)
# Actual per-user staging installation. Never launches an unknown owner profile.
# No screenshots, trust-store changes, SmartScreen changes or signing claims.
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$allowed=[IO.Path]::GetFullPath((Join-Path $repo 'out'))+[IO.Path]::DirectorySeparatorChar
$target=[IO.Path]::GetFullPath($TestRoot)
if(-not $target.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Installer testing must use a dedicated repository out directory.' }
$key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{6345880B-55F4-478B-BB8C-60D67321621C}_is1'
if(Test-Path -LiteralPath $key) { throw 'An existing installed Salapiya package is present. Preserve it; use a separate Windows test account.' }
if(Test-Path -LiteralPath $target) { throw 'Choose a new empty installer test directory; previous evidence is preserved.' }
foreach($file in @($BaselineInstaller,$CandidateInstaller,(Join-Path $CandidateBundle 'salapiya.exe'))) {
  if(-not(Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Build the checked baseline and candidate first.' }
}
$evidence=Join-Path $target 'evidence'
$install=Join-Path $target 'installed'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$support=Join-Path $env:APPDATA 'dev.salapiya\Salapiya'
function Protected-Inventory {
  $files=@()
  $profile=Join-Path $support 'local-v1'
  if(Test-Path -LiteralPath $profile) { $files+=@(Get-ChildItem -LiteralPath $profile -File -Recurse) }
  foreach($name in @('flutter_secure_storage.dat','flutter_secure_storage.dat.bak')) {
    $vault=Join-Path $support $name
    if(Test-Path -LiteralPath $vault) { $files+=Get-Item -LiteralPath $vault }
  }
  $entries=@($files | Sort-Object FullName | ForEach-Object { $_.FullName+'|'+(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash })
  return ($entries -join "`n")
}
$before=Protected-Inventory
$callback='HKCU:\Software\Classes\dev.salapiya.p0'
$callbackExisted=Test-Path -LiteralPath $callback
$callbackBackup=Join-Path $evidence 'original-callback.reg'
if($callbackExisted) {
  & reg.exe export 'HKCU\Software\Classes\dev.salapiya.p0' $callbackBackup /y | Out-Null
  if($LASTEXITCODE -ne 0) { throw 'Could not preserve the original callback registration.' }
}
$links=@((Join-Path ([Environment]::GetFolderPath('Programs')) 'Salapiya.lnk'),(Join-Path ([Environment]::GetFolderPath('Desktop')) 'Salapiya.lnk'))
$originalLinks=@{}
for($i=0;$i -lt $links.Count;$i++) {
  if(Test-Path -LiteralPath $links[$i]) {
    $saved=Join-Path $evidence "original-shortcut-$i.lnk"
    Copy-Item -LiteralPath $links[$i] -Destination $saved
    $originalLinks[$links[$i]]=$saved
  }
}
function Install-Staging([string]$file,[string]$log) {
  $process=Start-Process -FilePath ([IO.Path]::GetFullPath($file)) -WindowStyle Hidden -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/DIR="'+$install+'"'),('/LOG="'+$log+'"')) -PassThru -Wait
  return $process.ExitCode
}
$proof=[ordered]@{ measuredAt=[DateTime]::UtcNow.ToString('o'); stagingUnsigned=$true; screenshots=$false; applicationLaunched=$false; syntheticProfileUpgrade=$false }
try {
  if((Install-Staging $BaselineInstaller (Join-Path $evidence 'baseline-install.log')) -ne 0) { throw 'Baseline installer did not complete.' }
  if((Get-Item -LiteralPath (Join-Path $install 'salapiya.exe')).VersionInfo.ProductVersion -ne '0.6.0+7') { throw 'Unexpected installed update baseline.' }
  if((Protected-Inventory) -cne $before) { throw 'Protected local files changed during baseline installation. Stop for review.' }
  $proof.freshBaselineInstall=$true
  if((Install-Staging $CandidateInstaller (Join-Path $evidence 'candidate-upgrade.log')) -ne 0) { throw 'Candidate upgrade did not complete.' }
  $version=(Get-Item -LiteralPath (Join-Path $install 'salapiya.exe')).VersionInfo.ProductVersion
  if($version -ne '0.6.1+8') { throw 'Unexpected installed candidate identity.' }
  $proof.installedVersion=$version
  $proof.installedDisplayVersion=(Get-ItemProperty -LiteralPath $key).DisplayVersion
  $verified=0
  $bundleRoot=[IO.Path]::GetFullPath($CandidateBundle)
  foreach($file in Get-ChildItem -LiteralPath $bundleRoot -File -Recurse) {
    $relative=$file.FullName.Substring($bundleRoot.Length).TrimStart('\')
    $installedFile=Join-Path $install $relative
    if(-not(Test-Path -LiteralPath $installedFile) -or (Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $installedFile).Hash) { throw 'Installed payload differs from the complete candidate bundle.' }
    $verified++
  }
  $proof.payloadFilesVerified=$verified
  $proof.packageUpgrade=$true
  $command=(Get-ItemProperty -LiteralPath ($callback+'\shell\open\command')).'(default)'
  if(-not $command.Contains((Join-Path $install 'salapiya.exe'))) { throw 'Installer callback does not target the installed candidate.' }
  $proof.callbackRegistration=$true
  if((Protected-Inventory) -cne $before) { throw 'Protected local files changed during candidate upgrade.' }
  $downgrade=Install-Staging $BaselineInstaller (Join-Path $evidence 'downgrade-rejection.log')
  if($downgrade -eq 0 -or (Get-Item -LiteralPath (Join-Path $install 'salapiya.exe')).VersionInfo.ProductVersion -ne $version) { throw 'Ordinary downgrade was not rejected safely.' }
  $proof.ordinaryDowngradeRejected=$true
  $proof.downgradeExitCode=$downgrade
} finally {
  # Only uninstall the package this script just installed at the checked target.
  if(Test-Path -LiteralPath $key) {
    $location=(Get-ItemProperty -LiteralPath $key).InstallLocation
    if(-not $location -or -not [IO.Path]::GetFullPath($location).TrimEnd('\').Equals($install,[StringComparison]::OrdinalIgnoreCase)) { throw 'Installed location changed. No unrelated package was uninstalled.' }
    $uninstaller=Join-Path $install 'unins000.exe'
    $process=Start-Process -FilePath $uninstaller -WindowStyle Hidden -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+(Join-Path $evidence 'uninstall.log')+'"')) -PassThru -Wait
    if($process.ExitCode -ne 0) { throw 'Staging uninstallation did not complete.' }
    $proof.uninstalled=$true
  }
  if($callbackExisted) {
    & reg.exe import $callbackBackup | Out-Null
    if($LASTEXITCODE -ne 0) { throw 'Restore the preserved callback registration before continuing.' }
  } elseif(Test-Path -LiteralPath $callback) { Remove-Item -LiteralPath $callback -Recurse }
  foreach($link in $links) {
    if($originalLinks.ContainsKey($link)) { Copy-Item -LiteralPath $originalLinks[$link] -Destination $link -Force }
    elseif(Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link }
  }
  $proof.originalCallbackAndShortcutsRestored=$true
  if((Protected-Inventory) -cne $before) { throw 'Protected profile/key bytes changed. Preserve evidence; no reset is authorized.' }
  $proof.protectedProfileAndKeyBytesUnchanged=$true
  $proof | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidence 'installer-proof.json') -Encoding UTF8
}
$proof | ConvertTo-Json -Depth 4
