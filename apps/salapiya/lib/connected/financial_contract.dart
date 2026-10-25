import 'dart:convert';

import '../local/finance_domain.dart';

// A small, versioned financial boundary, shared by projection, enrollment and
// parity tests. This is domain evidence, never a client-authorized ledger write.
Map<String, dynamic> financialPlanJson(LocalPlan p) => {
  'account': p.account == null
      ? null
      : {
          'id': p.account!.id,
          'name': p.account!.name,
          'kind': p.account!.kind,
          'cutoff': p.account!.cutoff,
          'institution': p.account!.institution,
          'notes': p.account!.notes,
        },
  'category': p.category == null
      ? null
      : {
          'id': p.category!.id,
          'name': p.category!.name,
          'kind': p.category!.kind,
        },
  'archiveId': p.archiveId,
  'revision': p.revision == null
      ? null
      : {
          'id': p.revision!.id,
          'actionId': p.revision!.actionId,
          'kind': p.revision!.kind,
          'change': p.revision!.change,
          'date': p.revision!.date,
          'title': p.revision!.title,
          'amount': '${p.revision!.amount}',
          'number': p.revision!.number,
          'previous': p.revision!.previous,
          'source': p.revision!.source,
          'values': p.revision!.values,
          'postings': [
            for (final v in p.revision!.postings)
              {
                'ledger': v.ledger,
                'amount': '${v.amount}',
                'date': v.date,
                'account': v.account,
                'category': v.category,
              },
          ],
        },
};

String canonicalJson(Object? value) {
  Object? sorted(Object? v) {
    if (v is Map) {
      final keys = v.keys.cast<String>().toList()..sort();
      return {for (final k in keys) k: sorted(v[k])};
    }
    if (v is List) return v.map(sorted).toList();
    return v;
  }

  return jsonEncode(sorted(value));
}

LocalCommand rebaseCommand(LocalCommand c, int version) => LocalCommand(
  id: c.id,
  owner: c.owner,
  expectedVersion: version,
  kind: c.kind,
  values: c.values,
);

LocalSnapshot applyFinancialPlan(LocalSnapshot s, LocalPlan p) => LocalSnapshot(
  owner: s.owner,
  version: s.version + 1,
  projectionConflicts: s.projectionConflicts,
  accounts: [
    for (final a in s.accounts)
      if (a.id == p.archiveId)
        LocalAccount(
          a.id,
          a.name,
          a.kind,
          a.cutoff,
          true,
          a.institution,
          a.notes,
        )
      else
        a,
    if (p.account != null) p.account!,
  ],
  categories: [...s.categories, if (p.category != null) p.category!],
  revisions: [...s.revisions, if (p.revision != null) p.revision!],
);

bool dependencySensitive(LocalCommand c) =>
    !['account', 'category', 'income', 'expense', 'transfer'].contains(c.kind);
