@echo off
setlocal
rem Flutter may miss a relocated Android user home. Keep this fix process-local.
if not defined ANDROID_AVD_HOME if defined ANDROID_USER_HOME set "ANDROID_AVD_HOME=%ANDROID_USER_HOME%\avd"
set "SALAPIYA_AVD=%~1"
if not defined SALAPIYA_AVD set "SALAPIYA_AVD=Salapiya_Pixel_9_API_37"
call flutter.bat emulators
if errorlevel 1 exit /b %errorlevel%
rem Cold boot avoids a stalled Quick Boot snapshot; application data is retained.
call flutter.bat emulators --launch "%SALAPIYA_AVD%" --cold
exit /b %errorlevel%
