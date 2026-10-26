import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/finance/file_store.dart';
import 'package:salapiya/local/finance_domain.dart';

import 'local_test_support.dart';

void main() {
  test('private file bytes authenticate metadata, preserve source history and report absence honestly', () async {
    final f = await LocalFixture.open();
    addTearDown(f.close);
    final account = await f.account('Private wallet');
    final expense = await f.post('expense', {
      'name': 'Receipt purchase',
      'account': account,
      'amount': '20.00',
      'category': 'category-food',
    });
    final id = newLocalId();
    final bytes = utf8.encode(
      '%PDF-1.7\nSynthetic receipt, not a safety assertion.',
    );
    final values = <String, String>{
      'name': 'receipt.pdf',
      'date': '2026-10-21',
      'sourceRevision': expense,
      'mime': 'application/pdf',
      'size': '${bytes.length}',
      'checksum': sha256.convert(bytes).toString(),
    };
    final key = base64Url.encode(List.generate(32, (i) => i));
    final files = FinancialFileStore(
      f.store,
      Directory('${f.directory.path}/private-files'),
      () async => key,
    );
    await f.store.saveDraft('files:attach', id, values);
    await files.write(id, values, bytes);
    expect(await files.readMetadata(id, values), bytes);
    expect(
      utf8.decode(await files.object(id).readAsBytes(), allowMalformed: true),
      isNot(contains('Synthetic receipt')),
    );
    await f.store.commit(await f.command('financialFile', values, id: id));
    final before = await f.store.snapshot();
    expect(before.revision(id).postings, isEmpty);
    expect(before.revision(id).values['cloudState'], 'unavailable_unscanned');
    expect(await files.read(id), bytes);
    await expectLater(
      files.readMetadata(id, {...values, 'sourceRevision': account}),
      throwsA(anything),
    );
    final wrong = FinancialFileStore(
      f.store,
      files.directory,
      () async => base64Url.encode(List.filled(32, 99)),
    );
    await expectLater(wrong.read(id), throwsA(anything));
    expect(await files.present(id), isTrue);
    await files.removeLocalCopy(id);
    expect(await files.present(id), isFalse);
    await expectLater(files.read(id), throwsA(isA<LocalRuleException>()));
    expect(
      (await f.store.snapshot()).revision(id).values['checksum'],
      values['checksum'],
    );
    await files.write(id, values, bytes);
    final encrypted = await files.object(id).readAsBytes();
    encrypted[encrypted.length - 1] ^= 1;
    await files.object(id).writeAsBytes(encrypted, flush: true);
    await expectLater(files.read(id), throwsA(anything));
    expect(await files.object(id).exists(), isTrue);
  });

  test(
    'format hints and historical metadata never assert a safety scan',
    () async {
      final f = await LocalFixture.open();
      addTearDown(f.close);
      final account = await f.account('Cash');
      final expense = await f.post('expense', {
        'name': 'Original source',
        'account': account,
        'amount': '10.00',
        'category': 'category-food',
      });
      final values = {
        'name': 'a.pdf',
        'sourceRevision': expense,
        'mime': 'application/pdf',
        'size': '10',
        'checksum': 'a' * 64,
      };
      final file = await f.post('financialFile', values);
      await f.post('correction', {
        'source': expense,
        'sourceVersion': '1',
        'reason': 'Original amount corrected',
        'name': 'Corrected source',
        'account': account,
        'amount': '12.00',
        'category': 'category-food',
      });
      expect((await f.store.snapshot()).revision(file).source, expense);
      await f.post('fileDetach', {
        'name': 'Archive link',
        'file': file,
        'reason': 'Retain historical source only',
      });
      expect(financialFileDetached(await f.store.snapshot(), file), isTrue);
      expect(
        () => FinancialFileStore.validateFormat(
          'unsafe.pdf',
          utf8.encode('not a PDF'),
        ),
        throwsA(isA<LocalRuleException>()),
      );
      expect(
        () => FinancialFileStore.validateFormat(
          'unsafe.exe',
          utf8.encode('%PDF-1.7'),
        ),
        throwsA(isA<LocalRuleException>()),
      );
    },
  );
}
