import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:salapiya/app.dart';
import 'package:salapiya/gallery/settings.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_runtime.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/life/life_controller.dart';
import 'package:salapiya/life/life_domain.dart';

import '../test/local_money_journey.dart';

Future<void> lifeEnter(WidgetTester tester, String key, String value) async {
  final field = find.byKey(ValueKey('life-field-$key'));
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  final editable = find.descendant(
    of: field,
    matching: find.byType(EditableText),
  );
  await tester.runAsync(
    () async => tester
        .state<EditableTextState>(editable)
        .updateEditingValue(
          TextEditingValue(
            text: value,
            selection: TextSelection.collapsed(offset: value.length),
          ),
        ),
  );
  await localSettle(tester);
}

Future<void> lifeSelect(WidgetTester tester, String key, String label) async {
  await localTap(tester, find.byKey(ValueKey('life-field-$key')));
  await localTap(tester, find.text(label).last);
}

Future<void> lifeSave(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await localTap(tester, find.text('Review changes'));
  await localTap(tester, find.text('Confirm & save'));
  await localWait(
    tester,
    () => find.text('Saved on this device').evaluate().isNotEmpty,
  );
  await localTap(tester, find.text('Done'));
}

Future<void> lifeBack(WidgetTester tester) async {
  Navigator.of(tester.element(find.byType(Scaffold).last)).pop();
  await localSettle(tester);
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  if (const bool.fromEnvironment('P5_PICK_DOCUMENT')) {
    // Native accessibility clients can enable platform semantics during picker
    // interaction. Enable them before the tester records its handle baseline;
    // keep both semantics and the SDK's leak verification enabled throughout.
    binding.platformDispatcher.semanticsEnabledTestValue = true;
    tearDownAll(binding.platformDispatcher.clearSemanticsEnabledTestValue);
  }
  testWidgets(
    'P5 production Life presets, authoritative events, history and encrypted restart on the native target',
    (tester) async {
      final support = await getApplicationSupportDirectory(),
          directory = Directory('${support.path}/p5-life-${newLocalId()}');
      final profiles = LocalProfiles(
            directory,
            OsProfileVault(slot: 'salapiya.p5.life.${newLocalId()}'),
          ),
          settings = GallerySettings();
      final runtime = LocalRuntime(profiles, settings);
      final date = LifeTime.today(),
          tomorrow = DateTime.parse('${date}T00:00:00Z')
              .add(const Duration(days: 1))
              .toIso8601String()
              .substring(0, 10);
      try {
        await runtime.create('P5 synthetic owner', ThemeMode.light);
        await tester.pumpWidget(
          SalapiyaApp(
            production: true,
            settings: settings,
            localRuntime: runtime,
          ),
        );
        await localSettle(tester);
        final c = runtime.session!.life as DurableLifeController,
            store = c.store;
        expect(c.records, isEmpty);
        await localTap(tester, find.byKey(const ValueKey('nav-life')));
        await localTap(tester, find.text('New event'));
        await lifeEnter(tester, 'title', 'P5 native personal event');
        await lifeEnter(tester, 'date', tomorrow);
        await lifeEnter(tester, 'time', '');
        await lifeSave(tester);
        expect(c.events.length, 1);
        await localTap(tester, find.text('Agenda').first);
        await localTap(tester, find.text('P5 native personal event').first);
        expect(find.text('P5 native personal event'), findsWidgets);
        await localTap(tester, find.text('Edit event'));
        await lifeEnter(tester, 'location', 'Synthetic venue');
        await lifeEnter(tester, 'reason', 'Correct venue');
        await lifeSave(tester);
        expect(c.events.single.version, 2);
        await lifeBack(tester);

        await localTap(tester, find.text('Tasks').first);
        await localTap(tester, find.text('New task'));
        await lifeEnter(tester, 'title', 'P5 native task');
        await lifeEnter(tester, 'due', tomorrow);
        await lifeSave(tester);
        await localTap(tester, find.text('P5 native task'));
        await localTap(tester, find.text('Complete task'));
        await tester.runAsync(c.reload);
        await localSettle(tester);
        expect(c.entries.single.status, 'Completed');
        expect(
          c
              .agendaWindow(runtime.session!.finance, date, tomorrow)
              .where((r) => r.kind == 'Tasks'),
          isEmpty,
        );
        await localTap(tester, find.text('Reopen task'));
        await localTap(tester, find.text('Archive').first);
        await localTap(tester, find.text('Restore').first);
        expect(c.entries.single.archived, isFalse);
        expect(c.entries.single.status, 'In progress');
        await lifeBack(tester);

        await localTap(tester, find.text('Learning').first);
        await localTap(tester, find.text('New learning goal'));
        await lifeEnter(tester, 'title', 'P5 native learning');
        await lifeEnter(tester, 'total', '12');
        await lifeEnter(tester, 'progress', '3');
        await lifeSave(tester);
        await localTap(tester, find.textContaining('Open learning journal'));
        await localTap(tester, find.text('Log progress'));
        await lifeEnter(tester, 'progress', '12');
        await lifeEnter(tester, 'note', 'Completed explicit progress');
        await lifeSave(tester);
        expect(
          c.entries.where((r) => r.title == 'P5 native learning').single.status,
          'Completed',
        );
        await lifeBack(tester);

        await localTap(tester, find.text('Books').first);
        await localTap(tester, find.text('Add book'));
        await lifeEnter(tester, 'title', 'P5 native book');
        await lifeEnter(tester, 'detail', 'Synthetic author');
        await lifeEnter(tester, 'total', '256');
        await lifeEnter(tester, 'progress', '32');
        await lifeEnter(tester, 'rating', '4.1250');
        await lifeSave(tester);
        expect(
          c.records.values.whereType<BookRecord>().single.author,
          'Synthetic author',
        );
        expect(
          c.records.values.whereType<BookRecord>().single.rating,
          '4.1250',
        );

        await localTap(tester, find.text('Career').first);
        await localTap(tester, find.text('New application'));
        await lifeEnter(tester, 'company', 'P5 synthetic company');
        await lifeEnter(tester, 'position', 'Native engineer');
        await lifeEnter(tester, 'contact', 'Private synthetic recruiter');
        await lifeEnter(tester, 'followUp', tomorrow);
        await lifeSave(tester);
        await localTap(tester, find.text('P5 synthetic company'));
        await localTap(tester, find.text('Edit / change stage'));
        await lifeEnter(tester, 'date', date);
        await lifeSelect(tester, 'stage', 'Applied');
        await lifeEnter(tester, 'reason', 'Submitted today');
        await lifeSave(tester);
        expect(
          c.records.values.whereType<ApplicationRecord>().single.stage,
          'Applied',
        );
        await localTap(tester, find.text('Add interview / follow-up'));
        await lifeEnter(tester, 'date', tomorrow);
        await lifeEnter(tester, 'time', '10:00');
        await lifeEnter(tester, 'location', 'https://example.test/meeting');
        await lifeSave(tester);
        expect(c.records.values.whereType<CareerEventRecord>().length, 1);
        if (const bool.fromEnvironment('P5_PICK_DOCUMENT')) {
          debugPrint(
            'P5_NATIVE_DOCUMENT: select the synthetic p4_receipt.png in the actual platform picker.',
          );
          await localTap(tester, find.text('Select private Career document'));
          for (
            var i = 0;
            i < 600 && find.text('Attach private document?').evaluate().isEmpty;
            i++
          ) {
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 500)),
            );
            await tester.pump();
          }
          expect(find.text('Attach private document?'), findsOneWidget);
          await localTap(tester, find.text('Attach').last);
          await tester.runAsync(c.reload);
          final document = c.records.values
              .whereType<CareerDocumentRecord>()
              .single;
          expect(document.title, 'p4_receipt.png');
          expect(document.applicationId, c.applications.single.id);
          expect((await store.snapshot()).version, 0);
          debugPrint(
            'P5_NATIVE_DOCUMENT: actual native selection, explicit confirmation, durable metadata and encrypted local bytes passed.',
          );
        }

        final agenda = c.agendaWindow(runtime.session!.finance, date, tomorrow);
        expect(agenda.map((r) => r.id).toSet().length, agenda.length);
        expect(
          agenda.where((r) => r.kind == 'Career').length,
          2,
        ); // follow-up and interview are distinct sources
        expect((await store.snapshot()).version, 0);
        expect((await store.snapshot()).revisions, isEmpty);
        await store.integrity();
        final captured = await LocalBackup.capture(store);
        expect((captured['life'] as Map)['attachmentByteObjects'], 0);
        final ids = c.records.keys.toSet(),
            history = (await store.lifeHistory()).length;
        await tester.pumpWidget(const SizedBox());
        await localSettle(tester);
        await runtime.close();
        runtime.dispose();
        final reopened = LocalRuntime(
          LocalProfiles(directory, profiles.vault),
          settings,
        );
        await reopened.reopen();
        expect(
          (reopened.session!.life as DurableLifeController).records.keys
              .toSet(),
          ids,
        );
        expect(
          (await reopened.session!.localFinance.store.lifeHistory()).length,
          history,
        );
        await reopened.close();
        reopened.dispose();
        debugPrint(
          'P5_NATIVE_LIFE: persisted ${ids.length} real records and $history immutable revisions; financial revision stayed zero.',
        );
      } finally {
        if (runtime.session != null && !runtime.connected.closed) {
          await runtime.close();
          runtime.dispose();
        }
        settings.dispose();
      }
    },
  );
}
