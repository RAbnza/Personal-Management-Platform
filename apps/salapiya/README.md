# Salapiya

One Flutter/Dart development foundation for Windows and Android. The startup
screen is offline and has no profile, finance, storage, auth or sync implementation.

See [development guide](../../docs/salapiya/P0_FOUNDATION.md),
[actual verification](../../docs/salapiya/P0_VERIFICATION.md), and
[next P0 assignments](../../docs/salapiya/P0_NEXT_ASSIGNMENTS.md).

Use Flutter 3.47.7 / Dart 3.13.5. From this directory:

```powershell
flutter pub get
flutter run -d windows
flutter devices
flutter run -d <actual-android-device-id>
```

Start Android first using the root VS Code task `Salapiya: start Android emulator`
or `scripts/salapiya/start-emulator.cmd` from the repository root. Select the
emulator with `Flutter: Select Device`, choose its debug launch configuration and
press F5. Save Dart files to hot reload; CLI `r` reloads and `R` restarts.

```powershell
dart format --output=none --set-exit-if-changed lib test integration_test
flutter analyze
flutter test
flutter test integration_test/startup_test.dart -d windows
flutter test integration_test/startup_test.dart -d <actual-android-device-id>
flutter build windows
flutter build apk --debug
```

Commit the dependency lockfile and required native runner/Gradle wrapper files;
ignore generated output and local paths. Development Android ID
`dev.salapiya.salapiya` and generated icons are temporary. Signing, supported
physical devices and G0-G4 proofs remain unresolved.
