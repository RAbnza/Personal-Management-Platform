// Opt-in synthetic capacity extension. Reuses the verified 10,046-command
// baseline without regenerating it or uploading a large fixture to providers.
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/finance/reports_screen.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/p0/portable_recovery.dart';
import 'package:salapiya/shared/shared_domain.dart';

import '../test/local_test_support.dart';
import '../test/p6_capacity_journey.dart' show distribution;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('mixed-domain encrypted 10k history, group projections, metadata and independent recovery', () async {
    final baseline = jsonDecode(
      await File('build/p6-native-capacity/manifest.json').readAsString(),
    ) as Map;
    expect(baseline['syntheticOnly'], true);
    expect(baseline['commands'], 10046);
    final directory = Directory('build/release-mixed-capacity-${newLocalId()}');
    await directory.create();
    for (final suffix in ['', '-wal']) {
      final source = File('build/p6-native-capacity/local.sqlite$suffix');
      if (await source.exists()) {
        await source.copy('${directory.path}/local.sqlite$suffix');
      }
    }
    final db = openLocalDatabase(
      '${directory.path}/local.sqlite',
      baseline['key'] as String,
    );
    await db.initialize();
    final store = LocalStore(db, baseline['owner'] as String);
    final actor = newLocalId();
    final timings = <String, dynamic>{
      'platform': Platform.operatingSystem,
      'os': Platform.operatingSystemVersion,
      'mode': 'Flutter test engine; not installed release',
      'hostedUploads': 0,
      'baselineFinancialCommands': 10046,
      'groups': 3,
      'bills': 750,
      'retainedBillRevisions': 1500,
      'confirmedSettlements': 75,
      'refunds': 75,
      'attachmentMetadata': 30,
      'originalAttachmentBytes': 0,
      'groupEvidence': 'Injected synthetic download projections; local domain/query capacity only, no hosted authority or concurrency claim',
    };
    try {
      await store.migrate();
      await store.integrity();
      var snapshot = await store.snapshot();
      expect(snapshot.version, 10046);
      final wallet = baseline['wallet'] as String;
      expect(snapshot.balance(wallet).toString(), baseline['expectedMinor']);
      final baselineCommands = await db.getAll(
        'SELECT id,payload FROM local_command ORDER BY sequence_no',
      );
      for (var g = 0; g < 3; g++) {
        final group = newLocalId(), payer = newLocalId(), peer = newLocalId();
        final bills = <String, dynamic>{}, settlements = <String, dynamic>{};
        for (var i = 0; i < 250; i++) {
          final id = newLocalId(), revision = newLocalId();
          final date = DateTime.utc(
            2020,
            1,
            2,
          ).add(Duration(days: i * 8 + g)).toIso8601String().substring(0, 10);
          bills[id] = {
            'creator': payer,
            'revisions': [
              {
                'id': id,
                'name': 'Synthetic shared bill $i',
                'date': date,
                'total': '10000',
                'paid': {payer: '10000'},
                'shares': {payer: '5000', peer: '5000'},
                'method': 'exact',
              },
              {
                'id': revision,
                'name': 'Corrected shared bill $i',
                'date': date,
                'total': '10001',
                'paid': {payer: '10001'},
                'shares': {payer: '5001', peer: '5000'},
                'method': 'exact',
              },
            ],
            'refunds': i < 25
                ? [
                    {
                      'id': newLocalId(),
                      'received': {payer: '100'},
                      'credits': {payer: '50', peer: '50'},
                    },
                  ]
                : [],
          };
          if (i < 25) {
            final settlement = newLocalId();
            settlements[settlement] = {
              'id': settlement,
              'sender': peer,
              'recipient': payer,
              'amount': '2000',
              'advance': '0',
              'state': 'confirmed',
              'allocations': {
                id: {'revision': revision, 'amount': '2000'},
              },
              'events': [],
            };
          }
        }
        final document = {
          'id': group,
          'name': 'Synthetic multi-year group $g',
          'owner': payer,
          'version': 576,
          'complete': true,
          'archived': false,
          'people': {
            payer: {
              'name': 'Synthetic payer',
              'user': actor,
              'active': true,
              'kind': 'registered',
            },
            peer: {
              'name': 'Synthetic peer',
              'user': newLocalId(),
              'active': true,
              'kind': 'registered',
            },
          },
          'bills': bills,
          'settlements': settlements,
          'activity': [],
        };
        final model = SharedGroup(document);
        expect(sumMinor(model.positions().values), BigInt.zero);
        await db.execute(
          'INSERT INTO p3_group(id,owner_id,group_id,version,document) VALUES(?,?,?,?,?)',
          ['$group:$actor', actor, group, 576, jsonEncode(document)],
        );
      }
      await store.reconcileSharedSnapshots();
      final metadataSource = snapshot.current
          .firstWhere((r) => r.kind == 'expense')
          .id;
      for (var i = 0; i < 30; i++) {
        await store.commit(
          LocalCommand(
            id: newLocalId(),
            owner: store.owner,
            expectedVersion: snapshot.version + i,
            kind: 'financialFile',
            values: {
              'date': civilToday(),
              'name': 'synthetic-receipt-$i.pdf',
              'sourceRevision': metadataSource,
              'mime': 'application/pdf',
              'size': '1024',
              'checksum': sha256
                  .convert(utf8.encode('synthetic-original-$i'))
                  .toString(),
            },
          ),
        );
      }
      snapshot = await store.snapshot();
      final secondAccount = snapshot.accounts
          .firstWhere((a) => a.id != wallet && !a.archived)
          .id;
      for (var i = 0; i < 2; i++) {
        await store.commit(
          LocalCommand(
            id: newLocalId(),
            owner: store.owner,
            expectedVersion: snapshot.version + i,
            kind: 'transfer',
            values: {
              'date': civilToday(),
              'name': 'Synthetic paired transfer $i',
              'account': i == 0 ? wallet : secondAccount,
              'destination': i == 0 ? secondAccount : wallet,
              'amount': '1.00',
              'fee': '0.00',
              'feeTreatment': 'separate',
              'feeCategory': 'category-fees',
              'acknowledge': 'false',
            },
          ),
        );
      }
      final lifeFixture = jsonDecode(
        await File('../../contracts/salapiya/p5_life.json').readAsString(),
      ) as Map;
      final templates = <String, Map>{};
      for (final raw in lifeFixture['commands'] as List) {
        final body = jsonDecode((raw as Map)['payload'] as String) as Map;
        if (body['expectedVersion'] == 0 &&
            [
              'task',
              'learning',
              'book',
              'application',
              'personal',
            ].contains(body['type'])) {
          templates.putIfAbsent(body['type'] as String, () => body);
        }
      }
      expect(templates.length, 5);
      for (var i = 0; i < 500; i++) {
        final body = templates.values.elementAt(i % templates.length);
        await store.commitLife(
          LifeCommand(
            owner: store.owner,
            recordId: newLocalId(),
            type: LifeType.values.firstWhere((t) => t.name == body['type']),
            expectedVersion: 0,
            fields: {
              ...Map<String, String>.from(body['fields'] as Map),
              'title': 'Synthetic mixed Life $i',
            },
            reason: 'Isolated multi-year capacity fixture',
            recordedAt: DateTime.utc(2026, 10, 29),
          ),
        );
      }
      snapshot = await store.snapshot();
      final saves = <int>[],
          queries = <int>[],
          reports = <int>[],
          groups = <int>[];
      for (var i = 0; i < 20; i++) {
        final sample = Stopwatch()..start();
        await store.commit(
          LocalCommand(
            id: newLocalId(),
            owner: store.owner,
            expectedVersion: snapshot.version + i,
            kind: 'income',
            values: {
              'name': 'Mixed capacity save $i',
              'account': wallet,
              'amount': '0.01',
              'date': civilToday(),
              'category': 'category-income',
              'incomeClass': 'earned',
              'acknowledge': 'false',
            },
          ),
        );
        saves.add(sample.elapsedMicroseconds);
      }
      for (var i = 0; i < 10; i++) {
        var sample = Stopwatch()..start();
        snapshot = await store.snapshot();
        queries.add(sample.elapsedMicroseconds);
        sample = Stopwatch()..start();
        financialCsv(snapshot, '2020-01-01', '2027-01-01', account: wallet);
        reports.add(sample.elapsedMicroseconds);
        sample = Stopwatch()..start();
        for (final row in await db.getAll(
          'SELECT document FROM shared_snapshot_cache',
        )) {
          final group = SharedGroup(
            Map<String, dynamic>.from(
              jsonDecode(row['document'] as String) as Map,
            ),
          );
          expect(sumMinor(group.positions().values), BigInt.zero);
          group.reciprocalPairs;
        }
        groups.add(sample.elapsedMicroseconds);
      }
      expect(
        snapshot.balance(wallet),
        BigInt.parse(baseline['expectedMinor'] as String) + BigInt.from(20),
      );
      expect(
        await db.getAll(
          'SELECT id,payload FROM local_command ORDER BY sequence_no LIMIT 10046',
        ),
        baselineCommands,
      );
      timings.addAll({
        'localSave': distribution(saves),
        'snapshot': distribution(queries),
        'financialCsvReport': distribution(reports),
        'threeGroupPositionsAndPairs': distribution(groups),
        'financialCommands': snapshot.version,
        'lifeRecords': (await store.lifeRecords()).length,
        'financeTypes': await db.getAll(
          "SELECT coalesce(json_extract(values_json,'\$.financeType'),kind) type,count(*) count FROM local_revision GROUP BY type",
        ),
      });
      final backup = Stopwatch()..start(),
          secret = await PortableRecovery.newRecoverySecret();
      final before = await LocalBackup.capture(store),
          bytes = await LocalBackup.seal(before, secret);
      timings.addAll({
        'backupMs': backup.elapsedMilliseconds,
        'backupBytes': bytes.length,
      });
      final restoreDirectory = await Directory.systemTemp.createTemp(
        'salapiya-release-mixed-restore-',
      );
      final recovered = LocalProfiles(restoreDirectory, MemoryProfileVault());
      try {
        final restore = Stopwatch()..start();
        final target = await recovered.restore(
          await LocalBackup.unseal(bytes, secret),
        );
        final after = await LocalBackup.capture(target);
        expect(after['commands'], before['commands']);
        expect(after['life'], before['life']);
        expect(
          (await target.snapshot()).balance(wallet),
          snapshot.balance(wallet),
        );
        timings['independentRestoreMs'] = restore.elapsedMilliseconds;
      } finally {
        await recovered.close();
        await restoreDirectory.delete(recursive: true);
      }
      await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
      timings.addAll({
        'databaseBytes': await File('${directory.path}/local.sqlite').length(),
        'rssBytes': ProcessInfo.currentRss,
        'maxRssBytes': ProcessInfo.maxRss,
        'fixtureDirectory': directory.path,
      });
      await File('${directory.path}/manifest.json').writeAsString(
        jsonEncode({
          ...baseline,
          'commands': snapshot.version,
          'expectedMinor': snapshot.balance(wallet).toString(),
          'mixedGroups': 3,
          'syntheticOnly': true,
        }),
      );
      await File('build/release-mixed-capacity.json').writeAsString(
        '${const JsonEncoder.withIndent('  ').convert(timings)}\n',
      );
      // ignore: avoid_print
      print('RELEASE_MIXED_CAPACITY ${jsonEncode(timings)}');
    } finally {
      await db.close();
    }
  }, timeout: const Timeout(Duration(minutes: 30)));
}
