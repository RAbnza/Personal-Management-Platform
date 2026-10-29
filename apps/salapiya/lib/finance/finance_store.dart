part of '../local/local_store.dart';

Future<void> _migrateCashImport(SqliteWriteContext tx) async {
  final current = await tx.get(
    "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='local_account_metadata'",
  );
  if ((current['sql'] as String).contains('cashOpeningRebase')) return;
  await tx.execute('DROP TRIGGER local_account_metadata');
  await tx.execute(
    '''CREATE TRIGGER local_account_metadata BEFORE UPDATE ON local_account
   WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.name<>OLD.name OR NEW.kind<>OLD.kind OR NEW.institution<>OLD.institution OR NEW.notes<>OLD.notes OR NOT(
    (NEW.archived=1 AND NEW.cutoff=OLD.cutoff) OR
    (NEW.archived=OLD.archived AND NEW.cutoff<OLD.cutoff AND EXISTS(
      SELECT 1 FROM local_command c WHERE c.owner_id=OLD.owner_id AND json_extract(c.payload,'\$.kind')='cashOpeningRebase'
      AND json_extract(c.payload,'\$.values.account')=OLD.id AND NOT EXISTS(SELECT 1 FROM local_seal seal WHERE seal.command_id=c.id))))
    BEGIN SELECT RAISE(ABORT,'account evidence requires authorized command');END''',
  );
}

void _freshPlanningReview(LocalSnapshot s, LocalCommand c) {
  final recurrenceEdit =
      c.kind == 'financeCorrection' &&
      s.revisions.any(
        (r) => r.id == c.values['replace'] && financeType(r) == 'recurrence',
      );
  if ([
            'reservation',
            'savingsReallocation',
            'cashImportPreview',
          ].contains(c.kind) &&
          c.values['date'] != civilToday() ||
      recurrenceEdit &&
          c.values['date'] !=
              financeZoneToday(c.values['timezone'] ?? 'Asia/Manila')) {
    reject(
      'The review date changed. Review current actual funding or the recurring rule again.',
    );
  }
}

Future<void> _migrateFinance(SqliteWriteContext tx) async {
  final table = await tx.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='local_posting'",
  );
  if ((table['sql'] as String).contains('card_liability')) return;
  // Only the journal leaf changes. FK enforcement remains enabled throughout;
  // old IDs, monetary integers, receipts and seals are copied without alteration.
  await tx.execute(
    _schema
        .firstWhere((s) => s.startsWith('CREATE TABLE local_posting('))
        .replaceFirst('local_posting(', 'local_posting_p4('),
  );
  await tx.execute('INSERT INTO local_posting_p4 SELECT * FROM local_posting');
  await tx.execute('DROP TRIGGER local_seal_balanced');
  await tx.execute('DROP TABLE local_posting');
  await tx.execute('ALTER TABLE local_posting_p4 RENAME TO local_posting');
  await tx.execute(
    'CREATE INDEX local_posting_history ON local_posting(owner_id,account_id,effective_date)',
  );
  for (final op in ['UPDATE', 'DELETE']) {
    await tx.execute(
      "CREATE TRIGGER local_posting_${op.toLowerCase()} BEFORE $op ON local_posting BEGIN SELECT RAISE(ABORT,'immutable financial evidence'); END",
    );
  }
  for (final sql in _triggers.where(
    (s) =>
        s.startsWith('CREATE TRIGGER local_posting_') ||
        s.startsWith('CREATE TRIGGER local_seal_balanced'),
  )) {
    await tx.execute(sql);
  }
}
