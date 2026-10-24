import 'package:powersync/powersync.dart';

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
    PowerSyncDatabase(
      schema: proofSchema,
      path: path,
      encryption: EncryptionOptions(key: key),
    );
