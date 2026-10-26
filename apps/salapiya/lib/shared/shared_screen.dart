import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design_system/editorial.dart';
import '../app/demo_routes.dart';
import '../design_system/theme.dart';
import '../features/finance/presentation/financial_widgets.dart';
import '../local/finance_domain.dart';
import '../local/local_runtime.dart';
import '../local/local_store.dart';
import '../local/local_finance_controller.dart';
import '../p0/exact_money.dart';
import 'shared_domain.dart';
import 'shared_repository.dart';

Future<void> sharePrivatePurchase(
  BuildContext context,
  LocalFinancialController controller,
  String purchaseId,
) async {
  final store = controller.store, snapshot = await controller.store.snapshot();
  final purchase = snapshot.current
      .where(
        (r) =>
            r.id == purchaseId &&
            r.kind == 'expense' &&
            !r.values.containsKey('sharedGroup'),
      )
      .firstOrNull;
  if (purchase == null) reject('Choose a current unlinked private purchase.');
  final binding = await store.connection();
  if (binding == null || binding['phase'] != 'connected') {
    reject(
      'Connect your private profile with Google before sharing. Your purchase remains saved.',
    );
  }
  final groups =
      (await store.db.getAll(
            'SELECT document FROM shared_snapshot_cache WHERE owner_id=?',
            [binding['remote_owner']],
          ))
          .map((r) => SharedGroup(object(jsonDecode(r['document'] as String))))
          .where(
            (g) =>
                g.active(g.participant(binding['remote_owner'] as String)) &&
                !g.archived,
          )
          .toList();
  if (groups.isEmpty) {
    reject('Create or join a group first. Your actual purchase remains saved.');
  }
  if (!context.mounted) return;
  final selected = await showDialog<String>(
    context: context,
    builder: (context) => SimpleDialog(
      title: const Text('Share this purchase'),
      children: [
        for (final g in groups)
          SimpleDialogOption(
            onPressed: () => Navigator.pop(context, g.id),
            child: Text(g.name),
          ),
      ],
    ),
  );
  if (selected == null) return;
  final g = groups.firstWhere((g) => g.id == selected),
      me = g.participant(binding['remote_owner'] as String)!;
  final id = newLocalId();
  if (!context.mounted) return;
  await openDemoPage<void>(
    context,
    _SharedForm(
      title: 'Share your saved purchase',
      fields: [
        SharedField('name', 'Description', value: purchase.title),
        const SharedField(
          'method',
          'Consumption split',
          value: 'equal',
          options: {'equal': 'Equal', 'exact': 'Exact / selected participants'},
        ),
        for (final p in g.people.entries.where(
          (p) => p.value['active'] == true,
        )) ...[
          SharedField(
            'include:${p.key}',
            '${p.value['name']} · consumption',
            value: 'yes',
            options: const {'yes': 'Included', 'no': 'Excluded'},
          ),
          SharedField(
            'share:${p.key}',
            '${p.value['name']} · exact share (PHP)',
            value: '0.00',
          ),
        ],
      ],
      onSave: (v) async {
        final included = g.people.keys.where((p) => v['include:$p'] == 'yes');
        final shares = v['method'] == 'equal'
            ? equalShares(purchase.amount, included)
            : {for (final p in included) p: '${parsePhp(v['share:$p']!)}'};
        validateSharedAxis(shares, g.people, purchase.amount);
        final payload = jsonEncode({
          'contract': 3,
          'group': g.id,
          'op': 'bill',
          'version': g.version,
          'values': {
            'name': v['name'],
            'date': purchase.date,
            'total': '${purchase.amount}',
            'paid': {me: '${purchase.amount}'},
            'shares': shares,
            'method': v['method'],
          },
        });
        // The original purchase is already durable. Preserve the private link intent
        // before group submission; rejection can never undo its actual spending.
        await store.saveDraft('shared-purchase:$id', id, {
          'privateSource': purchase.id,
          'group': g.id,
          'bill': id,
        });
        await store.saveSharedIntent(
          id,
          binding['remote_owner'] as String,
          g.id,
          payload,
          queued: true,
        );
      },
    ),
    'shared/adopt-purchase',
  );
}

class NativeSharedScreen extends StatefulWidget {
  const NativeSharedScreen({
    super.key,
    required this.session,
    this.initial = 'Bills',
  });
  final LocalSession session;
  final String initial;
  @override
  State<NativeSharedScreen> createState() => _NativeSharedScreenState();
}

class _NativeSharedScreenState extends State<NativeSharedScreen> {
  late final repo = SharedRepository(
    widget.session.runtime,
    widget.session.localFinance.store,
  );
  String? selected;
  late String tab = widget.initial;
  bool projected = false;
  int page = 0;
  @override
  void initState() {
    super.initState();
    repo.open();
  }

  @override
  void dispose() {
    repo.dispose();
    super.dispose();
  }

  String money(BigInt n) => widget.session.amount(n);
  Future<void> reviewSavedWork(SharedJson intent) async {
    if (intent['state'] != 'review') {
      await repo.retry(intent['id'] as String);
      return;
    }
    final command = object(jsonDecode(intent['payload'] as String));
    final values = object(command['values']);
    final group = repo.groups
        .where((g) => g.id == intent['group_id'])
        .firstOrNull;
    final op = command['op'] as String;
    final canDraft =
        group != null &&
        !group.archived &&
        group.active(group.participant(repo.actor ?? '')) &&
        ['bill', 'report'].contains(op);
    final create = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Review saved $op'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                intent['reason'] as String? ??
                    'This operation was not accepted.',
              ),
              const SizedBox(height: 12),
              if (values['name'] != null) Text(values['name'] as String),
              if (values['date'] != null) Text(values['date'] as String),
              if (values['total'] != null)
                Text('Original total: ${money(sharedMinor(values['total']))}'),
              if (op == 'bill') ...[
                for (final p in object(values['paid']).entries)
                  Text(
                    '${group?.personName(p.key) ?? 'Earlier participant'} · contributed ${money(sharedMinor(p.value))}',
                  ),
                for (final p in object(values['shares']).entries)
                  Text(
                    '${group?.personName(p.key) ?? 'Earlier participant'} · consumed ${money(sharedMinor(p.value))}',
                  ),
              ],
              if (op == 'report')
                Text(
                  '${group?.personName(values['sender'] as String) ?? 'Earlier sender'} → ${group?.personName(values['recipient'] as String) ?? 'Earlier recipient'} · ${money(sharedMinor(values['amount']))}',
                ),
              const SizedBox(height: 12),
              Text(
                canDraft
                    ? 'A corrected draft uses current participants and sources. Review it before sending a new command. This original decision stays in history.'
                    : 'Review the current group and its permissions before starting a new operation. This original input and decision remain saved.',
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Close'),
          ),
          if (canDraft)
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Create corrected draft'),
            ),
        ],
      ),
    );
    if (create != true || group == null) return;
    final id = newLocalId();
    final fields = <String, String>{'date': values['date'] as String};
    if (op == 'bill') {
      fields.addAll({
        'name': values['name'] as String,
        'total': phpDecimal(sharedMinor(values['total'])),
        'method': values['method'] as String,
      });
      for (final person in group.people.keys) {
        fields['paid:$person'] = phpDecimal(
          sharedMinor(values['paid'][person] ?? '0'),
        );
        fields['include:$person'] =
            (values['shares'] as Map).containsKey(person) ? 'yes' : 'no';
        fields['share:$person'] = phpDecimal(
          sharedMinor(values['shares'][person] ?? '0'),
        );
      }
    } else {
      fields.addAll({
        'sender': values['sender'] as String,
        'recipient': values['recipient'] as String,
        'mode': values['mode'] as String,
        'amount': phpDecimal(sharedMinor(values['amount'])),
        'acknowledge': 'no',
      });
      for (final source in group.bills.keys) {
        fields['allocation:$source'] = phpDecimal(
          sharedMinor(values['allocations']?[source]?['amount'] ?? '0'),
        );
      }
    }
    await repo.draft(id, group.id, {
      'title': op == 'bill'
          ? 'Corrected shared expense draft'
          : 'Corrected payment draft',
      'op': op,
      'fields': fields,
    });
    if (op == 'bill') {
      final purchase = await repo.store.draft(
        'shared-purchase:${intent['id']}',
      );
      if (purchase != null) {
        await repo.store.saveDraft('shared-purchase:$id', id, {
          ...Map<String, String>.from(purchase['values'] as Map),
          'group': group.id,
          'bill': id,
        });
      }
    }
    if (op == 'bill') {
      await bill(group, draftId: id);
    } else {
      await payment(group, draftId: id);
    }
  }

  Future<void> run(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Review needed'),
            content: Text(
              e is LocalRuleException ? e.message : 'The request could not complete. Saved drafts and actual spending remain on this device. Reconnect and retry the original command.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
            ],
          ),
        );
      }
    }
  }

  Future<void> form(
    String title,
    List<SharedField> fields,
    Future<void> Function(Map<String, String>) save, {
    String? id,
    String? group,
    SharedJson metadata = const {},
    List<String> Function(Map<String, String>)? preview,
  }) async {
    final saved = id == null
        ? null
        : (await repo.store.db.getAll(
            'SELECT payload FROM shared_draft WHERE id=?',
            [id],
          )).firstOrNull;
    final restored = saved == null
        ? <String, dynamic>{}
        : object(object(jsonDecode(saved['payload'] as String))['fields']);
    if (!mounted) return;
    await openDemoPage<void>(
      context,
      _SharedForm(
        title: title,
        fields: [
          for (final f in fields)
            SharedField(
              f.key,
              f.label,
              value: restored[f.key] as String? ?? f.value,
              options: f.options,
            ),
        ],
        onSave: save,
        preview: preview,
        onDraft: id == null
            ? null
            : (values) => repo.draft(id, group ?? '', {
                'title': title,
                'fields': values,
                ...metadata,
              }),
      ),
      'shared/editor',
    );
  }

  Future<void> create() => form(
    'Create group',
    [
      const SharedField('name', 'Group name'),
      SharedField('display', 'Your name', value: widget.session.profile.name),
    ],
    (v) async {
      final g = newLocalId();
      await repo.submit(g, 'create', {
        'name': v['name'],
        'display': v['display'],
        'participant': newLocalId(),
      });
      selected = g;
    },
  );
  Future<void> invitation(SharedGroup g, {String? participant}) => form(
    participant == null
        ? 'Invite a registered person'
        : 'Nominate manual participant',
    [const SharedField('email', 'Verified Google email')],
    (v) async {
      final token = SharedRepository.invitationToken();
      final invitationId = await repo.submit(g.id, 'invite', {
        'email': v['email'],
        'hash': SharedRepository.tokenHash(token),
        'participant': ?participant,
      }, version: g.version);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Share this invitation securely'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SelectableText('${g.id}.$token'),
              const SizedBox(height: 12),
              const Text(
                'Single use · seven days · intended verified Google recipient only. The recipient can paste this code in Join group. This code is shown once.',
              ),
              const SizedBox(height: 12),
              SelectableText('Invitation reference: $invitationId'),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    },
  );
  Future<void> join() => form(
    'Join group or claim a participant',
    [
      const SharedField('code', 'Invitation group.code'),
      SharedField('display', 'Your name', value: widget.session.profile.name),
    ],
    (v) async {
      final review = await repo.reviewInvitation(v['code']!);
      final g = SharedGroup(object(review['document']));
      if (!mounted) return;
      final consent = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Join ${g.name}?'),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(review['disclosure'] as String),
                const SizedBox(height: 16),
                Text(
                  '${g.people.length} people · ${g.bills.length} retained bills',
                ),
                for (final p in g.positions().entries)
                  Text('${g.personName(p.key)}: ${money(p.value)}'),
                if (review['claim'] != null)
                  Text(
                    'Claim: ${g.personName(review['claim'] as String)}. Prior manual evidence remains unverified.',
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Consent to history and join'),
            ),
          ],
        ),
      );
      if (consent != true) reject('Joining cancelled; no membership changed.');
      await repo.submit(g.id, 'accept', {
        'token': v['code']!.trim().split('.')[1],
        'consent': true,
        'display': v['display'],
        'participant': newLocalId(),
      }, version: g.version);
      selected = g.id;
    },
  );
  Future<void> bill(
    SharedGroup g, {
    String? source,
    bool refund = false,
    String? draftId,
  }) async {
    final r = source == null ? null : g.revision(source);
    final id = draftId ?? newLocalId();
    final people = g.people.entries
        .where((p) => source != null || p.value['active'] == true)
        .toList();
    await form(
      refund
          ? 'Shared refund'
          : source == null
          ? 'Add shared expense'
          : 'Correct shared expense',
      [
        if (!refund)
          SharedField(
            'name',
            'Description',
            value: r?['name'] as String? ?? '',
          ),
        SharedField('date', 'Date (YYYY-MM-DD)', value: civilToday()),
        SharedField(
          'total',
          refund ? 'Refund total (PHP)' : 'Bill total (PHP)',
          value: r == null || refund ? '' : phpDecimal(sharedMinor(r['total'])),
        ),
        if (!refund)
          const SharedField(
            'method',
            'Split method',
            value: 'equal',
            options: {
              'equal': 'Equal · canonical participant order',
              'exact': 'Exact / custom',
            },
          ),
        for (final p in people)
          SharedField(
            'paid:${p.key}',
            refund
                ? '${p.value['name']} · actual money received (PHP)'
                : '${p.value['name']} · contributed (PHP)',
            value: r == null || refund
                ? '0.00'
                : phpDecimal(sharedMinor(r['paid'][p.key] ?? '0')),
          ),
        for (final p in people) ...[
          SharedField(
            'include:${p.key}',
            '${p.value['name']} · included in consumption',
            value: r == null || r['shares'].containsKey(p.key) ? 'yes' : 'no',
            options: const {'yes': 'Included', 'no': 'Excluded'},
          ),
          SharedField(
            'share:${p.key}',
            refund
                ? '${p.value['name']} · consumed-share credit (PHP)'
                : '${p.value['name']} · exact share (PHP; ignored for Equal)',
            value: r == null || refund
                ? '0.00'
                : phpDecimal(sharedMinor(r['shares'][p.key] ?? '0')),
          ),
        ],
        if (source != null) const SharedField('reason', 'Reason'),
      ],
      (v) async {
        final total = parsePhp(v['total']!);
        if (total <= BigInt.zero) reject('Enter a positive total.');
        final paid = {
          for (final p in people) p.key: '${parsePhp(v['paid:${p.key}']!)}',
        };
        final included = people
            .where((p) => v['include:${p.key}'] == 'yes')
            .map((p) => p.key);
        final shares = !refund && v['method'] == 'equal'
            ? equalShares(total, included)
            : {for (final p in included) p: '${parsePhp(v['share:$p']!)}'};
        validateSharedAxis(paid, g.people, total);
        validateSharedAxis(shares, g.people, total);
        civilDate(v['date']!);
        final values = <String, dynamic>{
          'date': v['date'],
          'total': '$total',
          if (!refund) ...{
            'name': v['name'],
            'paid': paid,
            'shares': shares,
            'method': v['method'],
          } else ...{
            'received': paid,
            'credits': shares,
          },
          if (source != null) ...{
            'bill': source,
            'revision': r!['id'],
            'reason': v['reason'],
          },
        };
        await repo.submit(
          g.id,
          refund
              ? 'refund'
              : source == null
              ? 'bill'
              : 'correct',
          values,
          version: g.version,
          id: id,
        );
      },
      id: id,
      group: g.id,
      metadata: {'op': 'bill', 'source': source, 'refund': refund},
      preview: (v) {
        final total = parsePhp(v['total']!);
        final paid = {
          for (final p in people) p.key: '${parsePhp(v['paid:${p.key}']!)}',
        };
        final included = people
            .where((p) => v['include:${p.key}'] == 'yes')
            .map((p) => p.key);
        final shares = !refund && v['method'] == 'equal'
            ? equalShares(total, included)
            : {for (final p in included) p: '${parsePhp(v['share:$p']!)}'};
        validateSharedAxis(paid, g.people, total);
        validateSharedAxis(shares, g.people, total);
        civilDate(v['date']!);
        if (total <= BigInt.zero) reject('Enter a positive total.');
        return [
          'Exact total: ${money(total)}',
          for (final p in people)
            '${p.value['name']} · ${refund ? 'actual received' : 'contributed'} ${money(sharedMinor(paid[p.key]))} · ${refund ? 'consumption credit' : 'consumed share'} ${money(sharedMinor(shares[p.key] ?? '0'))}',
          'Group facts only. No private cash or another member’s ledger is posted.',
        ];
      },
    );
  }

  Future<void> payment(SharedGroup g, {String? draftId}) {
    final id = draftId ?? newLocalId();
    return form(
      'Report a payment',
      [
        SharedField(
          'sender',
          'Sender',
          value: g.participant(repo.actor!) ?? '',
          options: {
            for (final p in g.people.entries) p.key: p.value['name'] as String,
          },
        ),
        SharedField(
          'recipient',
          'Recipient',
          options: {
            for (final p in g.people.entries) p.key: p.value['name'] as String,
          },
        ),
        SharedField(
          'date',
          'Actual payment date (YYYY-MM-DD)',
          value: civilToday(),
        ),
        const SharedField(
          'mode',
          'Settlement mode',
          value: 'custom',
          options: {
            'full': 'Full reciprocal net',
            'custom': 'Custom amount',
            'selected': 'Selected bills / partial allocations',
          },
        ),
        const SharedField(
          'amount',
          'Actual amount (PHP; required except Full)',
        ),
        for (final b in g.bills.keys)
          SharedField(
            'allocation:$b',
            '${g.revision(b)['name']} · selected amount (PHP)',
            value: '0.00',
          ),
        const SharedField(
          'acknowledge',
          'Advance / over-net agreement',
          value: 'no',
          options: {
            'no': 'No advance acknowledged',
            'yes': 'I acknowledge unallocated or over-net money; original obligations remain',
          },
        ),
      ],
      (v) async {
        final sender = v['sender']!, recipient = v['recipient']!;
        if (sender == recipient) reject('Choose different people.');
        final amount = v['mode'] == 'full'
            ? g.due(sender, recipient)
            : parsePhp(v['amount']!);
        if (amount <= BigInt.zero) reject('Enter a positive payment.');
        final selected = <String, dynamic>{};
        if (v['mode'] == 'selected') {
          for (final b in g.bills.keys) {
            final n = parsePhp(v['allocation:$b']!);
            if (n > BigInt.zero) {
              selected[b] = {'amount': '$n', 'revision': g.revision(b)['id']};
            }
          }
        }
        final preview = g.settlementAllocation(
          sender,
          recipient,
          amount,
          selected: v['mode'] == 'selected' ? selected : null,
        );
        if ((preview['advance'] != '0' || preview['overNet'] == true) &&
            v['acknowledge'] != 'yes') {
          reject('Acknowledge the advance / over-net payment.');
        }
        await repo.submit(
          g.id,
          'report',
          {
            'sender': sender,
            'recipient': recipient,
            'date': civilDate(v['date']!),
            'amount': '$amount',
            'mode': v['mode'],
            'allocations': selected,
            'acknowledge': v['acknowledge'] == 'yes',
          },
          version: g.version,
          id: id,
        );
      },
      id: id,
      group: g.id,
      metadata: {'op': 'report'},
      preview: (v) {
        final sender = v['sender']!, recipient = v['recipient']!;
        if (sender == recipient) reject('Choose different people.');
        final amount = v['mode'] == 'full'
            ? g.due(sender, recipient)
            : parsePhp(v['amount']!);
        if (amount <= BigInt.zero) reject('Enter a positive payment.');
        final selected = <String, dynamic>{};
        if (v['mode'] == 'selected') {
          for (final id in g.bills.keys) {
            final n = parsePhp(v['allocation:$id']!);
            if (n > BigInt.zero) {
              selected[id] = {'amount': '$n', 'revision': g.revision(id)['id']};
            }
          }
        }
        final p = g.settlementAllocation(
          sender,
          recipient,
          amount,
          selected: v['mode'] == 'selected' ? selected : null,
        );
        if ((p['advance'] != '0' || p['overNet'] == true) &&
            v['acknowledge'] != 'yes') {
          reject('Acknowledge the advance / over-net payment.');
        }
        return [
          '${g.personName(sender)} → ${g.personName(recipient)}: ${money(amount)}',
          for (final a in object(p['allocations']).entries)
            '${g.revision(a.key)['name']} · ${money(sharedMinor(a.value['amount']))} · revision ${a.value['revision']}',
          'Unallocated advance: ${money(sharedMinor(p['advance']))}${p['overNet'] == true ? ' · over-net payment acknowledged' : ''}',
          'Reported / awaiting recipient confirmation. Confirmed positions and private cash are unchanged.',
        ];
      },
    );
  }

  Future<void> resolve(SharedGroup g, String id) => form(
    'Review reported payment',
    [
      const SharedField(
        'state',
        'Decision',
        value: 'confirmed',
        options: {
          'confirmed': 'Confirm actual receipt',
          'disputed': 'Dispute receipt',
          'cancelled': 'Cancel my report',
          'reversed': 'Reverse confirmation · no automatic cash return',
        },
      ),
      const SharedField('reason', 'Reason (required except confirmation)'),
      const SharedField(
        'acknowledge',
        'Manual recipient limitation',
        value: 'no',
        options: {
          'no': 'Recipient authenticated',
          'yes': 'Owner-entered, unverified receipt; recipient did not authenticate',
        },
      ),
    ],
    (v) async {
      await repo.submit(g.id, 'resolve', {
        'settlement': id,
        'state': v['state'],
        'reason': v['reason'],
        'acknowledge': v['acknowledge'] == 'yes',
      }, version: g.version);
    },
  );
  Future<void> lifecycle(SharedGroup g, String op, {String? participant}) =>
      form(
        op == 'archive'
            ? 'Archive / restore group'
            : '${op[0].toUpperCase()}${op.substring(1)} participant',
        [
          if (participant == null && op != 'archive')
            SharedField(
              'participant',
              'Participant',
              options: {
                for (final p in g.people.entries)
                  p.key: p.value['name'] as String,
              },
            ),
          if (op == 'archive')
            SharedField(
              'archived',
              'Group state',
              value: g.archived ? 'false' : 'true',
              options: const {'true': 'Archived', 'false': 'Active'},
            ),
          const SharedField('reason', 'Reason'),
        ],
        (v) async {
          await repo.submit(g.id, op, {
            'reason': v['reason'],
            if (op == 'archive')
              'archived': v['archived'] == 'true'
            else
              'participant': participant ?? v['participant'],
          }, version: g.version);
        },
      );
  Future<void> details(SharedGroup g, String id) async {
    final b = object(g.bills[id]);
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(g.revision(id)['name'] as String),
        content: SizedBox(
          width: 560,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final r in b['revisions'] as List) ...[
                  Text(
                    '${r['date']} · ${money(sharedMinor(r['total']))}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    'Revision ${r['id']} · ${r['reason'] ?? 'Original bill'}',
                  ),
                  for (final p in g.people.keys)
                    Text(
                      '${g.personName(p)} · paid ${money(sharedMinor(r['paid'][p] ?? '0'))} · consumed ${money(sharedMinor(r['shares'][p] ?? '0'))}',
                    ),
                  const SizedBox(height: 16),
                ],
                for (final f in b['refunds'] as List)
                  Text(
                    'Refund ${money(sharedMinor(f['total']))} · ${f['reason']} · received ${f['received']} · consumed credits ${f['credits']}',
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: repo,
    builder: (context, _) {
      final g =
          repo.groups.where((g) => g.id == selected).firstOrNull ??
          repo.groups.firstOrNull;
      final me = g?.participant(repo.actor ?? '');
      final active = g?.active(me) ?? false;
      final owner = g?.data['owner'] == me && me != null;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'SHARED EXPENSES / TOGETHER, CLEARLY',
            'Good company.\nClear money.',
            'Group facts out in the open. Your private finances stay yours.',
            actions: [
              FilledButton.icon(
                onPressed: active && !g!.archived
                    ? () => run(() => bill(g))
                    : null,
                icon: const Icon(Icons.add),
                label: const Text('Add shared expense'),
              ),
              OutlinedButton(
                onPressed: active && !g!.archived
                    ? () => run(() => payment(g))
                    : null,
                child: const Text('Report payment'),
              ),
              TextButton(
                onPressed: () => run(create),
                child: const Text('Create group'),
              ),
              TextButton(
                onPressed: () => run(join),
                child: const Text('Join group / enter code'),
              ),
            ],
          ),
          if (repo.actor == null)
            const FinanceNotice(
              'Connect your profile with Google in Profile to create or join groups. Private Money remains available offline.',
            ),
          if (repo.error != null) FinanceNotice(repo.error!),
          if (repo.groups.isEmpty)
            const FinanceNotice(
              'No downloaded groups. Connect and synchronize to retrieve accepted group history.',
            ),
          if (g != null) ...[
            DropdownButtonFormField<String>(
              key: ValueKey('group-${g.id}-${repo.groups.length}'),
              initialValue: g.id,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Group'),
              items: [
                for (final group in repo.groups)
                  DropdownMenuItem(
                    value: group.id,
                    child: Text(group.name, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => setState(() => selected = v),
            ),
            const SizedBox(height: 20),
            FinanceColumns(
              main: EditorialSurface(
                color: CraftTheme.of(context).dark
                    ? const Color(0xFF332D29)
                    : const Color(0xFFF5E7DD),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      g.name,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      '${g.people.length} people · ${g.bills.length} bills · ${g.complete ? 'accepted group snapshot' : 'retained history; incomplete group positions'}${g.archived ? ' · archived' : ''}',
                    ),
                    const SizedBox(height: 20),
                    Text(
                      money(g.spending),
                      style: Theme.of(context).textTheme.displaySmall,
                    ),
                    const Text(
                      'Group spending after refunds · separate from your private expense',
                    ),
                    Wrap(
                      spacing: 8,
                      children: [
                        ChoiceChip(
                          label: const Text('Confirmed'),
                          selected: !projected,
                          onSelected: (_) => setState(() => projected = false),
                        ),
                        ChoiceChip(
                          label: const Text('Projected incl. pending'),
                          selected: projected,
                          onSelected: (_) => setState(() => projected = true),
                        ),
                      ],
                    ),
                    if (!g.complete)
                      const FinanceNotice(
                        'These positions cover permitted historical sources only. They are not a complete current group balance.',
                      ),
                    for (final p in g.positions(projected: projected).entries)
                      FinancialLine(
                        g.personName(p.key),
                        p.value >= BigInt.zero
                            ? 'Receivable / advance'
                            : 'Payable',
                        value: money(p.value.abs()),
                        icon: p.value >= BigInt.zero
                            ? Icons.south_west
                            : Icons.north_east,
                        color: Palette.mint,
                      ),
                  ],
                ),
              ),
              aside: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionHeading('Needs a little attention'),
                  for (final s in g.settlements.entries.where(
                    (s) =>
                        s.value['state'] == 'pending' ||
                        s.value['state'] == 'disputed',
                  ))
                    FinancialLine(
                      '${g.personName(s.value['sender'])} → ${g.personName(s.value['recipient'])}',
                      '${s.value['state'] == 'pending' ? 'Waiting for recipient confirmation' : 'Disputed'} · ${money(sharedMinor(s.value['amount']))}',
                      icon: Icons.mark_email_unread_outlined,
                      color: Palette.peach,
                      onTap: () => run(() => resolve(g, s.key)),
                    ),
                  Text(
                    'Signed in as ${me == null ? 'unavailable participant' : g.personName(me)} · ${active ? 'active member' : 'retained history'}',
                  ),
                  const FinanceNotice(
                    'Synchronization means group acceptance. It does not confirm that money was received. Private funding and accounts stay private.',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final t in [
                  'Bills',
                  'Payments',
                  'Balances',
                  'People',
                  'Private review',
                  'History',
                  'Lifecycle',
                ])
                  ChoiceChip(
                    label: Text(t),
                    selected: tab == t,
                    onSelected: (_) => setState(() {
                      tab = t;
                      page = 0;
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 24),
            if (tab == 'Bills') ...[
              for (final b in g.bills.keys.skip(page * 50).take(50))
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FinancialLine(
                      g.revision(b)['name'] as String,
                      '${g.revision(b)['date']} · ${(g.bills[b]['revisions'] as List).length} immutable revision(s)',
                      value: money(sharedMinor(g.revision(b)['total'])),
                      icon: Icons.receipt_long,
                      color: Palette.peach,
                      onTap: () => details(g, b),
                    ),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (g.bills[b]['creator'] == me) ...[
                          TextButton(
                            key: ValueKey('correct-bill-$b'),
                            onPressed: repo.online && active
                                ? () => run(() => bill(g, source: b))
                                : null,
                            child: const Text('Correct'),
                          ),
                          TextButton(
                            key: ValueKey('refund-bill-$b'),
                            onPressed: repo.online && active
                                ? () => run(
                                    () => bill(g, source: b, refund: true),
                                  )
                                : null,
                            child: const Text('Refund'),
                          ),
                        ],
                        TextButton(
                          key: ValueKey('private-bill-$b'),
                          onPressed: () => run(() => privateBill(g, b)),
                          child: const Text('Private adoption / review'),
                        ),
                        TextButton(
                          onPressed: () => run(() => retainEvidence(g, b)),
                          child: const Text('Retain private evidence'),
                        ),
                        for (final f in g.bills[b]['refunds'] as List)
                          TextButton(
                            key: ValueKey('private-refund-${f['id']}'),
                            onPressed: () => run(
                              () =>
                                  privateEffect(g, f['id'] as String, 'refund'),
                            ),
                            child: Text(
                              'Private refund · ${money(sharedMinor(f['total']))}',
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
            ],
            if (tab == 'Payments')
              for (final s in g.settlements.entries.skip(page * 50).take(50))
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FinancialLine(
                      key: ValueKey('payment-${s.key}'),
                      '${g.personName(s.value['sender'])} → ${g.personName(s.value['recipient'])}',
                      '${s.value['state']} ${s.value['manual'] == true ? '· manually / unverified confirmed' : ''}\n${s.value['date']} · ${object(s.value['allocations']).length} bill allocations · advance ${money(sharedMinor(s.value['advance']))}',
                      value: money(sharedMinor(s.value['amount'])),
                      icon: Icons.payments_outlined,
                      color: Palette.mint,
                      onTap: () => run(() => resolve(g, s.key)),
                    ),
                    Wrap(
                      children: [
                        TextButton(
                          key: ValueKey('private-payment-${s.key}'),
                          onPressed: () =>
                              run(() => privateEffect(g, s.key, 'payment')),
                          child: const Text('Record my actual money'),
                        ),
                        TextButton(
                          key: ValueKey('private-clear-${s.key}'),
                          onPressed: () =>
                              run(() => privateEffect(g, s.key, 'clear')),
                          child: const Text('Review private clearing'),
                        ),
                        TextButton(
                          onPressed: () =>
                              run(() => privateEffect(g, s.key, 'unclear')),
                          key: ValueKey('private-unclear-${s.key}'),
                          child: const Text('Restore clearing after reversal'),
                        ),
                      ],
                    ),
                  ],
                ),
            if (tab == 'Balances') ...[
              const SectionHeading('Reciprocal pair balances'),
              for (final pair in g.reciprocalPairs)
                FinancialLine(
                  '${g.personName(pair.sender)} → ${g.personName(pair.recipient)}',
                  'Confirmed source obligations after reciprocal netting',
                  value: money(pair.amount),
                  icon: Icons.compare_arrows,
                  color: Palette.mint,
                ),
              const FinanceNotice(
                'Suggestions are nonposting proposals requiring agreement. Paying an unrelated person does not erase a source obligation. Disputes pause suggestions.',
              ),
              for (final e in g.suggestions)
                FinancialLine(
                  '${g.personName(e.sender)} → ${g.personName(e.recipient)}',
                  'Suggestion · agreement required',
                  value: money(e.amount),
                  icon: Icons.compare_arrows,
                  color: Palette.mint,
                ),
              const SectionHeading('Pairwise source explanations'),
              for (final e in g.edges())
                FinancialLine(
                  '${g.personName(e.sender)} → ${g.personName(e.recipient)}',
                  e.bill == null
                      ? 'Advance · ${e.source}'
                      : '${g.revision(e.bill!)['name']} · source ${e.source}',
                  value: money(e.amount),
                  icon: Icons.link,
                  color: Palette.peach,
                ),
            ],
            if (tab == 'People') ...[
              if (owner)
                Wrap(
                  children: [
                    TextButton(
                      onPressed: repo.online
                          ? () => run(
                              () => form(
                                'Add manual participant',
                                [const SharedField('name', 'Participant name')],
                                (v) async {
                                  await repo.submit(g.id, 'manual', {
                                    'participant': newLocalId(),
                                    'name': v['name'],
                                  }, version: g.version);
                                },
                              ),
                            )
                          : null,
                      child: const Text('Add manual person'),
                    ),
                    TextButton(
                      onPressed: repo.online
                          ? () => run(() => invitation(g))
                          : null,
                      child: const Text('Invite registered person'),
                    ),
                  ],
                ),
              for (final p in g.people.entries)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FinancialLine(
                      p.value['name'] as String,
                      '${p.value['kind']} · ${p.value['active'] == true ? 'active' : 'former'}${g.data['owner'] == p.key ? ' · owner' : ''}',
                      icon: Icons.person_outline,
                      color: Palette.peach,
                    ),
                    if (owner && p.value['kind'] == 'manual')
                      TextButton(
                        onPressed: () =>
                            run(() => invitation(g, participant: p.key)),
                        child: const Text('Nominate verified claim'),
                      ),
                    Text(
                      'Membership history: ${jsonEncode(p.value['intervals'])}',
                    ),
                  ],
                ),
            ],
            if (tab == 'Private review') ...[
              const FinanceNotice(
                'Private adoption is independent from group acceptance. No other member’s ledger is changed. Card funding adopts an already recorded private card purchase or refund.',
              ),
              for (final r in repo.reviews.where((r) => r['group_id'] == g.id))
                FinancialLine(
                  g.bills.containsKey(r['bill_id'])
                      ? g.revision(r['bill_id'] as String)['name'] as String
                      : 'Historical shared source',
                  '${r['historicalOnly'] == true ? 'Historical archive review · current authorization must be reviewed again' : 'Accepted private retained-evidence review'}\n${r['reason']}\n${r['recorded_at']}',
                  icon: Icons.history,
                  color: Palette.mint,
                ),
              for (final b in g.bills.keys)
                FinancialLine(
                  g.revision(b)['name'] as String,
                  'Review your own funding, consumption and versioned source',
                  icon: Icons.lock_outline,
                  color: Palette.mint,
                  onTap: () => run(() => privateBill(g, b)),
                ),
            ],
            if (tab == 'History') ...[
              for (final e
                  in (g.data['activity'] as List).reversed
                      .skip(page * 50)
                      .take(50))
                FinancialLine(
                  e['op'] as String,
                  '${e['at']} · ${e['reason'] ?? ''}',
                  icon: Icons.history,
                  color: Palette.mint,
                ),
              TextButton(
                onPressed: () => run(() async {
                  final text = jsonEncode({
                    'format': 'salapiya-group-history-1',
                    'restorable': false,
                    'document': g.data,
                  });
                  await Clipboard.setData(ClipboardData(text: text));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Authorized history copied · not a restorable private backup.',
                        ),
                      ),
                    );
                  }
                }),
                child: const Text('Copy authorized group history export'),
              ),
            ],
            if (tab == 'Lifecycle')
              Wrap(
                spacing: 8,
                children: [
                  if (owner) ...[
                    TextButton(
                      onPressed: () => run(() => lifecycle(g, 'transfer')),
                      child: const Text('Transfer ownership'),
                    ),
                    TextButton(
                      onPressed: () => run(() => lifecycle(g, 'remove')),
                      child: const Text('Remove participant'),
                    ),
                    TextButton(
                      onPressed: () => run(() => lifecycle(g, 'archive')),
                      child: Text(
                        g.archived ? 'Restore group' : 'Archive group',
                      ),
                    ),
                    TextButton(
                      onPressed:
                          !(g.data['activity'] as List).any(
                            (e) => e['op'] == 'invite',
                          )
                          ? null
                          : () => run(
                              () => form(
                                'Revoke invitation',
                                [
                                  SharedField(
                                    'invitation',
                                    'Issued invitation',
                                    options: {
                                      for (final e
                                          in (g.data['activity'] as List).where(
                                            (e) => e['op'] == 'invite',
                                          ))
                                        e['id'] as String:
                                            '${e['at']} · reference ${(e['id'] as String).substring(0, 8)}',
                                    },
                                  ),
                                ],
                                (v) async {
                                  await repo.submit(g.id, 'revoke', {
                                    'invitation': v['invitation'],
                                  }, version: g.version);
                                },
                              ),
                            ),
                      child: const Text('Revoke invitation'),
                    ),
                  ],
                  if (active && !owner)
                    TextButton(
                      onPressed: () =>
                          run(() => lifecycle(g, 'leave', participant: me)),
                      child: const Text('Leave group'),
                    ),
                  const FinanceNotice(
                    'An unavailable owner does not block ordinary member bills. Ownership cannot be taken over by peers. Retained history does not restore membership authority.',
                  ),
                ],
              ),
          ],
          if (g != null && ['Bills', 'Payments', 'History'].contains(tab))
            Wrap(
              spacing: 12,
              children: [
                TextButton(
                  onPressed: page > 0 ? () => setState(() => page--) : null,
                  child: const Text('Previous page'),
                ),
                Text(
                  'Page ${page + 1} · totals use the complete entitled snapshot',
                ),
                TextButton(
                  onPressed:
                      (page + 1) * 50 <
                          (tab == 'Bills'
                              ? g.bills.length
                              : tab == 'Payments'
                              ? g.settlements.length
                              : (g.data['activity'] as List).length)
                      ? () => setState(() => page++)
                      : null,
                  child: const Text('Next page'),
                ),
              ],
            ),
          if (repo.drafts.isNotEmpty) ...[
            const SizedBox(height: 24),
            const SectionHeading('Drafts saved on this device'),
            for (final d in repo.drafts)
              FinancialLine(
                object(jsonDecode(d['payload'] as String))['title'] as String,
                'Unsubmitted · resume and review current participants',
                icon: Icons.edit_note,
                color: Palette.peach,
                onTap: () => run(() async {
                  final group = repo.groups
                      .where((g) => g.id == d['group_id'])
                      .firstOrNull;
                  if (group == null) {
                    reject(
                      'Reconnect to retrieve the currently entitled group before resuming this draft.',
                    );
                  }
                  final metadata = object(jsonDecode(d['payload'] as String));
                  if (metadata['op'] == 'report') {
                    await payment(group, draftId: d['id'] as String);
                  } else {
                    await bill(
                      group,
                      draftId: d['id'] as String,
                      source: metadata['source'] as String?,
                      refund: metadata['refund'] == true,
                    );
                  }
                }),
              ),
          ],
          if (repo.intents.any((i) => i['state'] != 'reconciled')) ...[
            const SizedBox(height: 24),
            const SectionHeading('Saved group work'),
            for (final i in repo.intents.where(
              (i) => i['state'] != 'reconciled',
            ))
              FinancialLine(
                key: ValueKey('shared-intent-${i['id']}'),
                object(jsonDecode(i['payload'] as String))['op'] as String,
                '${i['state'] == 'accepted'
                    ? 'Accepted · waiting for entitled download'
                    : i['state'] == 'pending'
                    ? 'Waiting for connection / group acceptance'
                    : i['state'] == 'restored'
                    ? 'Restored · current authority review required'
                    : 'Rejected / needs review'}\n${i['reason'] ?? ''}',
                icon: Icons.cloud_queue,
                color: Palette.peach,
                onTap: () => run(() => reviewSavedWork(i)),
              ),
          ],
        ],
      );
    },
  );
  Future<void> privateBill(SharedGroup g, String bill) async {
    await privateEffect(g, bill, 'bill');
  }

  Future<void> retainEvidence(SharedGroup g, String bill) async {
    final snapshot = await repo.store.snapshot();
    final source = snapshot.current
        .where(
          (r) =>
              r.values['sharedGroup'] == g.id &&
              r.values['sharedKey'] == bill &&
              r.values['sharedMode'] == 'bill',
        )
        .firstOrNull;
    if (source == null) {
      reject('Adopt this bill before reviewing a private difference.');
    }
    await form(
      'Retain accepted private evidence',
      [const SharedField('reason', 'Attributed review reason')],
      (v) async {
        if (!repo.online) {
          reject(
            'A current online identity is required for private source review.',
          );
        }
        await widget.session.runtime.connected.flow!.client.rpc(
          'p3_retain_private_evidence',
          params: {
            'command_id': newLocalId(),
            'profile_id': repo.store.owner,
            'group_id': g.id,
            'bill_id': bill,
            'private_revision': source.id,
            'source_stamp': sharedSourceStamp(object(g.bills[bill])),
            'reason': v['reason'],
          },
        );
      },
    );
  }

  Future<void> privateEffect(SharedGroup g, String key, String mode) async {
    await widget.session.runtime.connected.syncNow();
    final store = repo.store, snapshot = await store.snapshot();
    final me = g.participant(repo.actor ?? '');
    if (me == null) reject('Your group identity is unavailable.');
    final linked = snapshot.current
        .where(
          (r) =>
              r.values['sharedGroup'] == g.id &&
              r.values['sharedKey'] == key &&
              r.values['sharedMode'] == mode,
        )
        .firstOrNull;
    final integratedDraft = mode == 'bill'
        ? await store.draft('shared-purchase:$key')
        : null;
    if (linked == null &&
        integratedDraft != null &&
        !snapshot.current.any(
          (r) =>
              r.id == (integratedDraft['values'] as Map)['privateSource'] &&
              r.kind == 'expense' &&
              !r.values.containsKey('sharedGroup'),
        )) {
      reject(
        'The saved private purchase changed. Review its current Money history before adopting this bill. Actual spending is preserved.',
      );
    }
    final payment = snapshot.current
        .where(
          (r) =>
              r.values['sharedGroup'] == g.id &&
              r.values['sharedKey'] == key &&
              r.values['sharedMode'] == 'payment',
        )
        .firstOrNull;
    final clearing = snapshot.current
        .where(
          (r) =>
              r.values['sharedGroup'] == g.id &&
              r.values['sharedKey'] == key &&
              r.values['sharedMode'] == 'clear',
        )
        .firstOrNull;
    final source = mode == 'bill'
        ? g.revision(key)
        : mode == 'refund'
        ? g.bills.values
              .expand((b) => b['refunds'] as List)
              .where((f) => f['id'] == key)
              .first
        : g.settlements[key];
    final refundBill = mode == 'refund'
        ? g.bills.entries
              .where(
                (b) => (b.value['refunds'] as List).any((f) => f['id'] == key),
              )
              .first
        : null;
    final refundCoverage =
        refundBill != null &&
        snapshot.current.any(
          (r) =>
              r.values['sharedMode'] == 'bill' &&
              r.values['sharedGroup'] == g.id &&
              r.values['sharedKey'] == refundBill.key &&
              r.values['sharedRevision'] == g.revision(refundBill.key)['id'],
        );
    final outgoing = ['payment', 'clear', 'unclear'].contains(mode)
        ? source['sender'] == me
        : false;
    final paid = mode == 'bill'
        ? sharedMinor(source['paid'][me] ?? '0')
        : mode == 'refund'
        ? sharedMinor(source['received'][me] ?? '0')
        : sharedMinor(source['amount']);
    final share = mode == 'bill'
        ? sharedMinor(source['shares'][me] ?? '0')
        : mode == 'refund'
        ? sharedMinor(source['credits'][me] ?? '0')
        : BigInt.zero;
    if (!mounted) return;
    await form(
      'Private Money · $mode',
      [
        SharedField(
          'account',
          'Your private account',
          value: linked?.values['account'] ?? '',
          options: {
            '': 'No cash funding',
            for (final a in snapshot.accounts.where((a) => !a.archived))
              a.id: a.name,
          },
        ),
        SharedField(
          'category',
          'Your expense category',
          value: linked?.values['category'] ?? 'category-food',
          options: {
            for (final c in snapshot.categories.where(
              (c) => c.kind == 'expense',
            ))
              c.id: c.name,
          },
        ),
        if (mode == 'bill' && linked == null)
          SharedField(
            'existing',
            'Adopt existing purchase',
            value: integratedDraft == null
                ? ''
                : (integratedDraft['values'] as Map)['privateSource']
                          as String? ??
                      '',
            options: {
              '': 'Record new cash / unpaid allocation',
              for (final r in snapshot.current.where(
                (r) =>
                    r.kind == 'expense' && !r.values.containsKey('sharedGroup'),
              ))
                r.id: '${r.title} · ${phpDecimal(r.amount)} PHP',
            },
          ),
        if (mode == 'payment' && linked == null)
          SharedField(
            'existingPayment',
            'Reuse an already recorded payment',
            options: {
              '': 'Record a new actual cash movement',
              for (final r in snapshot.current.where(
                (r) =>
                    r.values['sharedMode'] == 'payment' &&
                    r.values['sharedGroup'] == g.id &&
                    r.values['sharedKey'] != key &&
                    [
                      'cancelled',
                      'reversed',
                    ].contains(g.settlements[r.values['sharedKey']]?['state']),
              ))
                r.id:
                    '${r.title} · ${r.date} · ${r.values['fundingAmount']} PHP · same parties, date, account and amount required',
            },
          ),
        if (mode == 'refund' && linked == null)
          SharedField(
            'existingCardRefund',
            'Adopt an actual card refund (optional)',
            options: {
              '': 'Record cash refund / no card credit',
              for (final r in snapshot.current.where(
                (r) =>
                    financeType(r) == 'cardRefund' &&
                    !r.values.containsKey('sharedGroup'),
              ))
                r.id: '${r.title} · ${phpDecimal(r.amount)} PHP · ${r.date}',
            },
          ),
        SharedField(
          'fundingAmount',
          'Actual private funding (PHP)',
          value: linked?.values['fundingAmount'] ?? phpDecimal(paid),
        ),
        SharedField(
          'shareAmount',
          'Your recognized consumption (PHP)',
          value: phpDecimal(share),
        ),
        SharedField(
          'date',
          'Actual private date (YYYY-MM-DD)',
          value: linked?.date ?? source['date'] as String,
        ),
        if (linked != null)
          const SharedField(
            'acknowledgeFunding',
            'Actual funding correction consent',
            value: 'false',
            options: {
              'false': 'Keep actual accepted funding',
              'true': 'I acknowledge changing actual funding from the accepted private record',
            },
          ),
        const SharedField(
          'acknowledge',
          'Negative tracked balance consent',
          value: 'false',
          options: {
            'false': 'No negative balance acknowledged',
            'true': 'I acknowledge the negative tracked account balance',
          },
        ),
        const SharedField('reason', 'Reason / source review'),
      ],
      (v) async {
        final old =
            linked ??
            snapshot.current
                .where(
                  (r) =>
                      r.id ==
                      (v['existing'] ??
                          v['existingPayment'] ??
                          v['existingCardRefund']),
                )
                .firstOrNull;
        final values = <String, String>{
          'name': 'Shared $mode · ${mode == 'bill' ? source['name'] : g.name}',
          'date': v['date']!,
          'sharedMode': mode,
          'sharedAccounting': '2',
          'sharedGroup': g.id,
          'sharedKey': key,
          'sharedRevision': source['id'] as String,
          'fundingAmount': v['fundingAmount']!,
          'shareAmount': v['shareAmount']!,
          'account': v['account']!,
          'category': v['category']!,
          'reason': v['reason']!,
          'funding': old?.values['card'] == null ? 'cash' : 'card',
          if (old?.values['card'] != null) 'card': old!.values['card']!,
          'acknowledge': v['acknowledge']!,
          'acknowledgeFunding': v['acknowledgeFunding'] ?? 'false',
          if (old != null) ...{
            'source': old.id,
            'sourceVersion': '${old.number}',
          },
          if (['payment', 'clear', 'unclear'].contains(mode))
            'direction': outgoing ? 'out' : 'in',
          if (mode == 'clear') 'paymentSource': payment?.id ?? '',
          if (mode == 'unclear') 'paymentSource': clearing?.id ?? '',
          if (refundBill != null) ...{
            'billSource': refundBill.key,
            'billRevision': g.revision(refundBill.key)['id'] as String,
            'coverage': refundCoverage ? 'adopted' : 'clearing',
          },
        };
        final command = LocalCommand(
          id: newLocalId(),
          owner: store.owner,
          expectedVersion: snapshot.version,
          kind: 'shared',
          values: values,
        );
        final plan = planLocal(snapshot, command);
        if (!mounted) return;
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Review private money effects'),
            content: Text(plan.effects.join('\n\n')),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Edit'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Save my private action'),
              ),
            ],
          ),
        );
        if (confirmed != true) reject('Private action was not saved.');
        await store.commit(command);
        await widget.session.localFinance.reload();
      },
    );
  }
}

class SharedField {
  const SharedField(this.key, this.label, {this.value = '', this.options});
  final String key, label, value;
  final Map<String, String>? options;
}

class _SharedForm extends StatefulWidget {
  const _SharedForm({
    required this.title,
    required this.fields,
    required this.onSave,
    this.onDraft,
    this.preview,
  });
  final String title;
  final List<SharedField> fields;
  final Future<void> Function(Map<String, String>) onSave;
  final Future<void> Function(Map<String, String>)? onDraft;
  final List<String> Function(Map<String, String>)? preview;
  @override
  State<_SharedForm> createState() => _SharedFormState();
}

class _SharedFormState extends State<_SharedForm> {
  late final controls = {
    for (final f in widget.fields)
      f.key: TextEditingController(
        text: f.value.isEmpty && f.options != null
            ? f.options!.keys.first
            : f.value,
      ),
  };
  String? error;
  bool busy = false, review = false;
  List<String> effects = [];
  Future<void> draftWrites = Future.value();
  void retain() {
    if (widget.onDraft == null) return;
    final frozen = values;
    draftWrites = draftWrites.then((_) => widget.onDraft!(frozen)).catchError((
      Object e,
    ) {
      if (mounted) {
        setState(
          () => error = 'This draft could not be saved. Check available storage and retry.',
        );
      }
    });
  }

  Map<String, String> get values => {
    for (final e in controls.entries) e.key: e.value.text.trim(),
  };
  @override
  void dispose() {
    for (final c in controls.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: FinancePage(
      title: widget.title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'FINANCIAL WORKFLOW / ${review ? '02 REVIEW' : '01 DETAILS'}',
            widget.title,
            'Review exact group facts and your own private effects separately.',
          ),
          FinanceColumns(
            main: EditorialSurface(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (error != null) FinanceNotice(error!),
                  if (review) ...[
                    for (final effect in effects)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(effect),
                      ),
                    const FinanceNotice(
                      'Review the values below. Group reporting moves no private money. Receipt confirmation is independent from synchronization.',
                    ),
                    for (final f in widget.fields)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '${f.label}: ${f.options?[values[f.key]] ?? values[f.key]}',
                        ),
                      ),
                  ] else
                    for (final f in widget.fields)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: f.options == null
                            ? TextField(
                                key: ValueKey('shared-field-${f.key}'),
                                controller: controls[f.key],
                                decoration: InputDecoration(labelText: f.label),
                                onChanged: (_) {
                                  retain();
                                },
                                maxLength: 2000,
                              )
                            : DropdownButtonFormField<String>(
                                key: ValueKey('shared-field-${f.key}'),
                                initialValue: controls[f.key]!.text,
                                isExpanded: true,
                                decoration: InputDecoration(labelText: f.label),
                                items: [
                                  for (final o in f.options!.entries)
                                    DropdownMenuItem(
                                      value: o.key,
                                      child: Text(
                                        o.value,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                ],
                                onChanged: (v) {
                                  controls[f.key]!.text = v!;
                                  retain();
                                },
                              ),
                      ),
                ],
              ),
            ),
            aside: EditorialSurface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const FinanceNotice(
                    'Your draft stays on this device. Online authority is rechecked when the service accepts the action. Group acceptance never confirms receipt or moves another member’s private money.',
                  ),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      TextButton(
                        onPressed: busy ? null : () => Navigator.pop(context),
                        child: const Text('Close'),
                      ),
                      if (review)
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => setState(() => review = false),
                          child: const Text('Edit'),
                        ),
                      FilledButton(
                        onPressed: busy
                            ? null
                            : () async {
                                if (!review) {
                                  try {
                                    final calculated =
                                        widget.preview?.call(values) ??
                                        <String>[];
                                    setState(() {
                                      effects = calculated;
                                      review = true;
                                      error = null;
                                    });
                                  } catch (e) {
                                    setState(
                                      () => error = e is LocalRuleException
                                          ? e.message
                                          : e is FormatException
                                          ? e.message
                                          : 'Review exact amounts and participants.',
                                    );
                                  }
                                  return;
                                }
                                setState(() {
                                  busy = true;
                                  error = null;
                                });
                                try {
                                  await draftWrites;
                                  if (error != null) reject(error!);
                                  await widget.onSave(values);
                                  if (context.mounted) Navigator.pop(context);
                                } catch (e) {
                                  if (mounted) {
                                    setState(() {
                                      busy = false;
                                      error = e is LocalRuleException
                                          ? e.message
                                          : 'The request could not complete. Your original intent and draft are retained; reconnect and retry.';
                                    });
                                  }
                                }
                              },
                        child: Text(
                          busy
                              ? 'Saving…'
                              : review
                              ? 'Save reviewed values'
                              : 'Review',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
