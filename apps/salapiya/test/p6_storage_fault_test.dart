import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' show SqliteException;

import 'local_test_support.dart';

void main() {
  test('SQLite capacity exhaustion preserves the draft and whole journal; original-ID retry posts once', () async {
    final f = await LocalFixture.open();
    addTearDown(f.close);
    final account = await f.account('Isolated storage fault', '100.00');
    final command = await f.command('expense', {
      'name': 'Synthetic bounded storage fault',
      'account': account,
      'amount': '1.00',
      'category': 'category-food',
      'notes': 'n' * 18000,
    });
    await f.store.saveDraft('fault-expense', command.id, command.values);
    final pages =
        (await f.store.db.get('PRAGMA page_count'))['page_count'] as int;
    await f.store.db.execute('PRAGMA max_page_count=$pages');
    await expectLater(
      f.store.commit(command),
      throwsA(
        isA<SqliteException>().having(
          (error) => error.resultCode,
          'SQLITE_FULL',
          13,
        ),
      ),
    );
    expect((await f.store.snapshot()).version, 1);
    expect((await f.store.snapshot()).balance(account), BigInt.from(10000));
    expect(await f.store.hasReceipt(command.id), isFalse);
    expect(await f.store.draft('fault-expense'), isNotNull);
    await f.store.db.execute('PRAGMA max_page_count=${pages + 1024}');
    await f.store.commit(command);
    await f.store.commit(command);
    expect((await f.store.snapshot()).version, 2);
    expect((await f.store.snapshot()).balance(account), BigInt.from(9900));
    expect(await f.store.draft('fault-expense'), isNull);
    await f.store.integrity();
  });
}
