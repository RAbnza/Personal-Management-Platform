part of '../local/local_store.dart';

Future<void> _createSharedSnapshots(SqliteWriteContext tx) async {
  await tx.execute(
    'CREATE TABLE shared_snapshot_cache(group_id TEXT NOT NULL,owner_id TEXT NOT NULL,version INTEGER NOT NULL,document TEXT NOT NULL,metadata_hash TEXT NOT NULL,PRIMARY KEY(owner_id,group_id)) STRICT',
  );
  // Preserve an already downloaded full P3 snapshot during an offline upgrade.
  // Cached history remains separate from current server write authority.
  for (final row in await tx.getAll('SELECT * FROM p3_group')) {
    final raw = row['document'] as String;
    final doc = jsonDecode(raw) as Map;
    if (doc.containsKey('bills') && doc.containsKey('settlements')) {
      await tx.execute('INSERT INTO shared_snapshot_cache VALUES(?,?,?,?,?)', [
        row['group_id'],
        row['owner_id'],
        row['version'],
        raw,
        sha256.convert(utf8.encode(raw)).toString(),
      ]);
    }
  }
}

extension SharedSnapshotStore on LocalStore {
  Future<void> reconcileSharedSnapshots() async {
    final metadata = await db.getAll('SELECT * FROM p3_group');
    if (metadata.isEmpty) return;
    final cached = {
      for (final row in await db.getAll(
        'SELECT owner_id,group_id,version,metadata_hash FROM shared_snapshot_cache',
      ))
        '${row['owner_id']}:${row['group_id']}': row,
    };
    final candidates = metadata.where((row) {
      final prior = cached['${row['owner_id']}:${row['group_id']}'];
      return prior == null ||
          prior['version'] != row['version'] ||
          prior['metadata_hash'] !=
              sha256.convert(utf8.encode(row['document'] as String)).toString();
    }).toList();
    if (candidates.isEmpty) return;
    await db.writeTransaction((tx) async {
      for (final candidate in candidates) {
        final rows = await tx.getAll('SELECT * FROM p3_group WHERE id=?', [
          candidate['id'],
        ]);
        if (rows.isEmpty) continue;
        final row = rows.single, raw = row['document'] as String;
        final data = Map<String, dynamic>.from(jsonDecode(raw) as Map);
        final metadataHash = sha256.convert(utf8.encode(raw)).toString();
        final prior = await tx.getAll(
          'SELECT version,metadata_hash FROM shared_snapshot_cache WHERE owner_id=? AND group_id=?',
          [row['owner_id'], row['group_id']],
        );
        if (prior.isNotEmpty &&
            (prior.single['version'] as int) > (row['version'] as int)) {
          continue;
        }
        if (prior.isNotEmpty &&
            prior.single['version'] == row['version'] &&
            prior.single['metadata_hash'] == metadataHash) {
          continue;
        }
        Map<String, dynamic> document;
        if (data['projection'] == 2) {
          // Partial or mixed download generations cannot replace the last
          // coherent accepted snapshot, even when a receipt already arrived.
          if (data['audienceVersion'] != row['version']) continue;
          final resources = await tx.getAll(
            'SELECT kind,source_id,version,payload FROM p3_resource WHERE owner_id=? AND group_id=? ORDER BY kind,source_id',
            [row['owner_id'], row['group_id']],
          );
          if (resources.length != data['resourceCount']) continue;
          final signature = resources
              .map(
                (r) =>
                    '${r['kind']}:${r['source_id']}:${r['version']}:${sha256.convert(utf8.encode(r['payload'] as String))}',
              )
              .join('\n');
          if (sha256.convert(utf8.encode(signature)).toString() !=
              data['resourceDigest']) {
            continue;
          }
          final bills = <String, dynamic>{},
              settlements = <String, dynamic>{},
              activity = <Map<String, dynamic>>[];
          for (final r in resources) {
            final payload = Map<String, dynamic>.from(
              jsonDecode(r['payload'] as String) as Map,
            );
            switch (r['kind']) {
              case 'bill':
                bills[r['source_id'] as String] = payload;
              case 'settlement':
                settlements[r['source_id'] as String] = payload;
              case 'activity':
                activity.add(payload);
              default:
                reject(
                  'Unsupported group resource; preserve the cache and upgrade Salapiya.',
                );
            }
          }
          activity.sort(
            (a, b) => (a['at'] as String).compareTo(b['at'] as String),
          );
          document = {
            ...data,
            'bills': bills,
            'settlements': settlements,
            'activity': activity,
          };
        } else {
          if (!data.containsKey('bills') || !data.containsKey('settlements')) {
            continue;
          }
          document = data;
        }
        await tx.execute(
          'INSERT INTO shared_snapshot_cache VALUES(?,?,?,?,?) ON CONFLICT(owner_id,group_id) DO UPDATE SET version=excluded.version,document=excluded.document,metadata_hash=excluded.metadata_hash WHERE excluded.version>=shared_snapshot_cache.version',
          [
            row['group_id'],
            row['owner_id'],
            row['version'],
            jsonEncode(document),
            metadataHash,
          ],
        );
      }
    });
  }
}
