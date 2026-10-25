import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;

import '../p0/portable_recovery.dart';
import '../connected/financial_contract.dart';
import 'finance_domain.dart';
import 'local_store.dart';

abstract interface class ProfileVault {
  Future<String?> read();
  Future<void> write(String value);
}

class OsProfileVault implements ProfileVault {
  const OsProfileVault({this.slot = 'salapiya.local.production.v1'});
  static const storage = FlutterSecureStorage();
  final String slot;
  @override
  Future<String?> read() => storage.read(key: slot);
  @override
  Future<void> write(String value) => storage.write(key: slot, value: value);
}

// One protected activation descriptor. It is written before creating a database,
// so an interrupted first-run is resumable without generating a replacement key.
class LocalProfiles {
  LocalProfiles(this.directory, this.vault);
  final Directory directory;
  final ProfileVault vault;
  LocalStore? active;
  bool _opening = false;
  Future<LocalStore?> reopen() async {
    if (active != null) return active;
    if (_opening) reject('Profile startup is already running.');
    _opening = true;
    try {
      await directory.create(recursive: true);
      final encoded = await vault.read();
      if (encoded == null) {
        if (await directory.list().any(
          (f) =>
              p.basename(f.path).endsWith('.sqlite') ||
              p.basename(f.path).contains('.sqlite-'),
        )) {
          reject(
            'Protected profile information is unavailable. Existing encrypted files have been preserved. Restore a portable backup or recover the original OS credentials; no database was reset.',
          );
        }
        return null;
      }
      final descriptor = jsonDecode(encoded) as Map<String, dynamic>;
      return await _open(descriptor);
    } finally {
      _opening = false;
    }
  }

  Future<LocalStore> _open(Map<String, dynamic> d) async {
    final id = d['id'] as String, key = d['key'] as String;
    if (d['version'] != 1 ||
        !RegExp(r'^[0-9a-f-]{36}$').hasMatch(id) ||
        base64Url.decode(key).length != 32 ||
        !['initializing', 'ready', 'restoring'].contains(d['phase'])) {
      reject(
        'Invalid protected profile descriptor. Existing data is preserved.',
      );
    }
    final file = File(p.join(directory.path, '$id.sqlite'));
    if (d['phase'] == 'ready' && !await file.exists()) {
      reject(
        'The active encrypted database is missing. Restore a backup; a new empty profile will not replace it.',
      );
    }
    if (d['phase'] == 'restoring') {
      final name = d['staging'] as String;
      if (!RegExp(r'^[0-9a-f-]{36}\.staging$').hasMatch(name)) {
        reject('Invalid recovery staging descriptor.');
      }
      final staging = File(p.join(directory.path, name));
      if (await staging.exists()) {
        if (await file.exists()) {
          reject(
            'Recovery files need review; both database copies are preserved.',
          );
        }
        final check = openLocalDatabase(staging.path, key);
        try {
          await check.initialize();
          await LocalStore(check, id).integrity();
        } finally {
          await check.close();
        }
        await staging.rename(file.path);
      } else if (!await file.exists()) {
        reject(
          'The verified recovery database is missing. Original archive is required.',
        );
      }
      final check = openLocalDatabase(file.path, key);
      try {
        await check.initialize();
        await LocalStore(check, id).integrity();
      } finally {
        await check.close();
      }
      final ready = {...d, 'phase': 'ready'};
      await vault.write(jsonEncode(ready));
      return _open(ready);
    }
    final db = openLocalDatabase(file.path, key);
    try {
      await db.initialize();
      final store = LocalStore(db, id);
      await store.migrate();
      if (d['phase'] == 'initializing') {
        await store.initializeProfile(
          d['name'] as String,
          Map<String, String>.from(d['preferences'] as Map),
        );
      }
      if (d['connected'] case final Map remote) {
        if (await store.connection() == null) {
          await store.db.execute(
            '''INSERT INTO connected_profile(profile_id,remote_owner,email,phase,enrollment_id)
            VALUES(?,?,?,'published',?)''',
            [id, remote['owner'], remote['email'], newLocalId()],
          );
        }
      }
      await store.integrity();
      if (d['phase'] != 'ready') {
        await vault.write(jsonEncode({...d, 'phase': 'ready'}));
      }
      active = store;
      return store;
    } catch (_) {
      await db.close();
      rethrow;
    }
  }

  Future<LocalStore> create(
    String name,
    Map<String, String> preferences,
  ) async {
    if (name.trim().isEmpty || name.trim().length > 200) {
      reject('Enter a display name (1–200 characters).');
    }
    if (active != null || await vault.read() != null) {
      reject('One profile is already initialized. Reopen it instead.');
    }
    await directory.create(recursive: true);
    if (await directory.list().any(
      (f) => p.basename(f.path).contains('.sqlite'),
    )) {
      reject(
        'Existing database files require recovery before creating a profile.',
      );
    }
    final d = {
      'version': 1,
      'phase': 'initializing',
      'id': newLocalId(),
      'key': await PortableRecovery.newRecoverySecret(),
      'name': name.trim(),
      'preferences': preferences,
    };
    await vault.write(jsonEncode(d));
    return _open(d);
  }

  // Preserve the prior descriptor/key in OS secure storage before activating a
  // different cloud profile. Original database files remain at their own paths.
  Future<LocalStore> retrieveConnected(
    String id,
    String name,
    String actor,
    String email, {
    bool preserveCurrent = false,
  }) async {
    final previous = await vault.read();
    if (previous != null && !preserveCurrent) {
      reject('An active profile already exists. Review the safe switch first.');
    }
    if (!RegExp(r'^[0-9a-f-]{36}$').hasMatch(id) ||
        name.trim().isEmpty ||
        name.length > 200) {
      reject('Invalid cloud profile descriptor.');
    }
    final target = File(p.join(directory.path, '$id.sqlite'));
    if (await target.exists()) {
      reject(
        'This cloud profile already has a protected database here. Existing files are preserved; review recovery before switching.',
      );
    }
    await directory.create(recursive: true);
    final descriptor = {
      'version': 1,
      'phase': 'initializing',
      'id': id,
      'key': await PortableRecovery.newRecoverySecret(),
      'name': name,
      'preferences': <String, String>{},
      'connected': {'owner': actor, 'email': email},
      if (previous != null) 'preserved': jsonDecode(previous),
    };
    // Save first: failure keeps the old profile active. Successful save is a
    // resumable activation checkpoint, never deletion of the old key or ledger.
    await vault.write(jsonEncode(descriptor));
    await close();
    return _open(descriptor);
  }

  // Recovery never merges or overwrites an existing profile. Its protected
  // staging descriptor makes final activation resumable across process loss.
  Future<LocalStore> restore(
    Map<String, dynamic> bundle, {
    bool interrupt = false,
    bool interruptActivation = false,
  }) async {
    LocalBackup.validate(bundle);
    final previous = await vault.read();
    if (active != null || previous != null) {
      reject(
        'Recovery activation requires a fresh installation. The current profile is preserved.',
      );
    }
    final id = bundle['owner'] as String;
    final key = await PortableRecovery.newRecoverySecret();
    final staging = File(p.join(directory.path, '${newLocalId()}.staging'));
    await directory.create(recursive: true);
    final db = openLocalDatabase(staging.path, key);
    final store = LocalStore(db, id);
    try {
      await db.initialize();
      await store.migrate();
      await store.initializeProfile(
        bundle['name'] as String,
        Map<String, String>.from(bundle['preferences'] as Map),
      );
      // Replay accepted local commands to validate every financial recipe, version,
      // source dependency and original ID; never import an arbitrary posting dump.
      for (final row in bundle['commands'] as List) {
        final r = row as Map;
        final command = LocalCommand.decode(
          r['id'] as String,
          r['payload'] as String,
        );
        if (bundle['format'] == 2) {
          await store.db.writeTransaction(
            (tx) => store.commitAccepted(
              tx,
              command,
              fromServer: true,
              recordedAt: r['recorded_at'] as String,
            ),
          );
        } else {
          await store.commit(command, recordedAt: r['recorded_at'] as String);
        }
      }
      for (final row in bundle['drafts'] as List) {
        final r = row as Map;
        await store.saveDraft(
          r['operation'] as String,
          r['command_id'] as String,
          Map<String, String>.from(
            jsonDecode(r['values_json'] as String) as Map,
          ),
        );
      }
      if (bundle['format'] == 2) {
        final remote = bundle['connection'] as Map;
        final unpublished = remote['origin'] == 'staged';
        await store.db.execute(
          "INSERT INTO connected_profile(profile_id,remote_owner,email,phase,enrollment_id,enrollment_snapshot,enrollment_name) VALUES(?,?,?,'restored',?,?,?)",
          [
            id,
            remote['remote_owner'],
            remote['email'],
            unpublished ? remote['enrollment_id'] : newLocalId(),
            unpublished ? remote['enrollment_snapshot'] : null,
            unpublished ? remote['enrollment_name'] : null,
          ],
        );
        for (final raw in bundle['intents'] as List) {
          final r = raw as Map;
          await store.db.execute(
            "INSERT INTO connected_intent VALUES(?,?,?,?,?,'restored',?,?)",
            [
              r['id'],
              id,
              r['payload'],
              r['envelope'],
              r['recorded_at'],
              'restored_requires_current_receipt_review',
              r['sequence_no'],
            ],
          );
        }
      }
      await store.integrity();
      if (interrupt) throw StateError('Injected restore interruption');
    } finally {
      await db.close();
    }
    // Staging is closed/checkpointed. Store its key before final rename.
    final target = File(p.join(directory.path, '$id.sqlite'));
    if (await target.exists()) {
      // Existing profiles are deliberately never replaced from an old archive.
      reject(
        'This profile already exists on this installation. Its database and the validated recovery staging file are preserved. Restore on a fresh installation.',
      );
    }
    final descriptor = {
      'version': 1,
      'phase': 'restoring',
      'staging': p.basename(staging.path),
      'id': id,
      'key': key,
      'name': bundle['name'],
      'preferences': bundle['preferences'],
    };
    await vault.write(jsonEncode(descriptor));
    if (interruptActivation) {
      throw StateError('Injected recovery activation interruption');
    }
    return _open(descriptor);
  }

  Future<void> close() async {
    final store = active;
    active = null;
    await store?.close();
  }
}

// Reuses the P0 library AES-256-GCM envelope and independently generated recovery
// secret, with a distinct authenticated P1 header and bounded versioned manifest.
class LocalBackup {
  static final _cipher = AesGcm.with256bits();
  static final _header = utf8.encode('SALAPIYA-LOCAL-ARCHIVE-1\n');
  static const maxBytes = 32 * 1024 * 1024;
  static SecretKey _key(String value) {
    final bytes = base64Url.decode(value.trim());
    if (bytes.length != 32) {
      reject('Enter the complete generated recovery secret.');
    }
    return SecretKey(bytes);
  }

  static Future<Map<String, dynamic>> capture(LocalStore store) =>
      store.db.readTransaction((tx) async {
        final profile = await tx.get(
          'SELECT name,preferences,revision FROM local_profile WHERE id=?',
          [store.owner],
        );
        final commands = await tx.getAll(
          'SELECT id,payload,recorded_at FROM local_command WHERE owner_id=? ORDER BY sequence_no',
          [store.owner],
        );
        final drafts = await tx.getAll(
          'SELECT operation,command_id,values_json FROM local_draft WHERE owner_id=? ORDER BY operation',
          [store.owner],
        );
        final connection = await store.connectionIn(tx);
        final connected = connection != null;
        final result = <String, dynamic>{
          'format': connected ? 2 : 1,
          'localSchema': localSchemaVersion,
          'commandContract': 1,
          'calculationVersion': 1,
          'authority': connected ? 'connected-review-required' : 'local',
          if (connected)
            'connection': {
              'remote_owner': connection['remote_owner'],
              'email': connection['email'],
              'origin': connection['phase'],
              if (connection['phase'] == 'staged' ||
                  (connection['phase'] == 'restored' &&
                      connection['enrollment_snapshot'] != null)) ...{
                'origin': 'staged',
                'enrollment_id': connection['enrollment_id'],
                'enrollment_snapshot': connection['enrollment_snapshot'],
                'enrollment_name': connection['enrollment_name'],
              },
            },
          if (connected)
            'intents': [
              for (final r in await tx.getAll(
                'SELECT id,payload,envelope,recorded_at,sequence_no FROM connected_intent ORDER BY sequence_no',
              ))
                Map<String, dynamic>.from(r),
            ],
          'currency': 'PHP',
          'timezone': 'Asia/Manila',
          'owner': store.owner,
          'name': profile['name'],
          'preferences': jsonDecode(profile['preferences'] as String),
          'createdUtc': DateTime.now().toUtc().toIso8601String(),
          'revision': '${profile['revision']}',
          'commands': commands
              .map((r) => Map<String, dynamic>.from(r))
              .toList(),
          'drafts': drafts.map((r) => Map<String, dynamic>.from(r)).toList(),
          'coverage': 'local-profile-preferences-all-commands-and-drafts-no-attachments-no-cloud-authority',
        };
        validate(result);
        return result;
      });
  static void validate(Map<String, dynamic> b) {
    final connected = b['format'] == 2;
    if (![1, 2].contains(b['format']) ||
        ![1, localSchemaVersion].contains(b['localSchema']) ||
        b['commandContract'] != 1 ||
        b['calculationVersion'] != 1 ||
        b['authority'] != (connected ? 'connected-review-required' : 'local') ||
        b['currency'] != 'PHP' ||
        b['timezone'] != 'Asia/Manila' ||
        b['coverage'] !=
            'local-profile-preferences-all-commands-and-drafts-no-attachments-no-cloud-authority' ||
        !RegExp(r'^[0-9a-f-]{36}$').hasMatch(b['owner'] as String) ||
        (b['name'] as String).trim().isEmpty ||
        (b['name'] as String).length > 200 ||
        DateTime.tryParse(b['createdUtc'] as String) == null ||
        !(b['createdUtc'] as String).endsWith('Z')) {
      reject('Unsupported or invalid local archive.');
    }
    final commands = b['commands'] as List, drafts = b['drafts'] as List;
    Map<String, String>.from(b['preferences'] as Map);
    if (commands.length > 20000 ||
        drafts.length > 100 ||
        b['revision'] != '${commands.length}') {
      reject('Archive counts or version are incompatible.');
    }
    final ids = <String>{};
    for (var i = 0; i < commands.length; i++) {
      final r = commands[i] as Map;
      final c = LocalCommand.decode(r['id'] as String, r['payload'] as String);
      if (!ids.add(c.id) ||
          c.owner != b['owner'] ||
          (connected ? c.expectedVersion < 0 : c.expectedVersion != i) ||
          c.payload != r['payload'] ||
          DateTime.tryParse(r['recorded_at'] as String) == null) {
        reject('Archive command history is incompatible.');
      }
    }
    if (connected) {
      final remote = b['connection'] as Map;
      if (remote['origin'] == 'staged') {
        if (!RegExp(r'^[0-9a-f-]{36}$')
                .hasMatch(remote['enrollment_id'] as String) ||
            (remote['enrollment_name'] as String).trim().isEmpty ||
            canonicalJson(
                  jsonDecode(remote['enrollment_snapshot'] as String),
                ) !=
                canonicalJson(commands)) {
          reject('Invalid unpublished enrollment recovery graph.');
        }
      }
      if (!RegExp(r'^[0-9a-f-]{36}$')
              .hasMatch(remote['remote_owner'] as String) ||
          remote['email'] is! String) {
        reject('Invalid connected recovery identity.');
      }
      final intents = b['intents'] as List;
      if (intents.length > 20000) reject('Unsupported recovery intent count.');
      final intentIds = <String>{};
      var last = 0;
      for (final raw in intents) {
        final r = raw as Map;
        final c = LocalCommand.decode(
          r['id'] as String,
          r['payload'] as String,
        );
        final envelope = jsonDecode(r['envelope'] as String) as Map;
        if (!intentIds.add(c.id) ||
            c.owner != b['owner'] ||
            c.payload != r['payload'] ||
            envelope['contract'] != 2 ||
            envelope['profile_id'] != b['owner'] ||
            envelope['payload'] != c.payload ||
            r['sequence_no'] is! int ||
            (r['sequence_no'] as int) <= last ||
            DateTime.tryParse(r['recorded_at'] as String) == null) {
          reject('Invalid connected recovery intent.');
        }
        last = r['sequence_no'] as int;
      }
    }
    for (final raw in drafts) {
      final r = raw as Map;
      if (ids.contains(r['command_id']) ||
          (r['operation'] as String).length > 200) {
        reject('Invalid restored draft.');
      }
      Map<String, String>.from(jsonDecode(r['values_json'] as String) as Map);
    }
  }

  static Future<Uint8List> seal(
    Map<String, dynamic> bundle,
    String secret,
  ) async {
    validate(bundle);
    final bytes = utf8.encode(jsonEncode(bundle));
    if (bytes.length > maxBytes) {
      reject('Archive exceeds the 32 MiB local recovery limit.');
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
        !List.generate(
          _header.length,
          (i) => bytes[i] == _header[i],
        ).every((x) => x)) {
      reject('Unsupported or incomplete backup file.');
    }
    final plain = await _cipher.decrypt(
      SecretBox.fromConcatenation(
        bytes.sublist(_header.length),
        nonceLength: 12,
        macLength: 16,
      ),
      secretKey: _key(secret),
      aad: _header,
    );
    final bundle = jsonDecode(utf8.decode(plain)) as Map<String, dynamic>;
    validate(bundle);
    return bundle;
  }
}
