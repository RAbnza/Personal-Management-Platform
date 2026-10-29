import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salapiya/local/finance_domain.dart';
import 'package:salapiya/local/local_profiles.dart';

import 'local_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('offline removal deletes only reviewed profile files, preserves other profiles and permits fresh creation', () async {
    final dir = await Directory.systemTemp.createTemp('salapiya-removal-');
    final vault = MemoryProfileVault();
    final profiles = LocalProfiles(dir, vault);
    try {
      final store = await profiles.create('Synthetic removal', {});
      final id = store.owner;
      await store.saveDraft('expense', newLocalId(), {'amount': '1.23'});
      final attachment = Directory('${dir.path}/$id.attachments');
      await attachment.create();
      await File('${attachment.path}/synthetic.sfp')
          .writeAsString('synthetic-encrypted-placeholder');
      final other = File('${dir.path}/unrelated.keep');
      await other.writeAsString('preserved');
      await expectLater(
        profiles.removeLocal(newLocalId()),
        throwsA(isA<LocalRuleException>()),
      );
      expect(await File('${dir.path}/$id.sqlite').exists(), true);
      await profiles.removeLocal(id);
      expect(await File('${dir.path}/$id.sqlite').exists(), false);
      expect(await attachment.exists(), false);
      expect(await other.readAsString(), 'preserved');
      expect(await profiles.reopen(), null);
      final next = await profiles.create('New independent profile', {});
      expect(next.owner, isNot(id));
    } finally {
      await profiles.close();
      await dir.delete(recursive: true);
    }
  });

  test('protected checkpoint resumes interrupted erasure without regenerating data or deleting preserved keys', () async {
    final dir = await Directory.systemTemp.createTemp(
      'salapiya-removal-resume-',
    );
    final vault = MemoryProfileVault();
    final profiles = LocalProfiles(dir, vault);
    try {
      final store = await profiles.create('Synthetic interruption', {});
      final id = store.owner;
      final d = jsonDecode(vault.value!) as Map<String, dynamic>;
      final otherId = newLocalId();
      final other = File('${dir.path}/$otherId.sqlite');
      await other.writeAsString('unrelated encrypted profile');
      d['preserved'] = {'id': otherId, 'key': 'separate-protected-key'};
      await vault.write(jsonEncode(d));
      // Final descriptor write fails after owned bytes are removed. Restart must
      // finish the same removal rather than treat it as a corrupted ready DB.
      vault.failAt = vault.writes + 2;
      await expectLater(
        profiles.removeLocal(id),
        throwsA(isA<FileSystemException>()),
      );
      expect((jsonDecode(vault.value!) as Map)['phase'], 'removing');
      vault.failAt = null;
      expect(await LocalProfiles(dir, vault).reopen(), null);
      expect(await other.readAsString(), 'unrelated encrypted profile');
      expect((jsonDecode(vault.value!) as Map)['preserved'], d['preserved']);
    } finally {
      await profiles.close();
      await dir.delete(recursive: true);
    }
  });
}
