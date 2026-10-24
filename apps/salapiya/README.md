# Salapiya

One Flutter/Dart native prototype for Windows and Android. D0–D4 are complete and
owner-approved as of October 24, 2026 (Asia/Manila). D5 is finalized under the
owner's lightweight inspection and handoff scope, replacing the original testing-heavy
plan. The current shell, Daylight/Geist identity, floating controls, financial,
planning, Life, onboarding and supporting workflows are the accepted production
visual baseline.
All data is synthetic, memory-only and resets on process close.
No real storage, authentication, synchronization or financial mutation exists.

Start with the [D5 production handoff](../../docs/salapiya/design/D5_PRODUCTION_HANDOFF.md)
and [screen inventory](../../docs/salapiya/design/SCREEN_STATE_INVENTORY.md).
The [D2 redesign](../../docs/salapiya/design/D2_REIMAGINED.md) and D3/D4 records
retain historical implementation evidence. Production work and G0–G8 acceptance
remain open; next is separately assigned remaining P0 G0/early G7 proof.
Use Profile & utilities for scenarios, themes, privacy, effects, reduced motion,
text size, first-run preview and the preserved Design Gallery. Historical D1/D1R
evidence remains unchanged; no routine screenshot collection is required.

See [development guide](../../docs/salapiya/P0_FOUNDATION.md),
[actual verification](../../docs/salapiya/P0_VERIFICATION.md), and
[next P0 assignments](../../docs/salapiya/P0_NEXT_ASSIGNMENTS.md).

Use Flutter 3.47.7 / Dart 3.13.5. From this directory:

```powershell
flutter pub get --enforce-lockfile
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
