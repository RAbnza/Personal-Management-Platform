import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:powersync/powersync.dart';

import 'exact_money.dart';

// Bounded logical P0 archive. No compression, paths, OS keys or session tokens.
// AES-GCM is implemented by cryptography; framing is versioned authenticated data.
class PortableRecovery {
  static final _cipher = AesGcm.with256bits();
  static final _header = utf8.encode('SALAPIYA-P0-ARCHIVE-1\n');
  static const maxBytes = 4 * 1024 * 1024;

  static Future<String> newRecoverySecret() async =>
      base64UrlEncode(await (await _cipher.newSecretKey()).extractBytes());
  static SecretKey _key(String secret) {
    final bytes = base64Url.decode(secret);
    if (bytes.length != 32) {
      throw const FormatException(
        'Recovery secret must contain 256 random bits',
      );
    }
    return SecretKey(bytes);
  }

  static Future<Uint8List> seal(
    Map<String, dynamic> bundle,
    String secret,
  ) async {
    _validate(bundle);
    await _verifyFiles(bundle);
    final bytes = utf8.encode(jsonEncode(bundle));
    if (bytes.length > maxBytes) {
      throw const FormatException('Archive too large');
    }
    final box = await _cipher.encrypt(
      bytes,
      secretKey: _key(secret),
      aad: _header,
    );
    return Uint8List.fromList([..._header, ...box.concatenation()]);
  }

  static Future<Map<String, dynamic>> unseal(
    List<int> bytes,
    String secret,
  ) async {
    if (bytes.length < _header.length + 28 ||
        bytes.length > maxBytes + _header.length + 28 ||
        !_same(bytes.take(_header.length).toList(), _header)) {
      throw const FormatException('Invalid archive framing');
    }
    final plaintext = await _cipher.decrypt(
      SecretBox.fromConcatenation(
        bytes.sublist(_header.length),
        nonceLength: 12,
        macLength: 16,
      ),
      secretKey: _key(secret),
      aad: _header,
    );
    final bundle = jsonDecode(utf8.decode(plaintext)) as Map<String, dynamic>;
    _validate(bundle);
    await _verifyFiles(bundle);
    return bundle;
  }

  static bool _same(List<int> a, List<int> b) =>
      a.length == b.length &&
      List.generate(a.length, (i) => a[i] == b[i]).every((x) => x);
  static void _keys(Map value, Set<String> allowed) {
    if (value.length != allowed.length || !value.keys.every(allowed.contains)) {
      throw const FormatException('Unexpected archive fields');
    }
  }

  static void _validate(Map<String, dynamic> bundle) {
    _keys(bundle, {
      'version',
      'owner',
      'currency',
      'intents',
      'evidence',
      'files',
      'fileCoverage',
      'manifest',
    });
    if (bundle['version'] != 1 ||
        bundle['currency'] != 'PHP' ||
        bundle['owner'] is! String ||
        (bundle['owner'] as String).isEmpty ||
        bundle['fileCoverage'] != 'all-proof-files') {
      throw const FormatException('Unsupported archive contract');
    }
    final intents = bundle['intents'] as List,
        evidence = bundle['evidence'] as List,
        files = bundle['files'] as List;
    final manifest = bundle['manifest'] as Map;
    _keys(manifest, {
      'localSchema',
      'commandVersion',
      'calculationVersion',
      'createdUtc',
      'intentCount',
      'evidenceCount',
      'fileCount',
    });
    if (manifest['localSchema'] != 1 ||
        manifest['commandVersion'] != 1 ||
        manifest['calculationVersion'] != 1 ||
        manifest['intentCount'] != intents.length ||
        manifest['evidenceCount'] != evidence.length ||
        manifest['fileCount'] != files.length ||
        !(manifest['createdUtc'] as String).endsWith('Z') ||
        DateTime.tryParse(manifest['createdUtc'] as String) == null) {
      throw const FormatException('Invalid recovery manifest');
    }
    if (intents.length > 100 ||
        evidence.length != intents.length * 2 ||
        files.length > 10) {
      throw const FormatException('Invalid archive counts');
    }
    final ids = <String>{};
    for (final raw in intents) {
      final row = raw as Map;
      _keys(row, {
        'id',
        'owner_id',
        'payload',
        'amount_minor',
        'state',
        'reason',
      });
      if (row['id'] is! String ||
          !ids.add(row['id'] as String) ||
          row['owner_id'] != bundle['owner'] ||
          ![
            'local',
            'pending',
            'accepted',
            'review',
            'reconciled',
          ].contains(row['state'])) {
        throw const FormatException('Invalid archive intent');
      }
      final amount = row['amount_minor'] as String;
      component(parseMinor(amount), positive: true);
      final payload = jsonDecode(row['payload'] as String) as Map;
      _keys(payload, {
        'amount_minor',
        'expected_revision',
        'kind',
        'owner_id',
        'version',
      });
      if (payload['owner_id'] != bundle['owner'] ||
          payload['amount_minor'] != amount ||
          payload['kind'] != 'expense' ||
          payload['version'] != 1 ||
          payload['expected_revision'] is! int ||
          (payload['expected_revision'] as int) < 0 ||
          (row['reason'] != null && row['reason'] is! String)) {
        throw const FormatException('Payload evidence mismatch');
      }
    }
    final evidenceIds = <String>{};
    for (final raw in evidence) {
      final row = raw as Map;
      _keys(row, {'id', 'intent_id', 'kind', 'amount_minor'});
      if (row['id'] is! String ||
          !evidenceIds.add(row['id'] as String) ||
          !ids.contains(row['intent_id']) ||
          !['expense', 'cash'].contains(row['kind'])) {
        throw const FormatException('Invalid archive evidence');
      }
      parseMinor(row['amount_minor'] as String);
    }
    for (final raw in intents) {
      final rows = evidence
          .where((e) => (e as Map)['intent_id'] == raw['id'])
          .toList();
      if (rows.length != 2 || rows.map((e) => e['kind']).toSet().length != 2) {
        throw const FormatException('Incomplete paired evidence');
      }
      final amount = parseMinor(raw['amount_minor'] as String);
      for (final row in rows) {
        if (parseMinor(row['amount_minor'] as String) !=
            (row['kind'] == 'cash' ? -amount : amount)) {
          throw const FormatException('Unbalanced evidence');
        }
      }
    }
    final fileIds = <String>{};
    for (final raw in files) {
      final row = raw as Map;
      _keys(row, {'id', 'bytes', 'sha256'});
      if (row['id'] is! String ||
          !RegExp(r'^[a-zA-Z0-9_-]{1,64}$').hasMatch(row['id'] as String) ||
          !fileIds.add(row['id'] as String) ||
          base64Decode(row['bytes'] as String).length > 1024 * 1024 ||
          !RegExp(r'^[0-9a-f]{64}$').hasMatch(row['sha256'] as String)) {
        throw const FormatException('Invalid private file');
      }
    }
  }

  static Future<String> _digest(List<int> bytes) async =>
      (await Sha256().hash(bytes)).bytes
          .map((b) => b.toRadixString(16).padLeft(2, '0'))
          .join();
  static Future<void> _verifyFiles(Map<String, dynamic> bundle) async {
    for (final row in bundle['files'] as List) {
      if (await _digest(base64Decode(row['bytes'] as String)) !=
          row['sha256']) {
        throw const FormatException('Private file checksum mismatch');
      }
    }
  }

  static Future<Map<String, dynamic>> capture(
    PowerSyncDatabase db,
    String owner,
    Map<String, List<int>> files,
  ) => db.readTransaction((tx) async {
    final intents = await tx.getAll(
      '''SELECT id,owner_id,payload,CAST(amount_minor AS TEXT) AS amount_minor,state,reason
      FROM proof_intent WHERE owner_id=? ORDER BY id''',
      [owner],
    );
    final evidence = await tx.getAll(
      '''SELECT e.id,e.intent_id,e.kind,CAST(e.amount_minor AS TEXT) AS amount_minor
      FROM proof_evidence e JOIN proof_intent i ON i.id=e.intent_id WHERE i.owner_id=? ORDER BY e.id''',
      [owner],
    );
    final bundle = <String, dynamic>{
      'version': 1,
      'owner': owner,
      'currency': 'PHP',
      'intents': intents.map((r) => Map<String, dynamic>.from(r)).toList(),
      'evidence': evidence.map((r) => Map<String, dynamic>.from(r)).toList(),
      'files': [
        for (final e in files.entries)
          {
            'id': e.key,
            'bytes': base64Encode(e.value),
            'sha256': await _digest(e.value),
          },
      ],
      'fileCoverage': 'all-proof-files',
      'manifest': {
        'localSchema': 1,
        'commandVersion': 1,
        'calculationVersion': 1,
        'createdUtc': DateTime.now().toUtc().toIso8601String(),
        'intentCount': intents.length,
        'evidenceCount': evidence.length,
        'fileCount': files.length,
      },
    };
    _validate(bundle);
    return bundle;
  });

  // Restore to an empty staging database. Caller previews and activates it later.
  // Connected intent is held for receipt/identity review, never blindly replayed.
  static Future<Map<String, List<int>>> restore(
    PowerSyncDatabase db,
    Map<String, dynamic> bundle,
    String expectedOwner, {
    bool interrupt = false,
  }) async {
    _validate(bundle);
    await _verifyFiles(bundle);
    if (bundle['owner'] != expectedOwner) {
      throw StateError('Wrong archive owner');
    }
    await db.writeTransaction((tx) async {
      if ((await tx.get('SELECT count(*) AS n FROM proof_intent'))['n'] != 0 ||
          (await tx.get('SELECT count(*) AS n FROM p0_accepted'))['n'] != 0) {
        throw StateError('Restore requires empty staging database');
      }
      for (final raw in bundle['intents'] as List) {
        final row = raw as Map;
        await tx.execute('INSERT INTO proof_intent VALUES(?,?,?,?,?,?)', [
          row['id'],
          expectedOwner,
          row['payload'],
          sqliteInteger(parseMinor(row['amount_minor'] as String)),
          row['state'] == 'local' ? 'local' : 'review',
          row['state'] == 'local'
              ? row['reason']
              : 'restored_requires_identity_and_receipt_review',
        ]);
      }
      if (interrupt) throw StateError('Injected interrupted restore');
      for (final raw in bundle['evidence'] as List) {
        final row = raw as Map;
        await tx.execute('INSERT INTO proof_evidence VALUES(?,?,?,?)', [
          row['id'],
          row['intent_id'],
          row['kind'],
          sqliteInteger(parseMinor(row['amount_minor'] as String)),
        ]);
      }
    });
    return {
      for (final row in bundle['files'] as List)
        row['id'] as String: base64Decode(row['bytes'] as String),
    };
  }

  static Future<void> writeNewArchive(
    File destination,
    List<int> bytes, {
    bool interrupt = false,
  }) async {
    if (await destination.exists()) {
      throw StateError('Refuse archive overwrite');
    }
    final temp = File('${destination.path}.partial');
    if (await temp.exists()) {
      throw StateError('Previous partial export requires review');
    }
    await temp.writeAsBytes(bytes, flush: true);
    if (interrupt) throw StateError('Injected interrupted export');
    await temp.rename(destination.path);
  }
}
