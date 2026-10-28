; Inno Setup 6.7.3. Compile from the repository release wrapper.
; Stable identity and per-user data location must survive every update.
#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef BuildNumber
  #error BuildNumber is required
#endif
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif

[Setup]
AppId={{6345880B-55F4-478B-BB8C-60D67321621C}
AppName=Salapiya
AppVersion={#AppVersion}.{#BuildNumber}
AppVerName=Salapiya {#AppVersion} (build {#BuildNumber})
AppPublisher=Salapiya
DefaultDirName={localappdata}\Programs\Salapiya
DefaultGroupName=Salapiya
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
OutputDir={#OutputDir}
OutputBaseFilename=Salapiya-{#AppVersion}-{#BuildNumber}-windows-x64-STAGING
SetupIconFile=..\runner\resources\app_icon.ico
UninstallDisplayIcon={app}\salapiya.exe
VersionInfoVersion={#AppVersion}.{#BuildNumber}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
DisableProgramGroupPage=yes
ChangesAssociations=yes
; This source stages an unsigned installer. Sign executable AND setup before release.
SignedUninstaller=no

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked

[Icons]
Name: "{autoprograms}\Salapiya"; Filename: "{app}\salapiya.exe"; WorkingDir: "{app}"; AppUserModelID: "Salapiya.Private.Development"; AppUserModelToastActivatorCLSID: "{{a64517d4-7ea1-49e7-bad5-c3d00db31c1d}"
Name: "{autodesktop}\Salapiya"; Filename: "{app}\salapiya.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Classes\dev.salapiya.p0"; ValueType: string; ValueData: "URL:Salapiya authentication callback"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\dev.salapiya.p0"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\dev.salapiya.p0\DefaultIcon"; ValueType: string; ValueData: "{app}\salapiya.exe,0"
Root: HKCU; Subkey: "Software\Classes\dev.salapiya.p0\shell\open\command"; ValueType: string; ValueData: """{app}\salapiya.exe"" ""%1"""

[Code]
function InitializeSetup(): Boolean;
var
  InstalledVersion: String;
  InstalledPacked, CandidatePacked: Int64;
begin
  Result := True;
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{6345880B-55F4-478B-BB8C-60D67321621C}_is1', 'DisplayVersion', InstalledVersion) then
  begin
    if (not StrToVersion(InstalledVersion, InstalledPacked)) or
       (not StrToVersion('{#AppVersion}.{#BuildNumber}', CandidatePacked)) then
    begin
      MsgBox('Installed version cannot be verified. Preserve this installation for operator review.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if ComparePackedVersion(InstalledPacked, CandidatePacked) > 0 then
    begin
      MsgBox('A newer Salapiya version is installed. Preserve your profile and use the same or a newer version.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;
; Deliberately no deletion of app-support data, keys, archives or user documents.
; G5 still requires compiled installer, interrupted upgrade and signed update drills.
