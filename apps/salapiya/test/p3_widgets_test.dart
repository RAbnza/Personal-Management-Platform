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
                'bills': {},
                'settlements': {},
                'activity': [],
              });
              await f.store.db.execute(
                'INSERT INTO p3_group(id,owner_id,group_id,version,document) VALUES(?,?,?,?,?)',
                ['$group:$actor', actor, group, 1, document],
              );
              await runtime.activate(f.store);
            });
            await tester.pumpWidget(
              SalapiyaApp(
                production: true,
                settings: settings,
                localRuntime: runtime,
              ),
            );
            await localSettle(tester);
            await localTap(tester, find.text('Shared Expenses').first);
            await localWait(
              tester,
              () => find.text(name).evaluate().isNotEmpty,
            );
            await localTap(tester, find.text('Add shared expense'));
            final field = find.byKey(const ValueKey('shared-field-name'));
            await localWait(tester, () => field.evaluate().isNotEmpty);
            await tester.ensureVisible(field);
            await tester.tap(field);
            await tester.enterText(field, 'Recoverable keyboard bill');
            await tester.sendKeyEvent(LogicalKeyboardKey.tab);
            await localSettle(tester);
            expect(FocusManager.instance.primaryFocus, isNotNull);
            await tester.runAsync(() async {
              for (var i = 0; i < 50; i++) {
                final drafts = await f.store.db.getAll(
                  'SELECT payload FROM shared_draft',
                );
                if (drafts.any(
                  (d) => (d['payload'] as String).contains(
                    'Recoverable keyboard bill',
                  ),
                )) {
                  return;
                }
                await Future<void>.delayed(const Duration(milliseconds: 20));
              }
              fail('Draft was not persisted');
            });
            await localTap(tester, find.text('Close').last);
            expect(
              await tester.runAsync(
                () => f.store.db.getAll('SELECT id FROM shared_intent'),
              ),
              isEmpty,
            );
            expect(tester.takeException(), isNull);
            await localTap(tester, find.text('Balances'));
            expect(
              find.textContaining('Suggestions are nonposting'),
              findsOneWidget,
            );
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
