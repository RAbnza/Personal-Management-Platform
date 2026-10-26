import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_store.dart';
import 'package:salapiya/connected/financial_contract.dart';

import 'local_test_support.dart';

const cashHeader = [
  'date',
  'kind',
  'amount_minor',
  'classification',
  'description',
  'reference',
];
const cashMapping = {
  'date': 'date',
  'kind': 'kind',
  'amountMinor': 'amount_minor',
  'classification': 'classification',
  'description': 'description',
  'reference': 'reference',
};
Future<String> stageCashImport(
  LocalFixture f,
  String account,
  String content, {
  String strategy = 'after_opening',
  String? earlierDate,
  String? earlierMinor,
}) async {
  final rows = parseCashCsv(utf8.encode(content));
  final head = await f.post('cashImport', {
    'name': 'Synthetic cash history',
    'date': '2026-10-26',
    'header': jsonEncode(rows.first),
    'rowCount': '${rows.length - 1}',
    'checksum': List.filled(64, 'a').join(),
    'assumptions': jsonEncode({
      'sourceFormat': 'pmp-cash-activity',
      'formatVersion': 1,
      'currency': 'PHP',
      'account': account,
      'mapping': cashMapping,
      'dateInterpretation': 'YYYY-MM-DD',
      'cutoffStrategy': strategy,
      'earlierDate': earlierDate,
      'earlierMinor': earlierMinor,
    }),
  });
  for (var offset = 0; offset < rows.length - 1; offset += 16) {
    final chunk = rows.skip(offset + 1).take(16).toList();
    final c = await f.command('cashImportChunk', {
      'name': 'Staged CSV rows',
      'date': '2026-10-26',
      'batch': head,
      'offset': '$offset',
      'rowCount': '${chunk.length}',
      for (var i = 0; i < chunk.length; i++) 'row$i': jsonEncode(chunk[i]),
    }, id: importStableId(f.store.owner, head, 'stage/$offset'));
    await f.store.commit(c);
  }
  return f.post('cashImportPreview', {
    'name': 'Reviewed immutable CSV preview',
    'date': '2026-10-26',
    'batch': head,
  });
}

Future<String> decideCashImport(
  LocalFixture f,
  String preview, {
  Set<int> skip = const {},
  bool duplicates = false,
}) async {
  final rows = cashImportRows((await f.store.snapshot()).revision(preview));
  return f.post('cashImportDecision', {
    'name': 'Confirmed row decisions',
    'date': '2026-10-26',
    'preview': preview,
    'rowCount': '${rows.length}',
    'acknowledge': 'false',
    for (var i = 0; i < rows.length; i++)
      'row$i': jsonEncode({
        'include': !skip.contains(i),
        'acknowledgeDuplicates': duplicates,
        'category': rows[i]['kind'] == 'income'
            ? 'category-income'
            : 'category-food',
      }),
  });
}

Future<LocalCommand> processCashImport(LocalFixture f, String decision) async {
  final s = await f.store.snapshot();
  return f.command('cashImportProcess', {
    'name': 'Confirmed bounded processing',
    'date': '2026-10-26',
    'decision': decision,
    'rowNumbers': jsonEncode(nextCashImportRows(s, s.revision(decision))),
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late LocalFixture f;
  setUp(() async {
    f = await LocalFixture.open(owner: '50000000-0000-4000-8000-000000000000');
  });
  tearDown(() => f.close());
  test('canonical atomic history import fixtures reproduce every staged and generated command', () async {
    Future<String> post(int n, String kind, Map<String, String> values) async {
      final c = await f.command(
        kind,
        values,
        id: '50000000-0000-4000-8000-${n.toString().padLeft(12, '0')}',
      );
      await f.store.commit(c);
      return c.id;
    }

    final account = await post(1, 'account', {
      'name': 'Parity historical wallet',
      'kind': 'Cash',
      'cutoff': '2026-10-10',
      'amount': '1000.00',
    });
    final head = await post(2, 'cashImport', {
      'name': 'Version-1 history',
      'date': '2026-10-26',
      'header': jsonEncode(cashHeader),
      'rowCount': '2',
      'checksum': List.filled(64, 'b').join(),
      'assumptions': jsonEncode({
        'sourceFormat': 'pmp-cash-activity',
        'formatVersion': 1,
        'currency': 'PHP',
        'account': account,
        'mapping': cashMapping,
        'dateInterpretation': 'YYYY-MM-DD',
        'cutoffStrategy': 'rebase_history',
        'earlierDate': '2026-10-01',
        'earlierMinor': '70000',
      }),
    });
    final chunk = await f.command('cashImportChunk', {
      'name': 'Original staged rows',
      'date': '2026-10-26',
      'batch': head,
      'offset': '0',
      'rowCount': '2',
      'row0': jsonEncode([
        '2026-10-05',
        'income',
        '50000',
        'earned',
        'Historical salary',
        'old-income',
      ]),
      'row1': jsonEncode([
        '2026-10-06',
        'expense',
        '20000',
        'expense',
        'Historical purchase',
        'old-purchase',
      ]),
    }, id: importStableId(f.store.owner, head, 'stage/0'));
    await f.store.commit(chunk);
    final preview = await post(3, 'cashImportPreview', {
      'name': 'Current immutable preview',
      'date': '2026-10-26',
      'batch': head,
    });
    final decision = await post(4, 'cashImportDecision', {
      'name': 'Explicit row review',
      'date': '2026-10-26',
      'preview': preview,
      'rowCount': '2',
      'acknowledge': 'false',
      'row0': jsonEncode({
        'include': true,
        'acknowledgeDuplicates': false,
        'category': 'category-income',
      }),
      'row1': jsonEncode({
        'include': true,
        'acknowledgeDuplicates': false,
        'category': 'category-food',
      }),
    });
    final process = await post(5, 'cashImportProcess', {
      'name': 'Atomic history processing',
      'date': '2026-10-26',
      'decision': decision,
      'rowNumbers': '[0,1]',
    });
    var replay = LocalSnapshot(
      owner: f.store.owner,
      version: 0,
      accounts: [],
      categories: [
        for (final c in defaultLocalCategories)
          LocalCategory('category-${c.$1}', c.$2, c.$3),
      ],
      revisions: [],
    );
    final commands = <Map<String, dynamic>>[];
    for (final raw in await f.store.db.getAll(
      'SELECT id,payload FROM local_command ORDER BY sequence_no',
    )) {
      final c = LocalCommand.decode(
            raw['id'] as String,
            raw['payload'] as String,
          ),
          plan = planLocal(
            replay,
            LocalCommand.decode(raw['id'] as String, raw['payload'] as String),
          );
      commands.add({
        'id': c.id,
        'payload': c.payload,
        'plan': financialPlanJson(plan),
      });
      replay = applyFinancialPlan(replay, plan);
    }
    final fixture = {
      'profile': f.store.owner,
      'root': process,
      'commands': commands,
    };
    final file = File('../../contracts/salapiya/p4_import.json');
    if (const bool.fromEnvironment('P4_WRITE_FIXTURES')) {
      await file.writeAsString(
        '${const JsonEncoder.withIndent('  ').convert(fixture)}\n',
      );
    } else {
      expect(jsonDecode(await file.readAsString()), fixture);
    }
    expect(replay.balance(account), BigInt.from(100000));
    await f.store.integrity();
  });
  test('reviewed CSV stages, parses quotes exactly, posts once and preserves original row commands', () async {
    final account = await f.account('Wallet', '1000.00', '2026-10-01');
    final preview = await stageCashImport(
      f,
      account,
      'date,kind,amount_minor,classification,description,reference\r\n2026-10-02,expense,10001,expense,"Dinner, shared",r1\r\n2026-10-03,income,20002,gift,Gift,r2\r\n',
    );
    expect((await f.store.snapshot()).balance(account), BigInt.from(100000));
    final decision = await decideCashImport(f, preview),
        process = await processCashImport(f, decision);
    await f.store.commit(process);
    await f.store.commit(process);
    final s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(110001));
    final head = s.revision(preview).values['batch']!;
    expect(
      s.revisions.where((r) => r.id == importStableId(s.owner, head, 1)).length,
      1,
    );
    expect(
      s.revisions.where((r) => r.id == importStableId(s.owner, head, 2)).length,
      1,
    );
    await f.store.integrity();
  });
  test('cutoff rebase and all selected historical rows roll back together and conserve baseline exactly', () async {
    final account = await f.account('Imported wallet', '1000.00', '2026-10-10');
    final preview = await stageCashImport(
      f,
      account,
      'date,kind,amount_minor,classification,description,reference\n2026-10-05,income,50000,earned,Earlier income,history-1\n2026-10-06,expense,20000,expense,Earlier purchase,history-2',
      strategy: 'rebase_history',
      earlierDate: '2026-10-01',
      earlierMinor: '70000',
    );
    final decision = await decideCashImport(f, preview),
        process = await processCashImport(f, decision);
    await expectLater(
      f.store.commit(process, interrupt: true),
      throwsStateError,
    );
    var s = await f.store.snapshot();
    expect(s.account(account).cutoff, '2026-10-10');
    expect(s.balance(account), BigInt.from(100000));
    expect(await f.store.hasReceipt(process.id), false);
    await f.store.commit(process);
    s = await f.store.snapshot();
    expect(s.account(account).cutoff, '2026-10-01');
    expect(s.balance(account), BigInt.from(100000));
    expect(
      s.current.where((r) => r.kind == 'opening').single.amount,
      BigInt.from(70000),
    );
    expect(s.current.where((r) => r.values.containsKey('importRow')).length, 2);
    await f.store.integrity();
  });
  test('wrong coverage, duplicate warnings, malformed input and future dates fail before money posts', () async {
    final account = await f.account('Wallet', '1000.00', '2026-10-10');
    expect(
      () => parseCashCsv(utf8.encode('a,b,c,d,e,f\n"broken,x,y,z,q,p')),
      throwsA(isA<LocalRuleException>()),
    );
    expect(() => parseCashCsv([255]), throwsFormatException);
    final preview = await stageCashImport(
      f,
      account,
      'date,kind,amount_minor,classification,description,reference\n2026-10-05,income,50000,earned,Earlier income,history-1',
      strategy: 'rebase_history',
      earlierDate: '2026-10-01',
      earlierMinor: '70000',
    );
    final decision = await decideCashImport(f, preview),
        process = await processCashImport(f, decision);
    await expectLater(
      f.store.commit(process),
      throwsA(isA<LocalRuleException>()),
    );
    expect((await f.store.snapshot()).balance(account), BigInt.from(100000));
  });
  test('cancellation retains already committed first chunk and restart-safe remaining decisions', () async {
    final account = await f.account('Wallet', '1000.00', '2026-10-01');
    final body =
        'date,kind,amount_minor,classification,description,reference\n${List.generate(60, (i) => '2026-10-02,expense,1,expense,Row $i,ref-$i').join('\n')}';
    final preview = await stageCashImport(f, account, body),
        decision = await decideCashImport(f, preview);
    await f.store.commit(await processCashImport(f, decision));
    var s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(99950));
    expect(nextCashImportRows(s, s.revision(decision)).length, 10);
    await f.post('cashImportCancel', {
      'name': 'Cancel future chunks',
      'decision': decision,
    });
    await expectLater(
      f.store.commit(await processCashImport(f, decision)),
      throwsA(isA<LocalRuleException>()),
    );
    s = await f.store.snapshot();
    expect(s.balance(account), BigInt.from(99950));
    expect(
      s.current.where((r) => r.values.containsKey('importRow')).length,
      50,
    );
    await f.store.integrity();
  });
}
