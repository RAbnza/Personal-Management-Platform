# P0 foundation verification

> **Historical record:** preserved development evidence. Current summary: [Development history](../../DEVELOPMENT_HISTORY.md).

Executed on the maintainer's local Windows machine, October 20-21, 2026 (Asia/Manila),
using the versions in [the development guide](../../OPERATIONS_AND_RELEASE.md#salapiya-native-development-foundation). These are native
local checks, not cloud or simulated local acceptance. G0-G4 remain open.

## Repository and preservation

- Starting tree clean; `main`/HEAD and remote main both
  `7662ce9cb22d6aa1ca5d18ca6604b7bdb416fc66`.
- `origin`: `https://github.com/RAbnza/Personal-Management-Platform.git`.
- Created `feat/salapiya-p0-foundation` before modifying files. The completion
  report records the final commit, upstream and remote SHA comparison.
- Read the Salapiya blueprint and inspected historical vision, system/database
  contracts, design/accessibility guidance, V2/V3 handoffs, M6 acceptance and ADR
  0005. Inspected web money primitives/tests, scoped transaction handling, module
  boundaries, manifests, test configs, editor configuration and web CI.
- Web source, tests, migrations, database contents and pnpm manifest/lockfile were
  preserved. Historical docs received narrow continuation pointers only.

## Commands and actual results

Unless a repository-root path is shown, Flutter checks ran from `apps/salapiya`.

| Command/check | Actual outcome |
| --- | --- |
| `flutter --version`, `dart --version` | Flutter 3.47.7 stable / Dart 3.13.5, Windows x64 |
| `flutter doctor -v` | No issues found; Windows, Visual Studio 2026, Android licenses/toolchain and network checks pass |
| `flutter emulators` | Initially none; after process-local Android-home correction, existing generic AVD and new Pixel AVD detected |
| `flutter devices` | Windows plus Android emulator `emulator-5554`, Android 17/API 37 x64; browsers also detected but no Flutter web target generated |
| SDK installed package/device/image inspection | Existing API 37 Google Play x86_64 revision 6 image and Pixel 9 profile used; no new system image download |
| `emulator -accel-check` | WHPX 10.0.26200 installed and usable |
| `flutter create --platforms=windows,android --org dev.salapiya --project-name salapiya ... apps/salapiya` (root) | Official tooling generated only the two requested native targets |
| `flutter pub get` and `flutter pub get --enforce-lockfile` | Pass; unused Cupertino dependency removed; SDK integration-test support resolved |
| `dart format --output=none --set-exit-if-changed lib test integration_test` | Final pass, four Dart files, zero changes |
| `flutter analyze --no-pub` | Final pass, no issues found |
| `flutter test --no-pub` | Four tests pass: startup/tap, keyboard action, 320x568 at 2x text, dark-theme labeled action |
| `flutter build windows` | Pass; final release artifact `build/windows/x64/runner/Release/salapiya.exe` |
| `flutter build apk --debug` | Pass after resolving NDK installation; initial successful multi-ABI build 342.8s, later debug run rebuilds pass |
| `flutter test integration_test/startup_test.dart -d windows` | One native runtime test passes on Windows; app renders and action changes count |
| `flutter test integration_test/startup_test.dart -d emulator-5554` | One native runtime test passes on the actual Android emulator; build/install/render/action all exercised |
| `flutter run -d windows --debug --vmservice-out-file=...` | Windows native debug app launched, VM and DevTools services available |
| `flutter run -d emulator-5554 --debug --vmservice-out-file=...` | APK installed; native app launched; VM/DevTools services available; Impeller OpenGLES renderer |
| Dart VM `getVM`, `getIsolate`, `pause`, `resume` on each running app | Main isolate found; `PauseInterrupted` observed; resume succeeds on Windows and Android |
| CLI `r` after temporary startup-label edit | Windows: one of 755 libraries reloaded in 1875ms; Android: one of 755 in 439ms |
| CLI `r` after restoring final startup label | Windows: one library in 936ms; Android: one library in 575ms; final source restored |
| Android adb tap and screenshot | Real startup button changes count from 0 to 1; inspected screenshot shows edited label and count still 1 after hot reload |
| Android offline cold start | Wi-Fi/mobile data both confirmed 0; force-stop then `am start -W` succeeds with `LaunchState: COLD`; final-label screen renders with count reset to 0 |
| Android reconnection and Home/resume | Wi-Fi/mobile data restored to original enabled states (both 1); Home then bring existing activity forward returns `Status: ok` |
| Portable helper reboot with `--cold` | Boot completes, Flutter detects emulator, installed package survives and final Salapiya screen renders; initial post-boot package readiness/launch was slow |
| Root `pnpm.cmd lint` and direct `node node_modules/eslint/bin/eslint.js .` | Pass, exit 0; focused configuration and web money-file lint also pass |
| ESLint `isPathIgnored` boundary inspection | Native Dart/Gradle paths ignored; historical `src/shared/money.ts` still included |
| Focused Prettier checks | Pass for README, root AGENTS, all four editor JSON files, Flutter workflow and ESLint config |
| Git ignore checks | Build/cache, local.properties, keystore, key.properties and AVD paths ignored; lockfile, metadata and Gradle wrapper retained |
| `git diff --check` | Pass; normal local LF/CRLF conversion notices are not whitespace failures |

## Emulator and workspace correction record

The local AVD is `Salapiya_Pixel_9_API_37`, Pixel 9, API 37 Google Play x86_64,
1080x2424/420 dpi, four cores, 4096 MB RAM, 10 GB data, 512 MB SD. WHPX acceleration
works; automatic graphics selected host rendering. No BIOS/security changes,
emulator wipe, existing AVD replacement or database cleanup occurred.

Initial Flutter discovery missed the relocated `ANDROID_USER_HOME`. SDK AVD
inspection revealed the pre-existing `Medium_Phone_API_37.0` after a new Pixel AVD
had been created. The generic AVD remains unchanged. The batch launcher derives
`ANDROID_AVD_HOME` within its process so future startup avoids this mismatch.

The installed SDK-manager wrapper rejected Flutter's semicolon-form NDK package.
Installed NDK r28c through the supported `android sdk install ndk/28.2.13676358`
command. Its first invocation selected the default SDK directory; the task moved
only that newly installed directory to Flutter's configured SDK after checking
absolute paths and refusing overwrite. The subsequent build installed API 36
revision 2 as required by the template. No working SDK/IDE was reinstalled.

## Initial failures, warnings and limits

- Sandbox access prevented the initial Flutter cache check and GitHub connection;
  authorized local checks succeeded outside the sandbox. No successful local check
  is inferred from the maintainer's earlier doctor result.
- Initial widget semantics test leaked a handle because teardown happened after
  the new Flutter verification point. Explicit disposal fixed it; all final tests
  pass without weakened assertions.
- A first debug command used unsupported `--vm-service-out-file`; installed help
  identified `--vmservice-out-file`, and both debug launches then succeeded.
- A screenshot attempt used an unavailable VM extension. Debug pause/resume had
  already succeeded; the extension error was not counted as a screenshot pass.
- Windows UI Automation exposed the startup labels and action, but desktop screen
  capture/window input was unreliable (monitor-crop errors, wrong captured surface
  and minimized windows). No manual Windows visual/input or Narrator certification
  is claimed. Native Windows integration rendering/input, VM debug and hot reload
  did pass. Android rendering was visually inspected through adb captures.
- VS Code extension recommendations/settings and launch configuration were checked
  against installed Dart/Flutter 3.144.0 settings. Interactive VS Code F5/breakpoint
  UI acceptance was not separately executed; debugger capability was exercised
  directly against both real Dart VM services. Follow the guide for F5 use.
- PowerShell blocked `.ps1` wrappers; `.cmd` is used for pnpm and emulator startup,
  without changing execution policy.
- Final AVD restart through Quick Boot stalled offline in adb. The helper now uses
  Flutter's supported `--cold` flag; application data is retained and snapshots
  are not used as a prerequisite for startup.
- The first post-reboot activity command ran before package readiness and then
  timed out waiting for a frame. The package was retained, the activity resumed
  and a subsequent adb screenshot confirmed the final screen. Android initialization
  logged hundreds of skipped debug frames; wait for the emulator to settle before
  routine work. This is not a measured startup-performance acceptance pass.
- Gradle/JDK 25 reports native-access warnings; Android logs warn about future
  Flutter engine Intent flags and show initial skipped debug frames. Builds and
  runtime tests pass. No representative-device performance claim is made.
- Four transitive pub packages have newer versions outside the current compatible
  constraints. Lockfile resolution passes; no speculative upgrades were applied.
- The Android integration test replaces the installed debug test artifact and
  disconnects the earlier debug session; normal `flutter run` was relaunched after
  it. This is expected test execution, not a counted application crash.
- The host Windows network was not disabled. Android offline cold-start evidence
  and the shared app's absence of network calls establish this bounded startup
  behavior; storage, sync and authentication are absent.
- No physical Android device, supported minimum-OS matrix, manual screen reader,
  keyboard-inset form, notifications/permissions, OAuth callback, database restart,
  encryption/restore or two-device sync acceptance was performed. Those require
  their future implementations/gates.
- The full historical web unit/integration/browser/build campaign was not rerun:
  no web behavior/schema changed. Focused/shared tooling checks cover this scope.
  Existing web CI remains enabled. Hosted Flutter CI status is separate from these
  local results and must be reported from the actual remote run.

## Handoff

Foundation source/configuration and the reusable native smoke test are ready for
the next bounded P0 assignment. See [development commands](../../OPERATIONS_AND_RELEASE.md#salapiya-native-development-foundation) and
[follow-up acceptance criteria](P0_NEXT_ASSIGNMENTS.md). G0-G4 remain open; G7
provider-cost feasibility must be considered early. No production cloud, Google
credentials, signing secrets, billing, financial schema or P1 workflow was created.

Local `out/salapiya-*` logs, debugger endpoint files and emulator captures are
review aids and stay ignored; they may contain machine paths or ephemeral local
debug tokens. Build/cache output, IDE caches, SDK local.properties and AVD state
are excluded. The final completion report supplies the exact committed inventory
and full final text of code/configuration files without including those local files.
