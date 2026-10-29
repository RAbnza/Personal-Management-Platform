# Salapiya native development foundation

Assignment: P0 repository/workspace preparation, October 20-21, 2026 (Asia/Manila).
The [approved blueprint](../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md) governs
the product. This foundation does not close G0-G4 or implement P1 features.

## Implementation and boundaries

`apps/salapiya/` contains one Flutter application with Windows and Android targets.
The offline startup screen shows the Salapiya name/tagline and a transient startup
check button. Its count resets on restart; it is not a financial record or a
persistence demonstration. Material widgets, system light/dark themes, keyboard
focus, safe insets and scrolling provide a small accessible starting point.
Required assets are bundled; startup has no network/authentication dependency.
Final typography, icons and product UI remain future work; generated Flutter icons
are development placeholders.

```text
apps/salapiya/
  AGENTS.md, README.md, .metadata, .gitignore
  pubspec.yaml, pubspec.lock, analysis_options.yaml
  lib/main.dart             entry point
  lib/app.dart              app/theme and transient startup interaction
  test/widget_test.dart     four behavior/accessibility smoke tests
  integration_test/startup_test.dart   native runtime smoke test
  android/                 Kotlin/Gradle runner, manifests, wrapper and resources
  windows/                 CMake/C++ runner, resources and plugin registration
```

No web/iOS/macOS/Linux application targets were generated. Root `src/`, web tests,
PostgreSQL migrations, package manifest/lockfile and existing acceptance workflow
remain the executable historical web reference. Run that application using the
root README and pnpm; native development uses Flutter/Dart independently. Do not
copy the web PostgreSQL schema into SQLite. Historical money, correction,
ownership, private/group isolation and source-derived reporting contracts survive.

Temporary Android namespace/application ID: `dev.salapiya.salapiya`. This is a
development identifier, not a verified domain or final distribution identity.
Version: `0.1.0+1`. The template's debug signing is for local testing only;
permanent IDs, signing, installers, updates and private distribution remain open.

## Tested toolchain

| Component | Locally inspected version |
| --- | --- |
| Flutter | stable 3.47.7, revision `abaf9c523780a608bd46686fd5e53740a07077f8` |
| Dart / DevTools | 3.13.5 / 2.60.0 |
| Windows | Windows 11 25H2, build 26200.9711, x64 |
| Visual Studio | Community 2026 18.11.0 (18.11.12306.390) |
| Windows SDK | 10.0.26100.0 |
| Android platform / build tools | android-37.0 revision 2; android-36 revision 2 added by build; build tools 37.0.0 and 36.0.0 |
| Android emulator / platform tools | 37.2.12 (build 16428233) / 37.0.1 |
| Android command-line tools | 23.0.0 |
| Java used by Flutter Android builds | Android Studio bundled OpenJDK 25.0.3 |
| NDK | 28.2.13676358 (r28c), required by this Flutter template |
| Gradle / Android Gradle Plugin / Kotlin plugin | 9.3.1 / 9.1.0 / 2.4.0 |
| Historical web Node / pnpm | 24.21.0 / 12.9.1 |

Use the tested Flutter version for reproducible development; `.metadata` records
the generator revision and CI pins the tag plus full framework SHA. Pubspec SDK
constraints describe compatibility bounds, not proof for every newer SDK.
Direct `flutter_lints` is pinned to 6.0.0; all application runtime dependencies are
from Flutter itself. `integration_test`/`flutter_test` are SDK development tools.
Commit `pubspec.lock`, Gradle wrapper scripts/JAR/properties and native runner files.
Use `flutter pub get --enforce-lockfile` in CI. Upgrade dependencies deliberately,
review licenses and rerun both platform checks. Do not add a monorepo framework.

## Windows and Android development

From the repository root:

```powershell
cd apps/salapiya
flutter --version
dart --version
flutter doctor -v
flutter pub get
flutter devices
flutter run -d windows
```

For Android, start the configured emulator from the repository root:

```powershell
.\scripts\salapiya\start-emulator.cmd
# Optional: pass another AVD name printed by flutter emulators.
cd apps/salapiya
flutter devices
flutter run -d <actual-device-id>
```

Replace `<actual-device-id>` with the ID discovered on that run. Do not save a
transient emulator serial in launch configuration. `r` in `flutter run` reloads,
`R` restarts, and `q` stops the application. Hot reload preserves the current
State object; a full restart intentionally resets this screen's check count.
Development installs/build tools may download missing caches; offline runtime does
not imply an uncached first build works offline.

The local primary AVD is `Salapiya_Pixel_9_API_37`, Google Pixel 9 profile,
1080x2424 at 420 dpi, portrait, x86_64, Google Play/API 37 (Android 17), image
revision 6, four virtual CPU cores, 4096 MB RAM, 10 GB data and 512 MB SD card.
WHPX `10.0.26200` reports installed and usable. GPU mode is automatic (boot selected host rendering), GPU and
hardware keyboard enabled. This recent image was already installed; no additional
system image was downloaded. AVD files remain outside Git.

Initially Flutter reported no AVDs because this machine relocates its Android user
home. SDK inspection later found `Medium_Phone_API_37.0`; it was left unchanged.
The helper sets `ANDROID_AVD_HOME` from an existing `ANDROID_USER_HOME` only when
needed, within its own process. It writes no machine settings or paths to Git.
For direct emulator commands in a similarly relocated PowerShell session:

```powershell
if (-not $env:ANDROID_AVD_HOME -and $env:ANDROID_USER_HOME) {
  $env:ANDROID_AVD_HOME = Join-Path $env:ANDROID_USER_HOME 'avd'
}
flutter emulators
flutter emulators --launch Salapiya_Pixel_9_API_37
```

The helper uses `--cold` because a Quick Boot restart stalled in adb during final
verification. Cold boot preserves installed applications/data. For direct launch,
append `--cold` to the command above if snapshot startup stalls.

Use the installed Android CLI/Device Manager for future AVD creation. The installed
`sdkmanager` compatibility wrapper is deprecated and mishandled Flutter's semicolon
NDK argument. The supported correction is `android --no-metrics --sdk <sdk-root>
sdk install ndk/28.2.13676358`, using the SDK root reported by doctor. During this
assignment the CLI initially chose its default SDK root; only the just-installed
NDK was moved into Flutter's configured SDK after checking both absolute paths and
refusing an existing destination. No existing toolchain was reinstalled, no system
security/virtualization setting was changed and no data was reset.

## VS Code

Open the repository root. Install recommended Dart/Flutter extensions alongside
the retained web recommendations. Select `Salapiya: Windows` in Run and Debug and
press F5. For Android, run task `Salapiya: start Android emulator`, wait for boot,
use `Flutter: Select Device` to select that emulator, then choose
`Salapiya: selected Android emulator` and F5. That launch uses the selected device;
its name does not itself force an Android target.

Set a breakpoint inside `_runCheck`, activate the button, inspect `_checks`, then
continue. Use the Flutter hot-reload control or save a Dart file during debugging;
`dart.flutterHotReloadOnSave: manual` enables reload on explicit saves. Dart uses
its own formatter and disables ESLint save actions; existing web settings remain.
`Salapiya: validate` runs format verification, analysis and widget tests in sequence.
The batch launcher also works when PowerShell script execution is disabled;
use `pnpm.cmd` for historical web commands in that environment.

## Checks and future platform scenarios

Run from `apps/salapiya`:

```powershell
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test integration_test
flutter analyze --no-pub
flutter test --no-pub
flutter build windows
flutter build apk --debug
flutter test integration_test/startup_test.dart -d windows
flutter test integration_test/startup_test.dart -d <actual-android-device-id>
```

Use `dart format lib test integration_test` to apply formatting. Release Windows
output is under `build/windows/x64/runner/Release/`; the debug APK is under
`build/app/outputs/flutter-apk/`. These outputs and local SDK paths stay ignored.
Preserve the entire Windows output directory when testing a copied executable.

Develop shared domain/application behavior once and adapt layout/input for both
platforms. Use Windows daily and the Android emulator throughout each vertical
feature. Keep platform-specific adapters isolated when required. Test both before
calling a feature complete; physical Android acceptance remains later work.

Use `lower_snake_case` packages/files, `UpperCamelCase` types and `lowerCamelCase`
members. Keep behavior tests under `test/` and native smoke/integration scenarios
under `integration_test/`. Add feature directories/layers as needed, not empty
architecture. Use exact minor units and lossless boundaries for future financial
rules, with range/parity tests. Prefer labeled controls, keyboard focus, text
scaling and actionable failures; never log private content or claim failed saves.

The emulator toolbar/Extended Controls and `adb` support orientation, Home/Back,
keyboard/insets, background/resume, restarts and network changes. Add durable-data
kill/restart and offline/reconnection scenarios after storage/sync exists. Add
notification/permission and authentication callback scenarios only with their
adapters. Current Android runner preserves Flutter's orientation/config-change
handling and `adjustResize`; this does not certify every future form/lifecycle
behavior. No database, permissions flow, notifications or OAuth callback is
implemented here. Airplane-mode tests must re-enable connectivity afterward.

## Git, CI, evidence and continuation

Started from clean `main` at `7662ce9cb22d6aa1ca5d18ca6604b7bdb416fc66`, matching
`origin/main`. Work uses `feat/salapiya-p0-foundation`; only assignment files are
staged, with no automatic merge or force push. See the completion report for the
final SHA and verified remote result.

`salapiya-flutter.yml` performs locked dependency resolution, formatting, analysis
and widget tests on Ubuntu with the exact tested SDK. It is source validation,
not Windows/Android runtime acceptance. Existing web acceptance CI remains intact.
Native platform builds and emulator tests stay local for this small milestone;
no paid runner, cloud credentials or emulator build matrix was introduced.

Actual commands/results, initial failures and limits are recorded in
[P0 verification](P0_VERIFICATION.md). Follow-up objectives and explicit exclusions
are in [P0 next assignments](P0_NEXT_ASSIGNMENTS.md). The recommended next
assignment is bounded G0 dependency/device compatibility plus early G7 cost
feasibility; do not start P1 until G0-G4 have sufficient evidence.

Official command references checked for this assignment:
[Flutter CLI](https://docs.flutter.dev/reference/flutter-cli) and
[Android emulator command line](https://developer.android.com/studio/run/emulator-commandline).
Prefer the installed CLI's help where command syntax has changed.
