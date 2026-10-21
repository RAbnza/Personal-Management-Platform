# Salapiya

One Flutter/Dart design gallery for Windows and Android. D1R uses Luminous
Lattice structure with Woven Calm softness and the selected Android floating +
menu. Data and outcomes are synthetic, memory-only; no product shell or services.

Start with [D1R live review and verification](../../docs/salapiya/design/D1R_IMPLEMENTATION.md).
Foundations, Navigation studies and Brand & craft show the refinement. Viewing
preferences controls theme, effects, motion and text scale. Prior D1 screenshots
remain historical; live app review is the default.

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
flutter test integration_test/refinement_test.dart -d windows
flutter test integration_test/refinement_test.dart -d <actual-android-device-id>
flutter build windows
flutter build apk --debug
```

Commit the dependency lockfile and required native runner/Gradle wrapper files;
ignore generated output and local paths. Development Android ID
`dev.salapiya.salapiya` and generated icons are temporary. Signing, supported
physical devices and G0-G4 proofs remain unresolved.
