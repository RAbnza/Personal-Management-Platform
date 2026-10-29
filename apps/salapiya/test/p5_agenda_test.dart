import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/connected/financial_contract.dart';
import 'package:salapiya/life/life_controller.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_finance_controller.dart';

import 'local_test_support.dart';

void main() {
  test('financial Calendar and notification sources wait for accepted evidence rather than a pending display projection', () async {
    final fixture = jsonDecode(
      await File('../../contracts/salapiya/p4_finance.json').readAsString(),
    ) as Map;
    final f = await LocalFixture.open(owner: fixture['profile'] as String);
    LocalCommand? pending;
    for (final raw in fixture['commands'] as List) {
      final c = raw as Map,
          command = LocalCommand.decode(
            c['id'] as String,
            c['payload'] as String,
          );
      if (command.kind == 'statement' && command.values['verified'] == 'true') {
        pending = command;
        break;
      }
      await f.store.commit(command, recordedAt: '2026-10-26T00:00:00Z');
    }
    expect(pending, isNotNull);
    final accepted = await f.store.snapshot();
    // Use the same validated plan/overlay operation as the P2 durable queue.
    final projected = applyFinancialPlan(
      accepted,
      planLocal(accepted, pending!),
    );
    final finance = LocalFinancialController(
          f.store,
          projected,
          accepted: accepted,
        ),
        life = DurableLifeController(f.store);
    await life.initialize();
    final id = 'statement:${pending.id}';
    expect(
      financialReminderSources(
        projected,
        '2026-10-01',
        '2026-12-31',
      ).map((r) => r.id),
      contains(id),
    );
    expect(
      life.agendaWindow(finance, '2026-10-01', '2026-12-31').map((r) => r.id),
      isNot(contains(id)),
    );
    expect(
      (await f.store.snapshot()).version,
      accepted.version,
      reason: 'A display projection and Calendar query must not commit financial evidence.',
    );
    await f.store.commit(pending, recordedAt: '2026-10-26T00:00:00Z');
    await finance.reload();
    expect(
      life.agendaWindow(finance, '2026-10-01', '2026-12-31').map((r) => r.id),
      contains(id),
    );
    await life.close();
    life.dispose();
    finance.dispose();
    await f.close();
  });
  test('unified Agenda retains exact P4 authoritative IDs without title/date deduplication or financial effects', () async {
    final fixture = jsonDecode(
      await File('../../contracts/salapiya/p4_finance.json').readAsString(),
    ) as Map;
    final f = await LocalFixture.open(owner: fixture['profile'] as String);
    for (final raw in fixture['commands'] as List) {
      final c = raw as Map;
      await f.store.commit(
        LocalCommand.decode(c['id'] as String, c['payload'] as String),
        recordedAt: '2026-10-26T00:00:00Z',
      );
    }
    final finance = LocalFinancialController(f.store, await f.store.snapshot()),
        life = DurableLifeController(f.store);
    await life.initialize();
    final before = (await f.store.snapshot()).version,
        sources = financialReminderSources(
          finance.snapshot,
          '2026-10-01',
          '2026-12-31',
        );
    expect(sources, isNotEmpty);
    final source = sources.first;
    await life.saveEvent({
      'title': source.title,
      'date': source.date,
      'time': '',
      'timezone': 'Asia/Manila',
    });
    final agenda = life.agendaWindow(finance, '2026-10-01', '2026-12-31');
    expect(agenda.map((r) => r.id).toSet().length, agenda.length);
    expect(
      agenda
          .where((r) => ['Debts', 'Cards', 'Recurring'].contains(r.kind))
          .map((r) => r.id)
          .toSet(),
      sources.map((r) => r.id).toSet(),
    );
    expect(
      agenda
          .where((r) => r.title == source.title && r.date == source.date)
          .length,
      greaterThanOrEqualTo(2),
    );
    expect(
      agenda.singleWhere((r) => r.id == source.id).sourceId,
      source.source,
    );
    expect(
      agenda.singleWhere((r) => r.id == source.id).generation,
      source.version,
    );
    await life.cancelEvent(life.events.single, 'Cancel only personal source');
    expect(
      life
          .agendaWindow(finance, '2026-10-01', '2026-12-31')
          .where((r) => r.kind == 'Personal'),
      isEmpty,
    );
    expect((await f.store.snapshot()).version, before);
    await life.close();
    life.dispose();
    finance.dispose();
    await f.close();
  });
}
