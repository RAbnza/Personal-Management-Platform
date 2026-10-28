param(
  [Parameter(Mandatory=$true)][string]$Keytool,
  [Parameter(Mandatory=$true)][string]$AndroidBuildTools,
  [string]$ApplicationDirectory,
  [string]$ExpectedCertificateSha256,
  [switch]$WaitForChecks
)
# Run in a local interactive console. Never use Start-Transcript for this session.
# No password/private key is generated, printed, written to config or passed in argv.
$ErrorActionPreference = 'Stop'
$signingMutex = New-Object System.Threading.Mutex($false, 'Local\SalapiyaOwnerAndroidRelease')
$ownsSigningMutex = $false
$password = $null
if ($ExpectedCertificateSha256 -and $ExpectedCertificateSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'Expected certificate fingerprint must be 64 hexadecimal characters.' }
try {
try { $ownsSigningMutex = $signingMutex.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $ownsSigningMutex = $true }
if (-not $ownsSigningMutex) { throw 'Another Salapiya signing session is active. Finish or close that session before retrying.' }
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$app = Join-Path $repo 'apps/salapiya'
if ($ApplicationDirectory) {
  $app = [IO.Path]::GetFullPath($ApplicationDirectory)
  $isolatedRoot = [IO.Path]::GetFullPath((Join-Path $repo 'out')) + [IO.Path]::DirectorySeparatorChar
  if (-not $app.StartsWith($isolatedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'An alternate application must be an isolated checkout inside this repository out directory.' }
  if (-not (Test-Path -LiteralPath (Join-Path $app 'pubspec.lock')) -or -not (Test-Path -LiteralPath (Join-Path $app 'lib/main.dart'))) { throw 'Select the checked Salapiya application directory.' }
}
$signingDirectory = Join-Path $env:LOCALAPPDATA 'Salapiya/signing'
$keystore = Join-Path $signingDirectory 'salapiya-private-release.p12'
$alias = 'salapiya-private-release'
if (-not (Test-Path -LiteralPath $Keytool)) { throw 'Select the Android Studio JDK keytool executable.' }
if (-not (Test-Path -LiteralPath (Join-Path $AndroidBuildTools 'apksigner.bat'))) { throw 'Select installed Android build-tools.' }
if ([IO.Path]::GetFullPath($keystore).StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'Signing material must remain outside Git.' }
New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
if ((Get-Item -LiteralPath $signingDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Use a real owner-controlled signing directory.' }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
# Modify only this owned directory's DACL. Set-Acl with a new security descriptor
# can request SACL privileges that an ordinary owner process does not possess.
& icacls.exe $signingDirectory '/inheritance:r' '/grant:r' "*$($sid.Value):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the owner-controlled signing directory.' }
$allowedSids = @($sid.Value, 'S-1-5-18')
foreach ($entry in (Get-Acl -LiteralPath $signingDirectory).Access) {
  if ($entry.AccessControlType -eq 'Allow' -and $entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowedSids) {
    throw 'Unexpected explicit access remains on the signing directory. Review permissions before creating a key.'
  }
}
Write-Host 'Salapiya owner-controlled Android release signing' -ForegroundColor Cyan
Write-Host "Keystore: $keystore"
Write-Host "Alias: $alias"
Write-Host 'Use a strong unique password from your password manager. Do not send it to chat.'
$password = Read-Host 'Keystore password (asterisks show your typing)' -AsSecureString
if (-not (Test-Path -LiteralPath $keystore)) {
  if ($password.Length -lt 12) { $password.Dispose(); throw 'Choose a unique password of at least 12 characters, then rerun.' }
  $confirmation = Read-Host 'Confirm password (asterisks)' -AsSecureString
  $keyPointer = [IntPtr]::Zero
  $confirmationPointer = [IntPtr]::Zero
  try {
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
    if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer) -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)) {
      throw 'Passwords did not match. No key was created. Rerun the script.'
    }
    $env:SALAPIYA_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    & $Keytool -genkeypair -keystore $keystore -storetype PKCS12 -alias $alias -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000 -dname 'CN=Salapiya Private Release' -storepass:env SALAPIYA_STORE_PASSWORD
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $keystore)) { throw 'Key creation did not complete. No release build started.' }
  } finally {
    if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
    if ($confirmationPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer) }
    $confirmation.Dispose()
    $env:SALAPIYA_STORE_PASSWORD = $null
  }
} else {
  Write-Host 'Existing keystore preserved. This script will never replace or rotate it.'
}
if ($WaitForChecks) {
  $gate = Join-Path $app 'build/p6-signing-ready'
  Write-Host 'Key created. Waiting for Codex to finish native checks before compiling the release APK.'
  $deadline = [DateTime]::UtcNow.AddHours(2)
  while (-not (Test-Path -LiteralPath $gate)) {
    if ([DateTime]::UtcNow -gt $deadline) { $password.Dispose(); throw 'Checks are not ready. Keystore preserved; rerun this script later.' }
    Start-Sleep -Seconds 5
  }
}
$pointer = [IntPtr]::Zero
$previousGradleOptions = $env:GRADLE_OPTS
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  $env:SALAPIYA_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:SALAPIYA_KEY_PASSWORD = $env:SALAPIYA_STORE_PASSWORD
  $env:SALAPIYA_KEYSTORE = $keystore
  $env:SALAPIYA_KEY_ALIAS = $alias
  $env:SALAPIYA_UNSIGNED_STAGING = $null
  $env:JAVA_HOME = Split-Path (Split-Path $Keytool -Parent) -Parent
  $env:GRADLE_OPTS = "$previousGradleOptions -Dorg.gradle.daemon=false"
  $out = Join-Path $app 'build/private-release'
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  $certificate = Join-Path $signingDirectory 'salapiya-private-release.cer'
  & $Keytool -exportcert -keystore $keystore -storetype PKCS12 -alias $alias -storepass:env SALAPIYA_STORE_PASSWORD -file $certificate
  if ($LASTEXITCODE -ne 0) { throw 'Could not unlock the selected signing identity.' }
  $expected = (Get-FileHash -LiteralPath $certificate -Algorithm SHA256).Hash.ToLowerInvariant()
  $identityFile = Join-Path $signingDirectory 'salapiya-private-release-identity.json'
  if ($ExpectedCertificateSha256 -and $expected -ne $ExpectedCertificateSha256.ToLowerInvariant()) { throw 'Signing identity differs from the approved update certificate.' }
  if (Test-Path -LiteralPath $identityFile) {
    $identity = Get-Content -LiteralPath $identityFile -Raw | ConvertFrom-Json
    if ($identity.alias -ne $alias -or $identity.certificateSha256 -ne $expected) { throw 'Signing identity changed. Preserve the original key and investigate before updating.' }
  }
  Push-Location $app
  try {
    Write-Host 'Do not run another Flutter build/test in this checkout until signing finishes.'
    $lockBefore = (Get-FileHash -LiteralPath (Join-Path $app 'pubspec.lock') -Algorithm SHA256).Hash
    $previousErrorAction = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      # Flutter 3.47 regenerates release-only plugin registrants during its pub
      # phase. --no-pub can retain integration_test after a development run.
      & flutter.bat build apk --release --dart-define-from-file=build/p2-public-defines.json 2>&1 |
        ForEach-Object { $_.ToString() } |
        Tee-Object -FilePath (Join-Path $out 'android-build.log')
      $buildExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorAction }
    if ($buildExit -ne 0) { throw 'Android release compilation failed. Inspect build/private-release/android-build.log.' }
    if ((Get-FileHash -LiteralPath (Join-Path $app 'pubspec.lock') -Algorithm SHA256).Hash -ne $lockBefore) { throw 'Dependency lock changed. Review it before certifying the release.' }
  } finally { Pop-Location }
  $apk = Join-Path $app 'build/app/outputs/flutter-apk/app-release.apk'
  $verification = & (Join-Path $AndroidBuildTools 'apksigner.bat') verify --verbose --print-certs $apk
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
  $expected = (Get-FileHash -LiteralPath $certificate -Algorithm SHA256).Hash.ToLowerInvariant()
  $text = $verification -join "`n"
  if ($text -notmatch ('certificate SHA-256 digest:\s*' + $expected)) { throw 'APK is not signed by the selected owner certificate.' }
  if ($text -match 'Android Debug') { throw 'Debug certificate cannot certify a private release.' }
  if (-not (Test-Path -LiteralPath $identityFile)) {
    @{alias=$alias; certificateSha256=$expected} | ConvertTo-Json |
      Set-Content -LiteralPath $identityFile -Encoding UTF8
  }
  $verification | Set-Content -LiteralPath (Join-Path $out 'android-signature.txt') -Encoding UTF8
  @{ alias=$alias; certificateSha256=$expected; apkSha256=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant(); signed=$true; inspectedAt=[DateTime]::UtcNow.ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'android-signing.json') -Encoding UTF8
  Write-Host 'APK signature matches the owner-controlled release certificate.' -ForegroundColor Green
  Write-Host 'Back up the PKCS12 file to two encrypted owner-controlled locations. Store its password separately in your password manager.'
  Write-Host 'Keep alias, certificate fingerprint and key-generation details. Never rotate/delete this key as an update shortcut.'
  Write-Host 'Installation/upgrade acceptance is still required; this script does not distribute or install the APK.'
} finally {
  $env:GRADLE_OPTS = $previousGradleOptions
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $password.Dispose()
  foreach ($name in @('SALAPIYA_STORE_PASSWORD','SALAPIYA_KEY_PASSWORD','SALAPIYA_KEYSTORE','SALAPIYA_KEY_ALIAS')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}
} finally {
  if ($null -ne $password) { $password.Dispose() }
  if ($ownsSigningMutex) { $signingMutex.ReleaseMutex() }
  $signingMutex.Dispose()
}
