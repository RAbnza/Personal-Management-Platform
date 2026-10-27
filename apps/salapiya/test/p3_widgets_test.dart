import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';

import 'local_money_journey.dart';
import 'local_test_support.dart';

void main() {
  for (final mobile in [false, true]) {
    for (final theme in ['light', 'dark']) {
      testWidgets(
        'P3 $theme ${mobile ? 'Android' : 'Windows'} long names, 200% text, keyboard and durable offline draft',
        (tester) async {
          debugDefaultTargetPlatformOverride = mobile
              ? TargetPlatform.android
              : TargetPlatform.windows;
          addTearDown(() => debugDefaultTargetPlatformOverride = null);
          tester.view.physicalSize = mobile
              ? const Size(412, 900)
              : const Size(1440, 1000);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final f = (await tester.runAsync(LocalFixture.open))!;
          final settings = GallerySettings();
          final runtime = LocalRuntime(
            LocalProfiles(f.directory, MemoryProfileVault()),
            settings,
          );
          final actor = newLocalId(),
              group = newLocalId(),
              person = newLocalId();
          final invitation = newLocalId();
          final source = newLocalId(), missingPurchase = newLocalId();
          const name =
              'Family gathering with a long descriptive group name for a narrow screen';
          try {
            await tester.runAsync(() async {
              await f.store.savePreferences('UI fixture', {
                'theme': theme,
                'textScale': '2.0',
              });
              await f.store.stageConnection(
                actor,
                'synthetic@example.test',
                newLocalId(),
              );
              await f.store.db.execute(
                "UPDATE connected_profile SET phase='connected'",
              );
              final document = jsonEncode({
                'id': group,
                'name': name,
                'owner': person,
                'version': 1,
                'complete': true,
                'archived': false,
                'people': {
                  person: {
                    'name':
                        'A participant with a deliberately long display name',
                    'user': actor,
                    'active': true,
                    'kind': 'registered',
                  },
                },
                'bills': {
                  source: {
                    'creator': person,
                    'revisions': [
                      {
                        'id': source,
                        'name': 'Earlier accepted shared source',
                        'date': '2026-10-26',
                        'total': '10000',
                        'paid': {person: '10000'},
                        'shares': {person: '10000'},
                        'method': 'equal',
                      },
                    ],
                    'refunds': [],
                  },
                },
                'settlements': {},
                'activity': [
                  {
                    'id': invitation,
                    'op': 'invite',
                    'at': '2026-10-26T00:00:00Z',
                  },
                ],
              });
              await f.store.db.execute(
                'INSERT INTO p3_group(id,owner_id,group_id,version,document) VALUES(?,?,?,?,?)',
                ['$group:$actor', actor, group, 1, document],
              );
              await runtime.activate(f.store);
              await f.store.saveDraft('shared-purchase:$source', source, {
                'privateSource': missingPurchase,
                'group': group,
                'bill': source,
              });
            });
            await tester.pumpWidget(
              SalapiyaApp(
                production: true,
                settings: settings,
                localRuntime: runtime,
              ),
            );
            await localSettle(tester);
            await localTap(tester, find.text('Open your groups').first);
            await localWait(
              tester,
              () => find.text(name).evaluate().isNotEmpty,
            );
            await localTap(tester, find.text('Add shared expense'));
            final field = find.byKey(const ValueKey('shared-field-name'));
            await localWait(tester, () => field.evaluate().isNotEmpty);
            await tester.ensureVisible(field);
            await tester.tap(field);
            await tester.runAsync(
              () => tester.enterText(field, 'Recoverable keyboard bill'),
            );
            await tester.sendKeyEvent(LogicalKeyboardKey.tab);
            await localSettle(tester);
            expect(FocusManager.instance.primaryFocus, isNotNull);
            // Native SQLite work started by a widget callback can depend on
            // debounce timers in the fake clock. Keep pumping while reading it.
            var persisted = false, readFinished = false;
            final reading = f.store.db
                .getAll('SELECT payload FROM shared_draft')
                .then((drafts) {
                  persisted = drafts.any(
                    (d) => (d['payload'] as String).contains(
                      'Recoverable keyboard bill',
                    ),
                  );
                })
                .whenComplete(() => readFinished = true);
            for (var i = 0; i < 300 && !readFinished; i++) {
              await tester.pump(const Duration(milliseconds: 20));
              await tester.runAsync(
                () => Future<void>.delayed(const Duration(milliseconds: 10)),
              );
            }
            expect(readFinished, isTrue);
            await reading;
            expect(persisted, isTrue);
            await localTap(tester, find.text('Close').last);
            await localTap(tester, find.text('Keep draft & close'));
            var intentsRead = false;
            final intents = f.store.db
                .getAll('SELECT id FROM shared_intent')
                .whenComplete(() => intentsRead = true);
            for (var i = 0; i < 300 && !intentsRead; i++) {
              await tester.pump(const Duration(milliseconds: 20));
              await tester.runAsync(
                () => Future<void>.delayed(const Duration(milliseconds: 10)),
              );
            }
            expect(intentsRead, isTrue);
            expect(await intents, isEmpty);
            expect(tester.takeException(), isNull);
            await localTap(tester, find.text('Balances'));
            expect(
              find.textContaining('Suggestions are nonposting'),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
            // Explicit rejected-receipt UI fixture, not a hosted authority test.
            final refused = newLocalId();
            await tester.runAsync(() async {
              await f.store.saveSharedIntent(
                refused,
                actor,
                group,
                jsonEncode({
                  'contract': 3,
                  'group': group,
                  'version': 1,
                  'op': 'bill',
                  'values': {
                    'name': 'Retained rejected purchase',
                    'date': '2026-10-26',
                    'total': '10000',
                    'paid': {person: '10000'},
                    'shares': {person: '10000'},
                    'method': 'equal',
                  },
                }),
                queued: false,
              );
              await f.store.recordSharedReceipt(refused, actor, {
                'id': refused,
                'owner_id': actor,
                'group_id': group,
                'outcome': 'rejected',
                'reason':
                    'Fixture sources changed; review current participants.',
              });
              await f.store.saveDraft('shared-purchase:$refused', refused, {
                'privateSource': missingPurchase,
                'group': group,
                'bill': refused,
              });
            });
            final saved = find.byKey(ValueKey('shared-intent-$refused'));
            await localWait(tester, () => saved.evaluate().isNotEmpty);
            await localTap(tester, saved);
            expect(find.text('Retained rejected purchase'), findsOneWidget);
            await localTap(tester, find.text('Create corrected draft'));
            await localWait(tester, () => field.evaluate().isNotEmpty);
            expect(
              tester.widget<TextField>(field).controller!.text,
              'Retained rejected purchase',
            );
            var linkRead = false, linkCopied = false;
            final links = f.store.db
                .getAll(
                  "SELECT command_id,values_json FROM local_draft WHERE operation LIKE 'shared-purchase:%'",
                )
                .then((rows) {
                  linkCopied = rows.any(
                    (r) =>
                        r['command_id'] != refused &&
                        r['command_id'] != source &&
                        (jsonDecode(r['values_json'] as String)
                                as Map)['privateSource'] ==
                            missingPurchase,
                  );
                })
                .whenComplete(() => linkRead = true);
            for (var i = 0; i < 300 && !linkRead; i++) {
              await tester.pump(const Duration(milliseconds: 20));
              await tester.runAsync(
                () => Future<void>.delayed(const Duration(milliseconds: 10)),
              );
            }
            expect(linkRead, isTrue);
            await links;
            expect(linkCopied, isTrue);
            await localTap(tester, find.text('Close').last);
            expect(saved, findsOneWidget);
            expect(tester.takeException(), isNull);
            await localTap(
              tester,
              find.widgetWithText(TextButton, 'Lifecycle'),
            );
            await localTap(tester, find.text('Revoke invitation'));
            final issued = find.byKey(
              const ValueKey('shared-field-invitation'),
            );
            await localWait(tester, () => issued.evaluate().isNotEmpty);
            expect(
              tester
                  .widget<DropdownButtonFormField<String>>(issued)
                  .initialValue,
              invitation,
            );
            await localTap(tester, find.text('Review').last);
            expect(
              find.textContaining('reference ${invitation.substring(0, 8)}'),
              findsOneWidget,
            );
            await localTap(tester, find.text('Close').last);
            expect(tester.takeException(), isNull);
            await localTap(tester, find.widgetWithText(TextButton, 'Bills'));
            await localTap(
              tester,
              find.byKey(ValueKey('private-bill-$source')),
            );
            await localWait(
              tester,
              () => find
                  .textContaining('The saved private purchase changed.')
                  .evaluate()
                  .isNotEmpty,
            );
            expect(
              find.byKey(const ValueKey('shared-field-account')),
              findsNothing,
            );
            await localTap(tester, find.text('Close').last);
            expect(tester.takeException(), isNull);
          } finally {
            debugDefaultTargetPlatformOverride = null;
            await tester.pumpWidget(const SizedBox.shrink());
            await tester.pumpAndSettle();
            var closed = false;
            final closing = (() async {
              await runtime.close();
              runtime.dispose();
              settings.dispose();
              await f.close();
            })().whenComplete(() => closed = true);
            for (var i = 0; i < 300 && !closed; i++) {
              await tester.pump(const Duration(milliseconds: 20));
              await tester.runAsync(
                () => Future<void>.delayed(const Duration(milliseconds: 10)),
              );
            }
            expect(closed, isTrue);
            await closing;
          }
        },
      );
    }
  }
}
