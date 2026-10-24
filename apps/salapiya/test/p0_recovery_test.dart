import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/p0/local_ledger.dart';
import 'package:salapiya/p0/portable_recovery.dart';
import 'package:salapiya/p0/private_file_protection.dart';
import 'package:salapiya/p0/proof_database.dart';

void main() {
  test('portable authenticated recovery; no OS key, token or automatic command replay', () async {
    final dir = await Directory.systemTemp.createTemp('salapiya-recovery-');
    final source = openProofDatabase(
      '${dir.path}/source.sqlite',
      'original-device-key',
    );
    final target = openProofDatabase(
      '${dir.path}/target.sqlite',
      'different-device-key',
    );
    try {
      await source.initialize();
      await target.initialize();
      await LocalLedger(source).migrate();
      await LocalLedger(target).migrate();
      await LocalLedger(source)
          .expense(id: 'local', owner: 'a', amount: '500050');
      await LocalLedger(source)
          .expense(id: 'pending', owner: 'a', amount: '1', connected: true);
      await LocalLedger(source)
          .expense(id: 'accepted', owner: 'a', amount: '2', connected: true);
      await source.execute(
        "UPDATE proof_intent SET state='accepted' WHERE id='accepted'",
      );
      final bundle = await PortableRecovery.capture(source, 'a', {
        'receipt': utf8.encode('private-file-marker'),
      });
      final secret = await PortableRecovery.newRecoverySecret();
      final fileKey = await PortableRecovery.newRecoverySecret();
      final protectedFile = File('${dir.path}/private.enc');
      await protectedFile.writeAsBytes(
        await PrivateFileProtection.encrypt(
          utf8.encode('private-file-marker'),
          fileKey,
        ),
        flush: true,
      );
      final protectedBytes = await protectedFile.readAsBytes();
      expect(
        String.fromCharCodes(protectedBytes).contains('private-file-marker'),
        isFalse,
      );
      expect(
        utf8.decode(
          await PrivateFileProtection.decrypt(protectedBytes, fileKey),
        ),
        'private-file-marker',
      );
      await expectLater(
        PrivateFileProtection.decrypt(protectedBytes, secret),
        throwsA(anything),
      );
      final tamperedFile = [...protectedBytes]
        ..[protectedBytes.length - 1] ^= 1;
      await expectLater(
        PrivateFileProtection.decrypt(tamperedFile, fileKey),
        throwsA(anything),
      );
      final archive = await PortableRecovery.seal(bundle, secret);
      expect(
        String.fromCharCodes(archive).contains('private-file-marker'),
        isFalse,
      );
      final second = await PortableRecovery.seal(bundle, secret);
      expect(archive, isNot(equals(second))); // fresh nonce each encryption
      await expectLater(
        PortableRecovery.unseal(
          archive,
          await PortableRecovery.newRecoverySecret(),
        ),
        throwsA(anything),
      );
      for (final changed in [
        archive.sublist(0, archive.length - 1),
        [...archive]..[archive.length - 1] ^= 1,
        [...archive]..[0] ^= 1,
      ]) {
        await expectLater(
          PortableRecovery.unseal(changed, secret),
          throwsA(anything),
        );
      }
      final restored = await PortableRecovery.unseal(archive, secret);
      await expectLater(
        PortableRecovery.restore(target, restored, 'wrong-owner'),
        throwsStateError,
      );
      await expectLater(
        PortableRecovery.restore(target, restored, 'a', interrupt: true),
        throwsStateError,
      );
      expect(
        (await target.get('SELECT count(*) AS n FROM proof_intent'))['n'],
        0,
      );
      final files = await PortableRecovery.restore(target, restored, 'a');
      expect(utf8.decode(files['receipt']!), 'private-file-marker');
      expect(await LocalLedger(target).expenseView('a'), BigInt.from(500050));
      expect(
        (await target.get(
          "SELECT count(*) AS n FROM proof_intent WHERE state='review'",
        ))['n'],
        2,
      );
      expect(await target.getNextCrudTransaction(), isNull);
      await expectLater(
        PortableRecovery.restore(target, restored, 'a'),
        throwsStateError,
      );
      final missing = jsonDecode(jsonEncode(bundle)) as Map<String, dynamic>;
      (missing['evidence'] as List).removeLast();
      await expectLater(
        PortableRecovery.seal(missing, secret),
        throwsFormatException,
      );
      final token = jsonDecode(jsonEncode(bundle)) as Map<String, dynamic>;
      token['access_token'] = 'forbidden';
      await expectLater(
        PortableRecovery.seal(token, secret),
        throwsFormatException,
      );
      final traversal = jsonDecode(jsonEncode(bundle)) as Map<String, dynamic>;
      traversal['files'] = [
        {'id': '../escape', 'bytes': '', 'sha256': '0' * 64},
      ];
      await expectLater(
        PortableRecovery.seal(traversal, secret),
        throwsFormatException,
      );
      final output = File('${dir.path}/portable.backup');
      await expectLater(
        PortableRecovery.writeNewArchive(output, archive, interrupt: true),
        throwsStateError,
      );
      expect(await output.exists(), isFalse);
      expect(await File('${output.path}.partial').exists(), isTrue);
      await expectLater(
        PortableRecovery.writeNewArchive(output, archive),
        throwsStateError,
      );
    } finally {
      await source.close();
      await target.close();
      await dir.delete(recursive: true);
    }
  });
}
