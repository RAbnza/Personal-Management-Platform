# Salapiya

One Flutter/Dart application for Windows and Android. Production `main.dart` opens
an encrypted persistent profile, with optional Google connection and private/group
Supabase/PowerSync synchronization. Money, Debts, Shared Expenses and Life use real
commands and immutable evidence. `SALAPIYA_DEMO=true` selects the separate synthetic
demo; its scenarios are not production acceptance evidence.

Version: `0.6.0+7`. **Private release is BLOCKED** pending the gates in the
[P6 handoff](../../docs/salapiya/P6_PRIVATE_RELEASE_HANDOFF.md). Read the
[operations/signing/recovery guide](../../docs/salapiya/PRIVATE_RELEASE_OPERATIONS.md)
before packaging or updating. Do not distribute staging builds or merge to main.

The [blueprint](../../docs/SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md), P0-P5 financial/
identity contracts, [approved final redesign](../../docs/salapiya/FINAL_UI_UX_REDESIGN_HANDOFF.md)
and [Android polish](../../docs/salapiya/ANDROID_OVERVIEW_POLISH_HANDOFF.md) govern this
application. D0-D5/gallery records remain historical references, not a direction to
restore old layouts. P6 prohibits new screenshots and golden/UI image artifacts;
native application icon resources are the explicit exception.

The owner approved local-only attachments for this private release. Metadata can
sync, but originals remain encrypted on the selected device and unscanned. Portable
archives exclude original bytes; back up originals independently. Another device
needs exact original reselection. Do not advertise cloud file transfer or scanning.

Use Flutter 3.47.7 / Dart 3.13.5 and the pinned lockfile. From this directory:

```powershell
flutter pub get --enforce-lockfile
flutter run -d windows
flutter devices
flutter run -d <actual-android-device-id>
```

Unconfigured builds retain offline use and explain unavailable Google connection.
For the existing development services, run `node prepare-p2.mjs` from
`services/salapiya/p0`, then add
`--dart-define-from-file=build/p2-public-defines.json` to build/run. Only public
configuration belongs in defines. Never include provider secrets, user sessions,
database keys or signing credentials. Development fixture services are not an
approved isolated pilot for real users.

Start the Android emulator with the root VS Code task or
`scripts/salapiya/start-emulator.cmd`; discover the actual serial. Preserve existing
profiles and use `--no-uninstall` for native integration tests:

```powershell
dart format --output=none --set-exit-if-changed lib test integration_test tool
flutter analyze --no-pub
flutter test --no-pub --concurrency=1
flutter test --no-uninstall integration_test/p6_local_regression_test.dart -d windows
flutter test --no-uninstall integration_test/p6_local_regression_test.dart -d <actual-android-device-id>
flutter build windows
flutter build apk --debug
```

Heavy native runs share build assets; run them serially or in isolated validation
worktrees. The opt-in `tool/p6_capacity_test.dart` uses 10,000 synthetic actions and
can take substantially longer than ordinary tests. No hosted upload is performed.
Historical screenshot-producing integration targets are excluded from P6.

Keep application ID `dev.salapiya.salapiya`, callback
`dev.salapiya.p0://auth/callback`, protected profile identities and existing Windows
metadata stable. Native icons derive from the approved Salapiya mark; see the
handoff for actual packaged verification. Android release builds require the
owner-controlled signing environment; there is no debug-key release fallback.
An explicitly requested unsigned staging APK cannot satisfy private release.
Signing keys/passwords, emulator state, SDK paths and generated build outputs stay
outside Git. Never uninstall an existing profile to bypass a certificate mismatch.
