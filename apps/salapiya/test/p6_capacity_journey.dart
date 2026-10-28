// Explicit, isolated capacity probe. Not part of the routine fast test suite.
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/finance/reports_screen.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/p0/portable_recovery.dart';

import 'local_test_support.dart';

Map<String, num> distribution(List<int> microseconds) {
  final values = [...microseconds]..sort();
  num at(double q) => values[(values.length * q).ceil() - 1] / 1000;
  return {
    'samples': values.length,
    'p50Ms': at(.5),
    'p95Ms': at(.95),
    'p99Ms': at(.99),
    'maxMs': values.last / 1000,
  };
}

Future<void> capacityJourney(String fixtureDirectory, String output) async {
  final f = await LocalFixture.open();
  final clock = Stopwatch()..start();
  final report = <String, dynamic>{
    'platform': Platform.operatingSystem,
    'os': Platform.operatingSystemVersion,
    'runtime': Platform.version,
    'mode': 'test engine; not installed release startup',
    'fixture': '10,000 ordinary financial actions plus P4 cards/debts/planning and P5 Life history; synthetic only',
    'hostedUploads': 0,
    'sharedGroups': 0,
    'attachmentByteObjects': 0,
  };
  try {
    var version = 0;
    for (final name in ['p4_finance.json', 'p4_debt_components.json']) {
      final fixture = jsonDecode(
        await File('$fixtureDirectory/$name').readAsString(),
      ) as Map;
      for (final raw in fixture['commands'] as List) {
        final row = raw as Map;
        final decoded = LocalCommand.decode(
          row['id'] as String,
          (row['payload'] as String).replaceAll(
            fixture['profile'] as String,
            f.store.owner,
          ),
        );
        await f.store.commit(
          LocalCommand(
            id: decoded.id,
            owner: f.store.owner,
            expectedVersion: version++,
            kind: decoded.kind,
            values: decoded.values,
          ),
          recordedAt: '2026-10-26T00:00:00Z',
        );
      }
    }
    final life = jsonDecode(
      await File('$fixtureDirectory/p5_life.json').readAsString(),
    ) as Map;
    for (final raw in life['commands'] as List) {
      final row = raw as Map;
      await f.store.commitLife(
        LifeCommand.decode(
          row['id'] as String,
          (row['payload'] as String).replaceAll(
            life['profile'] as String,
            f.store.owner,
          ),
        ),
      );
    }
    final wallet = newLocalId();
    await f.store.commit(
      LocalCommand(
        id: wallet,
        owner: f.store.owner,
        expectedVersion: version++,
        kind: 'account',
        values: {
          'name': 'P6 multi-year capacity wallet',
          'kind': 'Cash',
          'amount': '100000.00',
          'cutoff': '2020-01-01',
          'date': '2020-01-01',
          'acknowledge': 'false',
        },
      ),
    );
    final saves = <int>[];
    var expected = BigInt.from(10000000);
    for (var i = 0; i < 10000; i++) {
      final income = i % 5 == 0;
      final minor = (i % 99) + 1;
      final date = DateTime.utc(
        2020,
        1,
        2,
      ).add(Duration(days: i % 2400)).toIso8601String().substring(0, 10);
      final command = LocalCommand(
        id: newLocalId(),
        owner: f.store.owner,
        expectedVersion: version++,
        kind: income ? 'income' : 'expense',
        values: {
          'name': 'Synthetic capacity $i',
          'date': date,
          'account': wallet,
          'amount': '0.${minor.toString().padLeft(2, '0')}',
          'category': income ? 'category-income' : 'category-food',
          if (income) 'incomeClass': 'earned',
          'acknowledge': 'false',
        },
      );
      final sample = Stopwatch()..start();
      await f.store.commit(command);
      saves.add(sample.elapsedMicroseconds);
      expected += BigInt.from(income ? minor : -minor);
      if ((i + 1) % 1000 == 0) {
        // ignore: avoid_print
        print(
          'P6_CAPACITY_PROGRESS actions=${i + 1} elapsedMs=${clock.elapsedMilliseconds} latestSaveMs=${saves.last / 1000}',
        );
      }
    }
    report['saveAll'] = distribution(saves);
    report['saveAt9001To10000'] = distribution(saves.sublist(9000));
    final reads = <int>[], exports = <int>[], queries = <int>[];
    for (var i = 0; i < 10; i++) {
      var sample = Stopwatch()..start();
      final snapshot = await f.store.snapshot();
      reads.add(sample.elapsedMicroseconds);
      expect(snapshot.balance(wallet), expected);
      sample = Stopwatch()..start();
      final csv = financialCsv(
        snapshot,
        '2020-01-01',
        '2027-01-01',
        account: wallet,
      );
      exports.add(sample.elapsedMicroseconds);
      expect(csv.split('\r\n').length, 10004);
      report['exportBytes'] = utf8.encode(csv).length;
      sample = Stopwatch()..start();
      final page = await f.store.db.getAll(
        'SELECT id,title FROM local_revision WHERE owner_id=? ORDER BY sequence_no DESC LIMIT 25 OFFSET 9975',
        [f.store.owner],
      );
      expect(page.length, 25);
      queries.add(sample.elapsedMicroseconds);
    }
    report['snapshot'] = distribution(reads);
    report['boundedExport'] = distribution(exports);
    report['sqlPage25NearEnd'] = distribution(queries);
    report['commands'] = version;
    report['walletMinor'] = expected.toString();
    report['lifeRecords'] = (await f.store.lifeRecords()).length;
    final backupClock = Stopwatch()..start();
    final archive = await LocalBackup.capture(f.store);
    final secret = await PortableRecovery.newRecoverySecret();
    final bytes = await LocalBackup.seal(archive, secret);
    report['backupMs'] = backupClock.elapsedMilliseconds;
    report['backupBytes'] = bytes.length;
    final fixtureOutput = Directory(
      '${File(output).parent.path}/p6-native-capacity',
    );
    await fixtureOutput.create(recursive: true);
    await f.store.db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    await File('${f.directory.path}/local.sqlite')
        .copy('${fixtureOutput.path}/local.sqlite');
    await File('${fixtureOutput.path}/manifest.json').writeAsString(
      jsonEncode({
        'syntheticOnly': true,
        'key': 'synthetic-p1-key',
        'owner': f.store.owner,
        'wallet': wallet,
        'expectedMinor': expected.toString(),
        'commands': version,
      }),
    );
    final restoreDirectory = await Directory.systemTemp.createTemp(
      'salapiya-p6-restore-',
    );
    final recovered = LocalProfiles(restoreDirectory, MemoryProfileVault());
    try {
      final sample = Stopwatch()..start();
      final restored = await recovered.restore(
        await LocalBackup.unseal(bytes, secret),
      );
      expect((await restored.snapshot()).balance(wallet), expected);
      expect((await restored.snapshot()).version, version);
      report['independentRestoreMs'] = sample.elapsedMilliseconds;
    } finally {
      await recovered.close();
      await restoreDirectory.delete(recursive: true);
    }
    await f.store.integrity();
    await f.store.db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    report['sqliteMainBytes'] = await File('${f.directory.path}/local.sqlite')
        .length();
    report['rssBytesAtEnd'] = ProcessInfo.currentRss;
    report['maxRssBytes'] = math.max(
      ProcessInfo.maxRss,
      ProcessInfo.currentRss,
    );
    report['totalMs'] = clock.elapsedMilliseconds;
    report['limits'] = [
      'No groups in this capacity fixture; bounded group tests run separately.',
      'No physical device, installed release cold start, billed network or storage exhaustion measurement.',
      'Historical P4 commands replayed through production validation; all 10,000 new actions use the real encrypted commit path.',
    ];
    final file = File(output);
    await file.parent.create(recursive: true);
    await file.writeAsString(
      '${const JsonEncoder.withIndent('  ').convert(report)}\n',
    );
    // ignore: avoid_print
    print('P6_CAPACITY ${jsonEncode(report)}');
  } finally {
    await f.close();
  }
}
