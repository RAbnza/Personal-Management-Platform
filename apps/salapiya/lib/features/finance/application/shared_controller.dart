part of 'financial_controller.dart';

extension SharedPrototypeCommands on FinancialController {
  List<SharedBill> get groupBills => bills
      .where(
        (b) =>
            b.groupId == activeGroup &&
            (!formerMember ||
                (exitEntitlements['$activeGroup:$actor'] ?? {}).contains(b.id)),
      )
      .toList();
  List<SharedSettlement> get groupSettlements => settlements
      .where(
        (s) =>
            s.groupId == activeGroup &&
            (!formerMember ||
                s.allocations.keys.every(
                      (id) => (exitEntitlements['$activeGroup:$actor'] ?? {})
                          .contains(id),
                    ) &&
                    (s.sender == actor || s.recipient == actor)),
      )
      .toList();
  List<String> get visibleGroupHistory => formerMember
      ? (exitHistories['$activeGroup:$actor'] ?? [])
      : groupHistory;
  SharedBill bill(String id) => bills.firstWhere((b) => b.id == id);
  SharedSettlement settlement(String id) =>
      settlements.firstWhere((s) => s.id == id);
  void setActor(String name, bool former) {
    actor = name;
    formerMember = former || (members[name]?.startsWith('Former') ?? false);
    if (formerMember) {
      exitEntitlements.putIfAbsent(
        '$activeGroup:$name',
        () => bills
            .where((b) => b.groupId == activeGroup)
            .map((b) => b.id)
            .toSet(),
      );
      exitHistories.putIfAbsent(
        '$activeGroup:$name',
        () => List.of(groupHistory),
      );
    }
    version++;
    changed();
  }

  void selectGroup(String id) {
    activeGroup = id;
    actor = 'Amihan';
    formerMember = members[actor]?.startsWith('Former') ?? false;
    version++;
    changed();
  }

  void sharedDefaults(
    FinancialAction action,
    Map<String, String> v,
    String? sourceId,
  ) {
    v.addAll({
      'name': 'Dinner with friends',
      'amount': '1200.00',
      'mode': 'Equal',
      'private': 'false',
      'claim': 'Accept invitation',
      'memberKind': 'Manual · no login',
    });
    for (final m in members.keys) {
      v['include:$m'] = (!(members[m]?.startsWith('Former') ?? false))
          .toString();
      v['paid:$m'] = m == 'Amihan' ? '1200.00' : '0.00';
      v['share:$m'] = m == 'Amihan' || m == 'Tala' || m == 'Nico'
          ? '400.00'
          : '0.00';
    }
    if ({
      FinancialAction.sharedCorrection,
      FinancialAction.sharedRefund,
      FinancialAction.adoption,
      FinancialAction.privateReview,
    }.contains(action)) {
      final candidates = groupBills
          .where((b) => sourceId == null || b.id == sourceId)
          .toList();
      if (candidates.isNotEmpty) {
        final b = candidates.first;
        v.addAll({
          'source': b.id,
          'amount': ExactFinance.decimal(b.total),
          'name': b.title,
        });
        for (final m in members.keys) {
          v['include:$m'] = b.shares.containsKey(m).toString();
          v['paid:$m'] = ExactFinance.decimal(b.paid[m] ?? BigInt.zero);
          v['share:$m'] = ExactFinance.decimal(b.shares[m] ?? BigInt.zero);
        }
        if (action == FinancialAction.sharedRefund) {
          v['amount'] = '300.00';
          for (final m in members.keys) {
            v['paid:$m'] = m == 'Amihan' ? '300.00' : '0.00';
            v['share:$m'] = b.shares.containsKey(m) ? '100.00' : '0.00';
          }
          v['mode'] = 'Exact';
        }
      }
    }
    if (action == FinancialAction.settlement) {
      v['amount'] = '150.00';
      for (final b in groupBills) {
        v['allocate:${b.id}'] = b == groupBills.first ? '150.00' : '0.00';
      }
    }
    if (action == FinancialAction.confirmation && groupSettlements.isNotEmpty) {
      v['source'] = sourceId ?? groupSettlements.first.id;
    }
    if (action == FinancialAction.group) v['name'] = 'Weekend adventures';
    if (action == FinancialAction.member) v['name'] = 'Luna';
    if (action == FinancialAction.invitation) {
      v.addAll({
        'name': 'Luna',
        'evidence': 'DEMO-INVITE',
        'claim': 'Accept invitation',
      });
    }
    if (action == FinancialAction.privateReview) {
      v['decision'] = 'Keep actual funding, update share';
    }
    if (action == FinancialAction.adoption) v['existing'] = '';
  }

  Map<String, BigInt> groupPositions({bool projected = false}) {
    final result = {for (final m in members.keys) m: BigInt.zero};
    for (final b in groupBills) {
      for (final m in members.keys) {
        result[m] =
            result[m]! +
            (b.paid[m] ?? BigInt.zero) -
            (b.receivedRefunds[m] ?? BigInt.zero) -
            (b.shares[m] ?? BigInt.zero) +
            (b.shareRefunds[m] ?? BigInt.zero);
      }
    }
    for (final s in groupSettlements.where(
      (s) => projected ? s.projected : s.confirmed,
    )) {
      result[s.sender] = (result[s.sender] ?? BigInt.zero) + s.amount;
      result[s.recipient] = (result[s.recipient] ?? BigInt.zero) - s.amount;
    }
    return result;
  }

  /// Deterministic attribution of remaining paid/share axes; no redirection.
  BigInt billObligation(
    SharedBill b,
    String sender,
    String recipient, {
    String? excludeSettlement,
  }) {
    final credits = <String, BigInt>{}, owes = <String, BigInt>{};
    final names = members.keys.toList()..sort();
    for (final m in names) {
      final net =
          (b.paid[m] ?? BigInt.zero) -
          (b.receivedRefunds[m] ?? BigInt.zero) -
          (b.shares[m] ?? BigInt.zero) +
          (b.shareRefunds[m] ?? BigInt.zero);
      if (net > BigInt.zero) credits[m] = net;
      if (net < BigInt.zero) owes[m] = -net;
    }
    var target = BigInt.zero;
    for (final d in owes.keys) {
      for (final c in credits.keys) {
        final used = owes[d]! < credits[c]! ? owes[d]! : credits[c]!;
        if (d == sender && c == recipient) target += used;
        owes[d] = owes[d]! - used;
        credits[c] = credits[c]! - used;
      }
    }
    for (final s in settlements.where(
      (s) =>
          s.id != excludeSettlement &&
          s.confirmed &&
          s.sender == sender &&
          s.recipient == recipient,
    )) {
      target -= s.allocations[b.id] ?? BigInt.zero;
    }
    return target > BigInt.zero ? target : BigInt.zero;
  }

  (Map<String, BigInt>, BigInt, BigInt) previewShared(
    FinancialAction action,
    Map<String, String> v,
    BigInt total,
    BigInt Function(String, {bool zero}) parse,
    List<String> errors,
    List<String> effects,
  ) {
    final cash = <String, BigInt>{};
    var card = BigInt.zero, spending = BigInt.zero;
    final privateAction =
        action == FinancialAction.adoption ||
        action == FinancialAction.privateReview;
    if (formerMember &&
        !privateAction &&
        action != FinancialAction.confirmation) {
      errors.add(
        'Former member: retained history and private review only. New group writes are unavailable.',
      );
    }
    if (archivedGroups.contains(activeGroup) &&
        !privateAction &&
        action != FinancialAction.confirmation &&
        action != FinancialAction.group) {
      errors.add(
        'This group is archived. Retained history and permitted receipt resolution remain available.',
      );
    }
    if (privateAction && actor != 'Amihan') {
      errors.add(
        'Only Amihan can authorize this device’s private records. Group ownership grants no private access.',
      );
    }
    void required(String key, String message) {
      if ((v[key] ?? '').trim().isEmpty) errors.add(message);
    }

    Map<String, BigInt> axis(String prefix) => {
      for (final m in members.keys)
        if (prefix == 'paid' || v['include:$m'] == 'true')
          m: parse('$prefix:$m', zero: true),
    };
    switch (action) {
      case FinancialAction.group:
        required('name', 'Name your group.');
        effects.add(
          'Fictional group created in memory. No online membership or sharing connection.',
        );
      case FinancialAction.member:
        if (!groupAdministrationAvailable) {
          errors.add('Only the group owner manages participants in this demo.');
        }
        required('name', 'Name the participant.');
        if (members.containsKey(v['name']?.trim())) {
          errors.add('This participant already exists.');
        }
        effects.add(
          '${v['name']} · ${v['memberKind']}. A manual identity grants no login access.',
        );
      case FinancialAction.invitation:
        if (!groupAdministrationAvailable) {
          errors.add(
            'Current owner administration is required for invitations and nominations.',
          );
        }
        required('name', 'Enter the invited participant name.');
        required('evidence', 'Enter the demo invitation reference.');
        if (v['claim'] == 'Expired invitation') {
          errors.add(
            'Invitation expired. Request a new invitation; draft retained.',
          );
        }
        if (v['acknowledge'] != 'true') {
          errors.add(
            'Consent to visible group history and manual-evidence limitations.',
          );
        }
        effects.add(
          'Simulated consent/claim for ${v['name']}. Existing manual receipts remain manual; no email or token sent.',
        );
      case FinancialAction.sharedBill || FinancialAction.sharedCorrection:
        required('name', 'Describe the shared expense.');
        final paid = axis('paid');
        final included = members.keys.where((m) => v['include:$m'] == 'true');
        final shares = v['mode'] == 'Equal'
            ? ExactFinance.equal(total, included)
            : axis('share');
        if (shares.isEmpty) errors.add('Select at least one participant.');
        if (action == FinancialAction.sharedBill &&
            members.entries.any(
              (e) =>
                  e.value.startsWith('Former') &&
                  ((paid[e.key] ?? BigInt.zero) > BigInt.zero ||
                      shares.containsKey(e.key)),
            )) {
          errors.add(
            'Former participants cannot be included in a new bill. Their earlier sources remain intact.',
          );
        }
        if (ExactFinance.sum(paid.values) != total) {
          errors.add('Payer contributions must exactly equal the bill total.');
        }
        if (ExactFinance.sum(shares.values) != total) {
          errors.add('Participant shares must exactly equal the bill total.');
        }
        if (action == FinancialAction.sharedCorrection) {
          if (!bills.any((b) => b.id == v['source'])) {
            errors.add('Bill is unavailable.');
            break;
          }
          final b = bill(v['source']!);
          if (b.creator != actor) {
            errors.add('Only the original bill creator can correct this bill.');
          }
          required('reason', 'Explain the revision.');
          for (final m in members.keys) {
            if ((paid[m] ?? BigInt.zero) <
                    (b.receivedRefunds[m] ?? BigInt.zero) ||
                (shares[m] ?? BigInt.zero) <
                    (b.shareRefunds[m] ?? BigInt.zero)) {
              errors.add(
                'Revision contradicts retained refund allocations for $m.',
              );
            }
          }
          effects.add(
            'Revision ${b.revision} → ${b.revision + 1}; original bill and payments retained. Existing private evidence will require review.',
          );
        }
        for (final m in shares.keys) {
          effects.add(
            '$m · paid ${amount(paid[m] ?? BigInt.zero)} · share ${amount(shares[m]!)} · position ${amount((paid[m] ?? BigInt.zero) - shares[m]!)}',
          );
        }
        effects.add(
          'Group facts only. Private account names/balances are never shared. Equal remainder follows canonical name order.',
        );
        if (v['private'] == 'true' && action == FinancialAction.sharedBill) {
          if (actor != 'Amihan') {
            errors.add('Private adoption requires Amihan’s own authorization.');
          }
          final ownPaid = paid['Amihan'] ?? BigInt.zero;
          if (v['funding'] == 'New card') {
            card += ownPaid;
          } else {
            cash[v['account'] ?? ''] = -ownPaid;
          }
          spending += shares['Amihan'] ?? BigInt.zero;
          effects.add(
            'Private only: actual funding ${amount(ownPaid)}, own expense ${amount(spending)}, receivable/payable ${amount(ownPaid - spending)}.',
          );
        }
      case FinancialAction.sharedRefund:
        if (!bills.any((b) => b.id == v['source'])) {
          errors.add('Select a source bill.');
          break;
        }
        final b = bill(v['source']!);
        if (b.creator != actor) {
          errors.add('Only the creator can append this shared refund.');
        }
        final received = axis('paid'), credits = axis('share');
        if (ExactFinance.sum(received.values) != total ||
            ExactFinance.sum(credits.values) != total) {
          errors.add(
            'Received-money and consumed-share-credit axes must each equal the refund total.',
          );
        }
        for (final m in members.keys) {
          if ((received[m] ?? BigInt.zero) +
                      (b.receivedRefunds[m] ?? BigInt.zero) >
                  (b.paid[m] ?? BigInt.zero) ||
              (credits[m] ?? BigInt.zero) + (b.shareRefunds[m] ?? BigInt.zero) >
                  (b.shares[m] ?? BigInt.zero)) {
            errors.add('Refund exceeds $m’s remaining paid/share source cap.');
          }
          effects.add(
            '$m · receives ${amount(received[m] ?? BigInt.zero)} · share credit ${amount(credits[m] ?? BigInt.zero)}',
          );
        }
        required('reason', 'Explain the refund.');
        effects.add(
          'Prior settlements remain historical. Private cash/card refund requires the private owner’s review; group refund alone moves no private money.',
        );
      case FinancialAction.settlement:
        final sender = v['sender']!, recipient = v['recipient']!;
        if (sender == recipient) {
          errors.add('Choose different sender and recipient.');
        }
        if (!members.containsKey(sender) || !members.containsKey(recipient)) {
          errors.add('Select current group participants.');
        }
        if (actor != sender && !isGroupOwner) {
          errors.add('Only the sender or owner can enter this report.');
        }
        var allocated = BigInt.zero;
        for (final b in groupBills) {
          final x = parse('allocate:${b.id}', zero: true);
          allocated += x;
          if (x > billObligation(b, sender, recipient)) {
            errors.add(
              '${b.title}: allocation exceeds this pair’s remaining source cap.',
            );
          }
          if (x > BigInt.zero) {
            effects.add('${b.title} · v${b.revision} · ${amount(x)}');
          }
        }
        if (allocated > total) {
          errors.add('Selected bill allocations exceed the payment.');
        }
        final advance = total - allocated;
        if (advance > BigInt.zero && v['acknowledge'] != 'true') {
          errors.add('Acknowledge the unallocated advance/reverse position.');
        }
        effects.add(
          'Pending report $sender → $recipient ${amount(total)}. Allocated ${amount(allocated)}; advance ${amount(advance)}. Confirmed positions unchanged until receipt.',
        );
        effects.add(
          'No private cash is assumed. Link actual receipt/payment separately in private review.',
        );
      case FinancialAction.confirmation:
        if (!settlements.any((s) => s.id == v['source'])) {
          errors.add('Payment is unavailable.');
          break;
        }
        final s = settlement(v['source']!), decision = v['decision'];
        if (formerMember && !groupSettlements.any((x) => x.id == s.id)) {
          errors.add('This payment is outside retained entitlement.');
        }
        final manual =
            members[s.recipient] != null &&
            !members[s.recipient]!.startsWith('Registered');
        if (actor != s.recipient &&
            !(manual && isGroupOwner) &&
            !(decision == 'Cancel report' && actor == s.sender)) {
          errors.add(
            'Only the recipient can confirm/dispute. Manual recipients require explicit owner-entered evidence.',
          );
        }
        if (decision == 'Reverse confirmation') {
          if (!s.confirmed) {
            errors.add('Only a confirmed payment can be reversed.');
          }
          required('reason', 'Explain the reversal.');
        } else if (s.status != SettlementStatus.pending) {
          errors.add(
            'This report is no longer pending. Its history is immutable.',
          );
        }
        if (decision == 'Confirm receipt') {
          for (final e in s.allocations.entries) {
            final b = bill(e.key);
            if (b.revision != s.versions[e.key] ||
                e.value >
                    billObligation(
                      b,
                      s.sender,
                      s.recipient,
                      excludeSettlement: s.id,
                    )) {
              errors.add(
                'Source changed. Cancel this report and review a fresh allocation.',
              );
            }
          }
          if (manual && v['acknowledge'] != 'true') {
            errors.add(
              'Acknowledge manual confirmation is unverified, not authenticated receipt.',
            );
          }
        }
        if (decision == 'Dispute' || decision == 'Cancel report') {
          required('reason', 'Explain the dispute or cancellation.');
        }
        effects.add(
          '${s.sender} → ${s.recipient} · ${amount(s.amount)} · $decision${manual ? ' · manual/unverified' : ''}. No second cash movement and no automatic cash return on reversal.',
        );
      case FinancialAction.adoption || FinancialAction.privateReview:
        if (!bills.any((b) => b.id == v['source'])) {
          errors.add('Select an available bill.');
          break;
        }
        final b = bill(v['source']!);
        final funding =
            (b.paid['Amihan'] ?? BigInt.zero) -
            (b.receivedRefunds['Amihan'] ?? BigInt.zero);
        final share =
            (b.shares['Amihan'] ?? BigInt.zero) -
            (b.shareRefunds['Amihan'] ?? BigInt.zero);
        final old = adoptions[b.id];
        if (action == FinancialAction.adoption && old != null) {
          errors.add(
            'Already adopted. Use private-effect review for changed evidence.',
          );
        }
        if (action == FinancialAction.privateReview && old == null) {
          errors.add('Adopt this bill before reviewing a private difference.');
          break;
        }
        if (action == FinancialAction.privateReview) {
          required('reason', 'Explain your private review.');
          if (v['decision'] == 'Retain private evidence') {
            effects.add(
              'Keep actual funding ${amount(old!.funding)} and expense ${amount(old.share)}. Attributed review of current v${b.revision}; no posting and no synchronized claim.',
            );
            break;
          }
          spending += share - old!.share;
          if (v['decision'] == 'Correct actual funding') {
            if (v['acknowledge'] != 'true') {
              errors.add(
                'Explicit consent is required to correct actual private funding.',
              );
            }
            if (old.source == 'card') {
              card += funding - old.funding;
            } else if (old.source.isNotEmpty) {
              cash[old.source] = old.funding - funding;
            }
          }
          effects.add(
            'Private share ${amount(old.share)} → ${amount(share)}. ${v['decision']}. Old accepted revision remains in history.',
          );
        } else {
          final mode = v['funding'];
          if (mode == 'Existing purchase') {
            final matches = records
                .where(
                  (r) =>
                      r.id == v['existing'] &&
                      ['expense', 'cardPurchase'].contains(r.kind),
                )
                .toList();
            if (matches.isEmpty) {
              errors.add('Select your original cash/card purchase.');
              break;
            }
            final r = matches.first;
            if (r.amount != funding) {
              errors.add(
                'Existing purchase funding must exactly equal your contribution.',
              );
            }
            if (records.any((x) => x.sourceId == r.id) ||
                adoptions.values.any((a) => a.existingId == r.id)) {
              errors.add('Dependent evidence blocks conversion.');
            }
            spending += share - r.spending;
            effects.add(
              'Same logical purchase ${r.id}; funding preserved. Cash/card delta zero, expense reclassified to your share.',
            );
          } else if (mode == 'Unpaid share') {
            if (funding != BigInt.zero) {
              errors.add(
                'An unpaid adoption requires zero own paid contribution.',
              );
            }
            spending += share;
          } else {
            if (mode == 'New card') {
              card += funding;
            } else {
              cash[v['account'] ?? ''] = -funding;
            }
            spending += share;
          }
          effects.add(
            'Own expense ${amount(share)} · receivable/payable ${amount(funding - share)}. No other participant’s private ledger changes.',
          );
        }
      default:
        break;
    }
    return (cash, card, spending);
  }

  void applyShared(FinancialPreview p) {
    final v = p.values;
    Map<String, BigInt> axis(String prefix) => {
      for (final m in members.keys)
        if (prefix == 'paid' || v['include:$m'] == 'true')
          m: DemoMoney.parse(v['$prefix:$m'] ?? '0')!,
    };
    switch (p.action) {
      case FinancialAction.group:
        groups[p.commandId] = v['name']!;
        groupOwners[p.commandId] = 'Amihan';
        activeGroup = p.commandId;
        memberSets[p.commandId] = {'Amihan': 'Registered · owner'};
      case FinancialAction.member:
        members[v['name']!.trim()] = v['memberKind']!;
      case FinancialAction.invitation:
        if (v['claim'] == 'Accept invitation') {
          members[v['name']!.trim()] = 'Registered · member';
        }
      case FinancialAction.sharedBill || FinancialAction.sharedCorrection:
        final old = p.action == FinancialAction.sharedCorrection
            ? bill(v['source']!)
            : null;
        final b = SharedBill(
          id: old?.id ?? p.commandId,
          title: v['name']!,
          total: p.amount,
          paid: axis('paid'),
          shares: v['mode'] == 'Equal'
              ? ExactFinance.equal(
                  p.amount,
                  members.keys.where((m) => v['include:$m'] == 'true'),
                )
              : axis('share'),
          creator: old?.creator ?? actor,
          revision: (old?.revision ?? 0) + 1,
          previous: old,
          reason: v['reason']!,
          groupId: v['group']!,
        );
        if (old != null) {
          b.receivedRefunds.addAll(old.receivedRefunds);
          b.shareRefunds.addAll(old.shareRefunds);
          bills[bills.indexOf(old)] = b;
        } else {
          bills.insert(0, b);
        }
        if (v['private'] == 'true' && old == null) {
          adoptions[b.id] = PrivateAdoption(
            b.id,
            b.revision,
            b.paid['Amihan'] ?? BigInt.zero,
            b.shares['Amihan'] ?? BigInt.zero,
            v['funding'] == 'New card' ? 'card' : v['account']!,
            null,
          );
        }
      case FinancialAction.sharedRefund:
        final old = bill(v['source']!);
        final b = SharedBill(
          id: old.id,
          title: old.title,
          total: old.total,
          paid: old.paid,
          shares: old.shares,
          creator: old.creator,
          revision: old.revision + 1,
          previous: old,
          reason: 'Refund: ${v['reason']}',
          groupId: old.groupId,
        );
        b.receivedRefunds.addAll(old.receivedRefunds);
        b.shareRefunds.addAll(old.shareRefunds);
        bills[bills.indexOf(old)] = b;
        for (final e in axis('paid').entries) {
          b.receivedRefunds[e.key] =
              (b.receivedRefunds[e.key] ?? BigInt.zero) + e.value;
        }
        for (final e in axis('share').entries) {
          b.shareRefunds[e.key] =
              (b.shareRefunds[e.key] ?? BigInt.zero) + e.value;
        }
      case FinancialAction.settlement:
        final allocations = {
          for (final b in groupBills)
            if (DemoMoney.parse(v['allocate:${b.id}'] ?? '0')! > BigInt.zero)
              b.id: DemoMoney.parse(v['allocate:${b.id}']!)!,
        };
        settlements.insert(
          0,
          SharedSettlement(
            id: p.commandId,
            sender: v['sender']!,
            recipient: v['recipient']!,
            amount: p.amount,
            allocations: allocations,
            versions: {
              for (final id in allocations.keys) id: bill(id).revision,
            },
            groupId: v['group']!,
          ),
        );
      case FinancialAction.confirmation:
        final s = settlement(v['source']!);
        s.status = switch (v['decision']) {
          'Dispute' => SettlementStatus.disputed,
          'Cancel report' => SettlementStatus.cancelled,
          'Reverse confirmation' => SettlementStatus.reversed,
          _ =>
            members[s.recipient]!.startsWith('Registered')
                ? SettlementStatus.confirmed
                : SettlementStatus.manual,
        };
        s.history.add(
          '${s.status.name} · $actor · ${v['date']} · ${v['reason']}',
        );
      case FinancialAction.adoption || FinancialAction.privateReview:
        final b = bill(v['source']!);
        final old = adoptions[b.id];
        if (v['decision'] == 'Retain private evidence') {
          retainedReviews[b.id] = 'v${b.revision} · ${v['reason']}';
          break;
        }
        final existing = records
            .where((r) => r.id == v['existing'])
            .firstOrNull;
        adoptions[b.id] = PrivateAdoption(
          b.id,
          b.revision,
          old != null && v['decision'] != 'Correct actual funding'
              ? old.funding
              : (b.paid['Amihan'] ?? BigInt.zero) -
                    (b.receivedRefunds['Amihan'] ?? BigInt.zero),
          (b.shares['Amihan'] ?? BigInt.zero) -
              (b.shareRefunds['Amihan'] ?? BigInt.zero),
          old?.source ??
              (existing != null
                  ? (existing.card != BigInt.zero ? 'card' : existing.accountId)
                  : v['funding'] == 'New card'
                  ? 'card'
                  : v['funding'] == 'Unpaid share'
                  ? ''
                  : v['account']!),
          old?.existingId ?? existing?.id,
        );
      default:
        break;
    }
    if (p.action != FinancialAction.adoption &&
        p.action != FinancialAction.privateReview) {
      groupHistory.insert(
        0,
        '${p.action.label} · ${v['date']} · $actor · ${v['reason']}',
      );
    }
  }
}
