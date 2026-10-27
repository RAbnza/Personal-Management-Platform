import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/finance/file_store.dart';
import 'package:salapiya/life/life_domain.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';
import 'package:salapiya/local/local_store.dart';

import 'local_test_support.dart';

void main() {
  test('Career documents retain private source metadata, verified local bytes and honest zero-byte archive coverage', () async {
    final f = await LocalFixture.open(),
        application = newLocalId(),
        document = newLocalId();
    final app = LifeCommand(
      owner: f.store.owner,
      recordId: application,
      type: LifeType.application,
      expectedVersion: 0,
      fields: {
        'title': 'Role',
        'company': 'Synthetic employer',
        'stageDate': '2026-10-26',
      },
      reason: 'Saved',
    );
    await f.store.commitLife(app);
    final bytes = await File('test/fixtures/p4_receipt.png').readAsBytes();
    final command = LifeCommand(
      owner: f.store.owner,
      recordId: document,
      type: LifeType.document,
      expectedVersion: 0,
      fields: {
        'title': 'resume-support.png',
        'application': application,
        'sourceVersion': '1',
        'mime': 'image/png',
        'size': '${bytes.length}',
        'checksum': sha256.convert(bytes).toString(),
      },
      reason: 'Private Career document',
    );
    final record = LifeRecord.read(
      document,
      f.store.owner,
      1,
      LifeType.document,
      command.fields,
    ) as CareerDocumentRecord;
    final files = FinancialFileStore(
      f.store,
      Directory('${f.directory.path}/career'),
      () async => base64UrlEncode(List.generate(32, (i) => i)),
    );
    await files.write(document, record.fileMetadata, bytes);
    await f.store.commitLife(command);
    expect(await files.readMetadata(document, record.fileMetadata), bytes);
    expect((await f.store.snapshot()).version, 0);
    await expectLater(
      f.store.commitLife(
        LifeCommand(
          owner: f.store.owner,
          recordId: document,
          type: LifeType.document,
          expectedVersion: 1,
          fields: {...command.fields, 'checksum': 'a' * 64},
          reason: 'Attempt immutable metadata change',
        ),
      ),
      throwsFormatException,
    );
    final archive = await LocalBackup.capture(f.store);
    expect((archive['life'] as Map)['attachmentByteObjects'], 0);
    final directory = await Directory.systemTemp.createTemp(
          'salapiya-p5-document-restore-',
        ),
        profiles = LocalProfiles(directory, MemoryProfileVault());
    final restored = await profiles.restore(archive),
        copy = (await restored.lifeRecords())[document] as CareerDocumentRecord;
    final destination = FinancialFileStore(
      restored,
      Directory('${directory.path}/career'),
      () async => base64UrlEncode(List.generate(32, (i) => 255 - i)),
    );
    expect(await destination.present(document), isFalse);
    await expectLater(
      destination.readMetadata(document, copy.fileMetadata),
      throwsA(isA<LocalRuleException>()),
    );
    await destination.write(document, copy.fileMetadata, bytes);
    expect(await destination.readMetadata(document, copy.fileMetadata), bytes);
    await expectLater(
      destination.readMetadata(document, {
        ...copy.fileMetadata,
        'sourceRevision': 'career:${newLocalId()}:v1',
      }),
      throwsA(anything),
    );
    await profiles.close();
    await directory.delete(recursive: true);
    await f.close();
  });
}
