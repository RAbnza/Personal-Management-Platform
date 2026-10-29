# P5 — Life and native integration

> **Historical record:** preserved development evidence. Current summary: [Development history](../../DEVELOPMENT_HISTORY.md).

Date: 2026-10-27, Asia/Manila. Branch: `feat/salapiya-p5-life-native`.
Foundation: verified P4 `31684e23cb7e7c3aeaafb7cba9c8fd03263993bf`.

## Acceptance and scope

**Decision: P5 implementation and bounded engineering acceptance are complete
for the documented development configurations.** L01–L04 and F01/F03 are accepted
as the foundation for subsequent development. This is **not release readiness**:
the unexecuted Windows cold/notification-center activation, signed distribution,
physical-device, human Narrator/TalkBack and release-scale capacity gates remain
open. P4's M14 private cloud file storage/scanning blocker remains open. P6 has
not begun.

The production composition now uses real private Life records for Personal
Calendar, Tasks, Learning, Books and Career. Local-only profiles start empty.
The separate demo composition retains its specimens. Existing Porcelain and
Midnight surfaces, navigation and reviewed forms are reused.

Final acceptance results are recorded below; a successful compilation alone
does not establish notification delivery, authenticated CDC or accessibility.

## Domain, presentation and historical rules

`apps/salapiya/lib/life/` contains the typed domain, encrypted store extension,
durable presentation controller, reviewed forms, history/review pages,
Career documents and device adapters. The existing Life controller's mutable
objects are presentation read models. Production writes pass through validated
immutable commands and expected source versions. Demo mutators do not own
production data.

The closed presets retain identities `tasks`, `learning`, `books` and preset
version 1. Records use owner-scoped UUIDs; commands preserve their original
UUID, canonical payload, reason and UTC authoring timestamp. Typed records are
Tasks, Learning, Books, Personal events, Career applications/events and document
metadata. Arbitrary tracker fields/templates are rejected. Source history is
paginated in groups of 25; entries, application/events and retired personal
events have bounded presentation pages. Read models have explicit 10,000-record
and 20,000-revision limits. Reaching a limit stops new writes without deleting
evidence; increasing those limits requires a measured migration.

Tasks support priority, deadline, notes, four explicit statuses, completion and
reopening, archive/restore and full revision history. Learning/Books retain
resource/author, units/pages, total/progress, dates and private notes; Books add
rating. Progress is an integer between zero and a positive total, each bounded
at 1,000,000. Progress actions explicitly map reaching the total to Completed;
editing a total/page field alone does not infer completion. Manual started and
completed dates are entered field values, separate from the audit timestamp.
The native rating contract preserves exact decimal strings from 0 to 5, with
up to four decimal places, or unset. Status/filter changes
do not destroy retained records.

Career keeps independent attempts even for the same company/position. A saved
opportunity has no submission date. Pipeline stage and distinct outcome are
separate additive fields, retaining readability of older version-1 payloads.
Stages can repeat or skip; transition reasons/dates remain evidence. Accepted,
rejected, withdrawn, declined/expired offer and employer-cancelled opening are
explicit outcomes. Interview, assessment, follow-up, submission, response,
offer, no-response and note events retain their own source/version/history.
No-response is a dated completed observation, never inferred rejection.
Terminal/archived parents do not permit active event edits or reminders. Notes,
contacts, links, resume label, next action, technologies and optional salary
range remain private Career fields. Salary uses validated decimal strings and
never becomes income or a financial posting. No advanced analytics or custom
tracker engine was added.

These choices follow the Salapiya blueprint and inspected historical tracker,
Career and scheduled-notification references. Historic financial meanings stay
authoritative. The web app, pnpm tooling, web tests and historical web migrations
remain executable references and were not rewritten.

Reviewed forms autosave protected drafts, preserve their source version and
immutable command identity, retain invalid/stale edits for correction and show
actionable save failures. Conflict review compares the retained edit with the
current source. Keeping current state or creating a separate reviewed command
records an immutable resolution; it never changes/retries the original rejected
payload under a different meaning.

## SQLite, encryption and recovery

Local schema 7 adds `life_revision`, `life_intent`, `life_review_resolution`,
`life_device` and `device_reminder` to the existing encrypted PowerSync/SQLite
database. It does not replay PostgreSQL/web migrations into SQLite. Immutable
history/intent triggers and transactional migrations preserve existing money,
profile IDs, command seals and encryption. An interrupted schema-6 upgrade test
verifies rollback with the existing financial journal intact.

Local-only writes atomically append accepted revisions and clear the relevant
draft. Connected writes atomically retain intent and enqueue an envelope in the
existing P2 `p2_transport` queue. There is no second sync engine. Real killed
process tests cover committed/uncommitted local and connected commands, including
the original durable identity after restart.

The existing encrypted archive format gains optional versioned Life coverage:
accepted revisions, original pending/rejected intents, immutable review
decisions and validated view preferences. Previous archive versions remain
readable. Device consent, OS identifiers, notification choices/dismissals and
file bytes are excluded. A restored connected queue is held pending authenticated
original-receipt review. Previously resolved rejected intent cannot resurrect
as a new write. New local recovery uses a new protected key; it does not recreate
OS permission or make an old reminder due again. Recovery tests verify graph,
IDs/history, review holds and absence of portable notification state.

## PostgreSQL, private synchronization and Google identity

Forward migrations `20261026003400` through `20261027003700` add `salapiya_p5` current
records/immutable receipts and the immutable `public.p5_command` read stream.
The server independently validates closed fields, bounds, exact source versions,
parent ownership, UTC/IANA consistency, canonical transport and capacity.
All RPCs require a current live Supabase session. Forced RLS/grants prevent foreign
reads and all direct client writes. Private data never enters group streams.

`p5_submit_command`, `p5_boundary` and `p5_receipt` preserve original payloads and
accepted/rejected receipts. Same-ID altered payloads fail; ordinary rejection
does not stall unrelated valid work. Life serialization is scoped to private
Life state; unrelated financial revisions do not reject independent new entries.
Competing edits of the same record require explicit review, with one accepted
source version. No last-write-wins merge or automatic replay of stale corrections
is performed.

PowerSync's existing restricted publication/JP Development instance gains only
the owner-filtered `p5_private_life` stream. Downloads reconcile accepted history
and retire the matching optimistic overlay once. Initial Life coverage is checked
against the authenticated boundary and retained across reopening. Financial and
Life pending/review counts are separate; global sync status reflects both.
Session expiration preserves downloaded private records and drafts; renewed
authority is required for upload. Ordinary supported Life changes work while
offline. Enrollment/recovery retains P2's explicit profile/receipt review policy.

All four hosted migrations were individually previewed with linked dry-run
before application to the verified existing healthy Tokyo `salapiya-dev` project.
The stream deployment was previewed/applied to the existing instance with its
restricted role. No hosted reset, provider replacement, paid service, service-key
client, artificial JWT or financial/group history replacement was used.

## Calendar and financial authority

The unified Calendar/Agenda is a projection. Life identities are `life:<UUID>`;
application-level follow-ups are `followUp:<UUID>` and remain distinct from
Career event records. Generations include the exact source version and, for
Career events, parent application version. Financial identities/revisions remain
the original P4 reminder-source IDs. Equal titles/dates are never deduplicated.
Selecting an entry routes to its actual Personal/Task/Learning/Book/Career,
card/statement, debt/schedule or recurrence source.

Civil all-day dates retain their date meaning. Timed events retain canonical UTC,
original IANA zone and explicit earlier/later occurrence for DST folds; nonexistent
local times are refused. Calendar display timezone is separate from source time.
Bundled timezone rules include UTC aliases and non-hour transitions. Visibility
preferences affect navigation/Calendar, independently of reminder consent.

P4 card sources require actual verified statements. Debt sources include eligible
schedule/installment dues; recurrence sources are actual materialized occurrences,
not an independent future posting authority. P5 does not post payments, settle
groups, create duplicate financial events or amend money from a notification.
Agenda/source and all native Life tests compare financial revision counts before
and after. Exact financial arithmetic and immutable correction semantics remain
unchanged.

Financial Calendar/OS sources use the accepted snapshot from the existing atomic
`financialView` read, including initial profile activation. Money may separately
display a pending projection, but an unaccepted statement, payment or correction
cannot create or retire a financial reminder. A regression case builds a real
validated P4 pending statement plan, confirms its display projection is excluded,
then materializes accepted evidence and confirms the source appears. No new
financial command, authority or synchronization engine was added for this view.

## Device notifications and platform contracts

Pinned dependencies: `flutter_local_notifications` 22.3.3 and
`flutter_timezone` 5.1.1, with the existing timezone dependency. The maintained
library owns scheduling, Android alarms/receivers and activation callbacks.
The Windows channel supplies missing unpackaged identity/status/history and
group compatibility, plus clock/power-change signals. It is not a hosted
notification service or parallel reminder engine.

Notifications default off. Android requests POST_NOTIFICATIONS with a real
denied/in-app-only state, uses inexact alarms and maintained boot receivers.
No exact-alarm or battery-optimization exemption is requested. Windows uses a
dedicated per-user development AUMID/CLSID and Start Menu shortcut, with an owned
COM activator. C++20 is required by the installed Windows/VS WinRT headers.
Before the first sender registration Windows may return ERROR_NOT_FOUND for
permission status; the UI preserves **unknown**, not an invented grant. An explicit
opt-in/test sends a generic owned confirmation. Windows grouping preserves the
library's exact scheduled deadline/payload and permits removal of shown toasts.
Pre-group development test primers may require dismissal in Windows; they contain
no source payload and cannot block cancellation of current grouped sources.

Protected device state retains logical owner/source/generation keys and allocated
OS IDs, offsets, module switches, quiet hours and dismissal/snooze decisions.
Reconciliation runs on startup/resume, source changes, a one-minute in-process
timer and Windows clock/power events. It cancels obsolete generations before
successors, revalidates immediately before scheduling and checks OS retention.
The nearest 128 commitments within 90 days are scheduled. Quiet hours handle
midnight/DST without moving source deadlines. Valid delayed inexact alarms survive
deadline passage; elapsed/dismissed/superseded reminders do not automatically
resend. Delivery/dismissal/snooze never changes source business state.

Default toast text excludes titles, companies, contacts, notes, balances and
amounts. Including the due date is a separate explicit preference. Activation
resolves the opaque device-local key against the current owned source generation;
obsolete/missing sources open an unavailable message, not another source. Runtime
detachment prevents callbacks into a closed profile/controller. Pending schedules
are retained across ordinary process exit rather than cancelled on shutdown.
OS Do Not Disturb, channel/battery settings, reboot/force-stop behavior and OEM
policies remain outside an exact-delivery promise.

Native evidence and final platform results are listed in the verification table.
Windows OS history/owned notification database checks are independent of Dart
method-call success. Useful primary references:
[library](https://pub.dev/packages/flutter_local_notifications),
[Windows history](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotificationhistory),
[desktop compatibility implementation](https://github.com/CommunityToolkit/WindowsCommunityToolkit/blob/main/Microsoft.Toolkit.Uwp.Notifications/Toasts/Compat/ToastNotificationHistoryCompat.cs).

## Career files and M14

Career documents reuse P4's maintained picker and private AES-GCM file store in
a separate owner Career attachment directory. Metadata binds immutable checksum,
size/type and owned application version through authenticated encryption AAD.
Selections are retained safely before confirmation; interrupted metadata links
can resume. Supported originals are PDF/PNG/JPEG, bounded at 10 MiB each,
1,000 retained objects/1 GiB per private workspace. Format validation is not a
malware scan. Originals may be explicitly exported; no unsafe automatic preview
is claimed.

Only document metadata synchronizes. Another device/archive recovery truthfully
shows unavailable local bytes and permits reselection of an exact original,
verified against immutable metadata. Archives contain **zero byte objects**.
P4 M14 remains a release blocker for any claim of secure cloud file availability:
private provider policies, authorization, quarantine/scanning and transfer
recovery are unverified. No paid storage/scanning was activated and no byte
objects are replicated through PowerSync. A release must satisfy M14 or obtain an
explicitly approved local-only product boundary.

## Verification and traceability

Toolchain: Flutter 3.47.7 / Dart 3.13.5; Windows 11 build 26200.9711; existing
Android 17 API 37 emulator `emulator-5554`. Native builds/tests were serialized,
with `--no-uninstall` to preserve installation data. Synthetic isolated local
profiles and the existing authorized hosted fixture profile were used. Provider
credentials/configs remain ignored/private and OS-protected.

| Capability | Production path and retained rules | Evidence |
|---|---|---|
| L01 | Personal timed/all-day events, cancellation/archive/history; mixed source projection and exact navigation | `p5_life_test`, `p5_agenda_test`, native Life journey on Windows/Android |
| L02 | Durable Tasks, priority/deadline/status, completion/reopen/archive/restore, protected drafts and source review | domain/store/connected/crash tests; native production forms on both targets |
| L03 | Stable Learning/Books presets, typed progress/pages, author/resource, dates/rating, search/status filters/history | shared fixture parity, native Learning progress and Book entry on both targets |
| L04 | Independent Career attempts, stage/outcome, interviews/assessments/follow-ups/observations, private notes/contact/salary/document metadata | Dart/SQL/hosted full-graph parity; native application, stage and interview flows; encrypted document recovery tests |
| F01 | Existing navigation/themes, visibility separate from reminders, preferences/help, semantics/large text | production widget checks at 200%, both platform layouts/themes; native navigation/forms |
| F03 | Consent/permission, private text, source generation, offsets/quiet hours, cancellation/dismissal/snooze/restart, real OS registration/delivery | reminder unit tests plus real Windows/Android notification integration tests; actual denial/allow path on Android |
| G5/G6 bounded | Native build/run, real picker/delivery/activation, labels, text scale, measured bounded persistence | platform results below; signed updates, physical-device/OEM reboot and human screen-reader certification remain open |

The following matrix separates implemented workflows from the particular actions
executed natively. All paths below are relative to `apps/salapiya/`, except the
server migrations/tests. Shared local evidence is `test/p5_life_test.dart`,
`p5_connected_test.dart`, `p5_crash_test.dart` and the checked-in
`contracts/salapiya/p5_life.json` graph. Server evidence is the nine independent
PostgreSQL Life cases and six hosted checks in
`services/salapiya/p0/p5-hosted-tests.mjs`. Native Life evidence means
`integration_test/p5_life_native_test.dart`; native private CDC evidence means
`p5_connected_native_test.dart` and the optional P5 journey in
`p3_google_sessions_test.dart`.

| Requirement/workflow | Implemented domain and production UI | Local persistence/recovery | Connected authority | Windows native evidence | Android native evidence / limits |
|---|---|---|---|---|---|
| L01 personal create/edit/cancel/archive/history; civil/timed dates, timezone and DST | `lib/life/life_domain.dart`, `life_controller.dart`, `life_form.dart`, `life_pages.dart`, `life_history.dart` | Revision/draft graph; fixture restore under a new key; gap/fold and non-hour DST tests | Same immutable Life envelope and owner/version-checked RPC as other presets; graph parity/CDC | Native personal create, venue correction, Agenda destination and encrypted reopening | Same native journey; actual notification opens Personal source. DST/system timezone changes were domain-tested, not changed on the device |
| L01 mixed source identity, filters, calendar navigation and source corrections | `lib/app/overview_agenda.dart`, `lib/life/life_controller.dart`; existing P4 source routes | `p5_agenda_test.dart` verifies exact source IDs, equal-title independence, accepted financial evidence and no financial effects; source generations are derived | Authenticated coverage labels and accepted financial snapshot; source history converges through existing streams | Mixed Life projection uniqueness and real source navigation in native Life journey; existing financial regression retained | Same Life assertions; full Debts/Card/Recurring UI journeys were not repeated natively as a new P5 test |
| L02 task title/description/priority/deadline/status, complete/reopen/archive/restore, search/filter/history and reminder eligibility | Typed Task record; existing Tasks surface, reviewed form and history | Atomic writes, explicit version conflict, draft retention, restart/crash and new-key restore tests | Original pending payload/receipt, competing edit retained for review, independent create proceeds; native CDC has no double overlay | Native create, complete, exclusion from unfinished Agenda, reopen/archive/restore, protected reopening | Same native workflow; reminder correction/cancellation tests run separately on both targets |
| L03 Learning resource/units/dates/notes and Books author/pages/rating; explicit progress/completion, search/filter/archive/history | Closed presets in `life_domain.dart`; Learning/Books surfaces and progress review in `life_form.dart` | Bounds and completion rules, exact rating strings, full fixture history/recovery; no custom fields | Full graph/RPC parity, exact decimal hosted checks and private stream; same review/receipt rules | Native Learning 3/12 to explicit 12/12 completion; Book 32/256 with exact `4.1250` and author; all retained after reopening | Same native actions. Every preset filter/archive combination was not individually repeated through native UI; shared validation/history tests cover those contracts |
| L04 application private fields, saved/submitted attempts, duplicate warnings, independent reapplications, repeated/skipped stages and distinct outcomes | Application contract, Career list/detail, reviewed stage/outcome form; salary privacy updates reactively | Full fixture revision graph, explicit stage dates/reasons and independent application IDs survive archive/recovery | Owner/parent/version validation, same-ID replay and foreign denial; private full graph accepted without money revisions | Native saved application, private contact, submitted/Applied transition and retained history | Same native workflow. All outcome combinations are contract/SQL evidence, not separate native scripts |
| L04 interview/assessment/follow-up/response/no-response/note, timed meeting details, reschedule/completion/cancellation and summaries | Career event contract and form; parent eligibility; distinct application follow-up projection | Own event revisions, UTC/IANA validation; no-response observation cannot reopen as an active appointment; fixture recovery | Owned parent required; terminal/archived parent blocks active work; graph parity/CDC | Native timed interview with meeting URL and separate application follow-up; projection uniqueness | Same journey; source-generation rules/reminder revalidation tested separately. No inferred rejection or advanced analytics |
| L04 document metadata/local bytes and private contact/salary/document isolation | `lib/life/career_documents.dart`; maintained picker and existing private file store | `p5_documents_test.dart`: encrypted/AAD integrity, exact-original recovery and zero archive byte objects; write verifies bytes after persistence | Metadata only, owner-filtered; direct/foreign access denied; bytes never enter CDC/group streams | Genuine Windows picker PNG, explicit attachment confirmation and encrypted metadata/byte verification | Genuine DocumentsUI PNG and same checks. M14 cloud storage/scanning remains open; another device cannot claim local bytes |
| F01 navigation, preferences, privacy/help, saved/synced/coverage labels, drafts and accessibility | Existing shell/Life surfaces, `life_settings.dart`, connection UI; themes/branding retained | View preferences and drafts protected/portable; notification choices remain device-local | Honest pending/review/incomplete coverage; session loss retains downloaded records | Native navigation/forms/picker keyboard; 200% Windows layout, semantics/privacy/reduced-motion widget checks | Native Back/picker/source navigation; 200% Android layout and semantics checks. Human Narrator/TalkBack and physical-device usability not executed |
| F03 opt-in/denial, private text, module/source preferences, offsets/quiet hours, snooze/dismiss, generations and safe activation | `device_reminders.dart`, `native_notifications.dart`, `reminder_widgets.dart`; Android manifest/Windows owned registration | `p5_reminders_test.dart`: persisted IDs, permission denial/restart/correction/snooze/dismiss/stale tap; backup excludes device state | Uses current owned sources; no hosted delivery service, business completion or money writes | Actual scheduled delivery, reschedule/pending cancel and shown-toast removal; OS history/database checks | Actual deny/allow, background alarm, notification tap/Back, cancellation and real reboot receiver. Windows manual cold/center activation and broader physical/OEM behavior remain open |

### Blueprint acceptance mapping

| Blueprint gate | P5 evidence and remaining boundary |
|---|---|
| A20 | Authoritative personal/interview/deadline projections are unique; source completion/archive/version changes cancel old generations while preserving history. Domain, fixture, native Life and real OS reminder checks passed |
| A26 | Existing keyboard/focus/contrast/touch-target regression plus production semantics, 200% text, both platform layouts/themes, reduced-motion settings and native navigation/picker interaction. Human Narrator/TalkBack acceptance remains **not executed**; A26 is not certified in full |
| A01 | Empty local-only composition, durable offline Life writes, encrypted native reopening and no backend requirement. Existing local financial tests remain in the consolidated regression |
| A03 | Existing identity/profile enrollment policy retained; real protected Google scopes and both native private CDC journeys passed. A fresh interactive Google selection/enrollment was not repeated for P5 |
| A05 | Both installations retained independent offline creates before upload, then each downloaded the other's accepted Life records exactly once; no financial revision change |
| A06 | Lost-response transport test and hosted exact original receipt/replay test; changed-payload identity reuse is denied |
| A14 | Hosted foreign-owner/read/direct-write denial, forced RLS, restricted publication and native real Google private-stream isolation |
| A15 | Existing session/outage regression retained; offline pending writes and restart/reconnect exercised natively. Downloaded data/drafts remain when authority is unavailable; no claim that every provider outage was induced live |
| A21 | Life initial boundary/pending/review coverage and separate financial completeness labels; unaccepted financial projections cannot drive Calendar/OS reminders |
| A22 | New-key validated full Life graph restoration, original IDs/history/drafts/preferences and declared zero file-byte/notification-state coverage; existing P1–P4 archive compatibility retained |
| A23 | Original receipt review holds, accepted download reconciliation and resolved rejected intent retention prevent historical replay/resurrection; existing revoked-group recovery policy retained |
| A24 | Atomic rollback, actual killed-process boundaries, interrupted schema-6 upgrade, encrypted file integrity and existing corruption/wrong-secret/storage failure regression; no false save-success claim |

### Execution results

| Check | Actual result |
|---|---|
| Consolidated Flutter regression | **209 passed, 0 failed**, final fresh serial run 14m13s, including all existing financial/Shared Expenses and new Life tests |
| Analysis, formatting, dependencies and normal product builds | **Passed**: 206 Dart files checked, zero formatting changes; analysis found no issues (122.8s); dependency resolution succeeded. Normal Windows release build passed (255.5s); normal Android debug APK passed (80.8s) and `adb install -r` succeeded without uninstalling or clearing application data |
| Independent PostgreSQL regression | **34 passed**, including all P2/P3/P4 suites and 9 Life cases; no financial/group regressions |
| Existing hosted project end-to-end | **6 passed**: full graph, exact replay, owner isolation/direct-write denial, real two-session conflict, exact Book decimals, forced RLS/restricted publication |
| Windows production Life and real picker | **Passed**, final complete run 1m47s: 7 persistent records / 14 immutable revisions, native PNG selection and explicit confirmation, verified encrypted write, protected reopening; financial revision remained zero |
| Android production Life and real picker | **Passed**, final complete run 1m25s: same 7-record / 14-revision journey through Android DocumentsUI; financial revision remained zero |
| Native connected ordinary writes | **Passed on both targets**: offline create, original durable payload, server acceptance/private CDC, completion/reopening, no double overlay or financial revision change |
| Staged two-device offline consistency | **Passed**: Windows and Android each closed with an independent pending create before either uploaded; both reopened/reconciled, and each retrieved the other installation's accepted records/history |
| Real Google identity and private Life | **Passed on Windows and Android**, each with two retained real Google identities, live `getUser` provider checks, private synthetic create/archive RPCs and native CDC; foreign owner excluded and financial revision unchanged. This reused protected sessions; it does not claim a new interactive OAuth consent flow |
| Windows scheduled OS notification | **Passed** delivery, reschedule, pending cancellation and shown-toast removal. Final source ID `599494447` was observed in owned Windows history; a separate read-only OS database query found zero remaining rows for that ID after opt-out |
| Android permission | Real OS deny then allow **passed** in the earlier P5 native run; in-app access and business state stayed available. Later runs reused that grant; test setup restoration is recorded below |
| Android background delivery, activation and cancellation | **Passed**, final complete native run 3m22s. The app was on Home at 04:33:40 UTC before the 04:35 due time; OS notification ID `604536115` was observed at 04:36:01. The app was resumed for the in-process delivery assertion, then the actual notification was tapped. It opened the current Personal source; two Back actions returned through Life to Overview. A separately displayed generic test notification was verified active and removed by opt-out. No source completion or financial effect occurred |
| Real Android reboot | **Passed**: source/version and OS ID `877668776` survived. After `adb reboot`, `sys.boot_completed=1` and AlarmManager showed the owned `ScheduledNotificationReceiver` alarm before Flutter was started. The reopened encrypted source remained version 1 / financial revision 0, and opt-out removed its schedule |
| Local recovery and failure boundaries | Forward migration rollback, new-key archives, original connected recovery holds, resolved-review retention, four killed-process boundaries, encrypted file integrity/AAD and zero portable byte/notification state passed their domain/SDK tests |
| Accessibility and platform limits | Production semantics, privacy, navigation/help and both 200% platform layouts passed widget checks. Existing full-suite keyboard, focus, contrast and touch-target cases are included. Native Windows picker keystrokes and Android picker/notification taps were exercised. Human Narrator/TalkBack, physical-device/OEM acceptance and signed updates were **not executed** |

After the accepted-financial-snapshot correction, both native private SDK peer
journeys were rerun successfully: Windows compiled in 33.5s with a 6s test,
Android compiled in 39.2s with a 19s test. Both retained peer records and unchanged
financial revisions. The new pending-statement exclusion case and existing P4
source checks also passed before the final consolidated run. No production code
changed after these reruns.

The final normal Windows product is
`apps/salapiya/build/windows/x64/runner/Release/salapiya.exe`. The owned per-user
development shortcut and COM activator were retargeted from the integration-test
executable to that product. Target paths, AUMID and toast activator CLSID were
read back and verified. This did not launch or modify the default personal
profile, and is not a signed-installer or cold-activation acceptance result.

The final normal Android artifact is
`apps/salapiya/build/app/outputs/flutter-apk/app-debug.apk`, installed with data
preservation. After installation, POST_NOTIFICATIONS remained **denied**, with
the test user-set/user-fixed flags cleared, and there were zero active owned
notifications. Both normal builds use only the existing public provider
configuration; test credentials are not embedded. The Android build emitted a
Gradle/JDK native-access warning for `native-platform`; it completed successfully
without changing machine security settings. This debug APK is not a signed
release-distribution acceptance artifact.

Android reboot acceptance explicitly distinguishes a normally eligible app from
a force-stopped package. The Flutter runner force-stops its test package at exit;
the isolated app was launched normally to clear that state before the real reboot.
No data was wiped and no exact-alarm exemption was enabled. This proves the
configured receiver on this emulator, not unrestricted recovery after force-stop.
See Android's [alarm scheduling contract](https://developer.android.com/develop/background-work/services/alarms)
and [notification permission contract](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

Windows notification-center/cold activation was **not manually exercised**:
the available Windows window surface did not expose the notification center.
The registered activator path and source routing are implemented; this report
does not substitute Android activation or a compiled callback for that Windows
manual/distribution gate. Device clock/timezone reconciliation has domain and
lifecycle coverage; changing real system clocks/timezones and a broader OEM
matrix were not executed. Remote edits cannot cancel an OS alarm while an
installation is closed and has not downloaded the new source generation;
reconciliation and authoritative version checks remain necessary on return.

### Failures found and corrected

The first full Flutter run completed with 201 passing and 7 failing cases while corrections were still being integrated. The focused correction rerun passed all 20 connected-profile, widget, capacity and Life cases. Native teardown now removes a Windows channel handler only when initialization actually installed it; a missing Flutter messenger leaves local financial tests usable. Connection counts retain readable waiting/review wording and explicitly disclose Life/Career metadata uploads. The 500-row financial capacity case needed a bounded three-minute test timeout on this host (the corrected run completed in about 58 seconds); its size, monetary and idempotency assertions are unchanged. The fake-clock UI helper now waits for asynchronous linear as well as circular loaders. Book ratings preserve the inherited exact decimal 0-to-5 rule through forward migration 037, without rewriting prior payloads. Only the final fresh full run in the table above is the consolidated acceptance result.

The first Windows plugin compilation failed under C++17 with the installed VS
WinRT coroutine headers; the narrow runner target now uses C++20. The initial
plugin symlink setup was blocked by machine symlink policy; ignored directory
junctions to existing package caches enabled builds without changing Developer
Mode/security settings. Subsequent dependency resolution succeeded.

UTC aliases initially used the bundled zone lookup incorrectly; explicit UTC
mapping fixed minute-boundary native scheduling. The Windows library's
unpackaged cancellation path removed pending schedules but omitted displayed
toasts. Empty-group removal produced E_INVALIDARG; retaining a stable nonempty
group and using owned history fixed that compatibility gap. Earlier delivery-only
runs do not count as passing cancellation. The final corrected run is recorded
above. Native accessibility activation during picker automation also changed
the Flutter tester's semantics-handle baseline and failed cleanup despite
passing the business assertions. Picker/tap cases now enable platform semantics
through the documented test dispatcher before the tester records its baseline,
and restore that override afterward. Semantics and the SDK leak assertions remain
enabled. Both complete native picker reruns passed. This setup is separate from
the production widget semantics assertions and is not human screen-reader proof.

An Android activation run opened the correct source but used a `ValueKey` finder
for the shell's actual `PageStorageKey`; that harness assertion was corrected.
An unattended activation window expired across a session interruption. Neither
failed run is counted as the final passing activation/cancellation run. Its
replacement completed source navigation, Back-stack and displayed-notification
cancellation assertions. Android POST_NOTIFICATIONS was then revoked and its
test permission flags cleared to restore the original disabled state; no owned
Salapiya notification remained displayed.

After midnight, existing import tests used a historical date as a fresh review.
Fresh helper reviews now use the current civil date; historical golden replay
supplies its original recorded timestamp. The server synthetic live fixture
adapts review metadata in memory. Checked-in golden financial history and
production freshness rules were not changed. Initial large-text test setup
selected a hidden dock destination instead of the real fallback navigation and
restored the debug target platform too late; those harness issues were corrected.
Interrupted/failed runs are not substituted for passing native evidence.

## Free tier, operational limits and remaining gates

The existing Supabase development project, Google OAuth configuration and
PowerSync JP Development instance are reused. No paid service, extra project,
push/email worker, calendar integration, binary stream or artificial keepalive
was created. The deterministic hosted Life fixture is 25 commands/11 records and
12,177 canonical payload bytes; replays do not duplicate effects. This measures
application payload, not TLS/CDC framing, billing or provider free-tier capacity.

A read-only hosted measurement before the final Google runs found 89 accepted Life commands (42,045 payload bytes), 95 retained receipts and 335,872 bytes across Life relations/indexes. This is a point-in-time development measurement, not provider billing or quota certification. Later synthetic verification appends additional evidence.

The bounded local measurement uses 250 synthetic records: 100,134 canonical
payload bytes, 141,003 Life archive JSON bytes, 598,016 main SQLite bytes;
1,489 ms writes and ten full-read samples with 29,164 µs median / 49,488 µs p95
on this Windows host. These include validation/replay and are one observed run,
not a performance guarantee. SQLite WAL/cache and complete backup encryption
overhead are additional. P6 must measure representative devices, realistic
20-user usage, command/history growth, wire traffic, provider connections/quotas,
retention and backup sizes. Limits must not be enlarged merely because a small
fixture passed.

No owner credential/OTP or provider purchase is needed to review this branch.
Before release: collect actual device/OS inventory; verify signed installer/APK
updates preserve encrypted profiles; test cold activation, reboot, clock/timezone
changes and force-stop/OEM limits on representative devices; perform human
Narrator/TalkBack and keyboard/touch acceptance; measure representative capacity;
close or explicitly resolve M14. These are outstanding gates, not completed
manual actions. Recommended P6 entry is that release-gate audit, after separate
authorization. L05–L07, external calendars, hosted email/push and public stores
remain intentionally deferred.

Git delivery preserves the verified P4 base, uses phase checkpoints, does not
merge main/force-push and excludes the pre-existing unrelated Android build
cache. The final branch SHA is supplied in the final response; this report does
not embed a self-referential final commit hash.
