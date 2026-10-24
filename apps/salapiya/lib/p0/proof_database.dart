import 'package:powersync/powersync.dart';
import 'package:powersync/native.dart';
import 'package:sqlite_async/sqlite_async.dart';

// Synthetic P0 data only. Never open the approved prototype's profile here.
const proofSchema = Schema([
  Table.localOnly('local_probe', [Column.text('value')]),
  Table.insertOnly('command_transport', [Column.text('payload')]),
  Table('p0_profile', [Column.text('owner_id'), Column.integer('revision')]),
  Table('p0_accepted', [
    Column.text('owner_id'),
    Column.text('payload'),
    Column.text('amount_minor'),
    Column.integer('revision'),
  ]),
]);

PowerSyncDatabase openProofDatabase(String path, String key) =>
    PowerSyncDatabase.withFactory(
      _ProofOpenFactory(path, key),
      schema: proofSchema,
      logger: attachedLogger,
    );

final class _ProofOpenFactory extends NativePowerSyncOpenFactory {
  _ProofOpenFactory(String path, String key)
    : super(
        path: path,
        encryptionOptions: EncryptionOptions(key: key),
        sqliteOptions: const SqliteOptions(
          synchronous: SqliteSynchronous.full,
          profileQueries: false,
        ),
      );
  @override
  List<String> pragmaStatements(SqliteOpenOptions options) => [
    ...super.pragmaStatements(options),
    'PRAGMA foreign_keys=ON',
    'PRAGMA temp_store=MEMORY',
  ];
}
