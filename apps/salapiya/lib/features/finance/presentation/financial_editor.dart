import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../application/financial_controller.dart';
import '../contracts/financial_models.dart';
import 'financial_widgets.dart';

Future<void> openFinancialEditor(
  BuildContext context,
  FinancialController controller,
  FinancialAction action, {
  String? sourceId,
  Map<String, String>? initial,
}) => openDemoPage<void>(
  context,
  FinancialEditor(
    controller: controller,
    action: action,
    sourceId: sourceId,
    initial: initial,
  ),
  'finance/${action.name}',
);

class FinancialEditor extends StatefulWidget {
  const FinancialEditor({
    super.key,
    required this.controller,
    required this.action,
    this.sourceId,
    this.initial,
  });
  final FinancialController controller;
  final FinancialAction action;
  final String? sourceId;
  final Map<String, String>? initial;
  @override
  State<FinancialEditor> createState() => _FinancialEditorState();
}

class _FinancialEditorState extends State<FinancialEditor> {
  late final values = {
    ...widget.controller.defaults(widget.action, sourceId: widget.sourceId),
    ...?widget.initial,
  };
  late String command = widget.controller.nextCommand();
  final Map<String, TextEditingController> fields = {};
  FinancialPreview? preview;
  DemoOutcome outcome = DemoOutcome.accepted;
  DemoOutcome? result;
  bool reviewing = false, busy = false, dirty = false, allowPop = false;
  FinancialController get c => widget.controller;
  FinancialAction get action => widget.action;
  @override
  void dispose() {
    for (final f in fields.values) {
      f.dispose();
    }
    super.dispose();
  }

  Widget text(String key, String label, {String? helper, bool money = false}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: TextField(
          key: ValueKey('field-$key'),
          controller: fields.putIfAbsent(
            key,
            () => TextEditingController(text: values[key] ?? ''),
          ),
          keyboardType: money
              ? const TextInputType.numberWithOptions(decimal: true)
              : TextInputType.text,
          decoration: InputDecoration(
            labelText: label,
            helperText: helper,
            helperMaxLines: 4,
            prefixText: money ? '₱ ' : null,
          ),
          onChanged: (x) => setState(() {
            values[key] = x;
            dirty = true;
          }),
        ),
      );
  Widget select(String key, String label, Map<String, String> choices) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: DropdownButtonFormField<String>(
          key: ValueKey('$key-${values[key]}'),
          initialValue: choices.containsKey(values[key]) ? values[key] : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: label),
          items: [
            for (final e in choices.entries)
              DropdownMenuItem(
                value: e.key,
                child: Text(e.value, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (x) => setState(() {
            values[key] = x ?? '';
            dirty = true;
          }),
        ),
      );
  Widget toggle(String key, String label) => CheckboxListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    value: values[key] == 'true',
    controlAffinity: ListTileControlAffinity.leading,
    onChanged: (x) => setState(() {
      values[key] = '$x';
      dirty = true;
    }),
  );
  Widget section(String title, List<Widget> children) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const SizedBox(height: 8),
      SectionHeading(title),
      ...children,
      const SizedBox(height: 16),
    ],
  );
  Widget account({
    String key = 'account',
    String label = 'Financial account',
    bool card = false,
  }) => select(key, label, {
    for (final a in c.activeAccounts) a.id: a.name,
    if (card) 'card': 'Everyday credit · liability',
  });
  Widget amount([String label = 'Amount']) =>
      text('amount', label, money: true);
  Widget date() => text('date', 'Date · YYYY-MM-DD');
  Widget reason() => text('reason', 'Reason / correction evidence');
  Widget evidence() => text(
    'evidence',
    'Provider / source reference',
    helper: 'Invented evidence for this demo only.',
  );
  Map<String, String> choices(List<String> options) => {
    for (final x in options) x: x,
  };

  List<Widget> get entryFields {
    switch (action) {
      case FinancialAction.debtClassification:
        return [
          select('source', 'Unresolved payment', {
            for (final id in c.unresolvedPayments.keys)
              id: '${c.debt(c.unresolvedPayments[id]!).name} · $id',
          }),
          text('principal', 'Confirmed principal', money: true),
          text('interest', 'Confirmed interest', money: true),
          text('charges', 'Previously recognized charge repaid', money: true),
          evidence(),
          const FinanceNotice(
            'The original cash payment stays intact. This only resolves its accounting classification.',
          ),
        ];
      case FinancialAction.settlementPrivate:
        return [
          select(
            'decision',
            'Private action',
            choices(['Link actual movement', 'Review clearing coverage']),
          ),
          select('source', 'Your group payment / receipt', {
            for (final s in c.groupSettlements.where(
              (s) => s.sender == 'Amihan' || s.recipient == 'Amihan',
            ))
              s.id: '${s.sender} → ${s.recipient} · ${c.amount(s.amount)}',
          }),
          account(),
          date(),
          evidence(),
          reason(),
          const FinanceNotice(
            'Only link actual money that moved. This does not confirm receipt for the group. Pending or incomplete coverage stays in private clearing.',
          ),
        ];
      case FinancialAction.account:
        return [
          text('name', 'Account name'),
          select(
            'kind',
            'Account type',
            choices(['Cash', 'Bank', 'Mobile wallet']),
          ),
          amount('Opening balance'),
          text('cutoff', 'Opening cutoff · YYYY-MM-DD'),
          const FinanceNotice(
            'Opening balances establish a starting point. They are not income. History before the cutoff belongs in import review.',
          ),
        ];
      case FinancialAction.expense ||
          FinancialAction.income ||
          FinancialAction.cardPurchase:
        return [
          text('name', 'Description'),
          amount(),
          if (action != FinancialAction.cardPurchase)
            account(card: action == FinancialAction.expense),
          date(),
          select('category', 'Category', choices(c.categories)),
          if (action != FinancialAction.income) ...[
            toggle('split', 'Split across two categories'),
            if (values['split'] == 'true') ...[
              text('splitAmount', 'First category amount', money: true),
              select(
                'splitCategory',
                'Remainder category',
                choices(c.categories),
              ),
            ],
          ],
          if (action == FinancialAction.expense)
            const FinanceNotice(
              'After recording, use “Share this purchase” in its detail to convert the same cash/card action without duplicating funding.',
            ),
        ];
      case FinancialAction.transfer:
        return [
          amount('Transfer amount'),
          account(label: 'From account'),
          account(key: 'destination', label: 'To account'),
          text('fee', 'Separate transfer fee', money: true),
          date(),
          const FinanceNotice(
            'Both sides move together. Your liquid total changes only by the fee.',
          ),
        ];
      case FinancialAction.correction ||
          FinancialAction.refund ||
          FinancialAction.reversal ||
          FinancialAction.cardRefund:
        return [
          if (values['source']?.isEmpty ?? true)
            select('source', 'Original purchase', {
              for (final r in c.records.where(
                (r) => ['expense', 'income', 'cardPurchase'].contains(r.kind),
              ))
                r.id: '${r.title} · ${c.amount(r.amount)}',
            }),
          if (action != FinancialAction.reversal)
            amount(
              action == FinancialAction.correction
                  ? 'Corrected total'
                  : 'Refund amount',
            ),
          date(),
          reason(),
          const FinanceNotice(
            'Original records and dependent evidence remain visible. A replacement cannot silently bypass a refund or shared adoption.',
          ),
        ];
      case FinancialAction.reconcile:
        return [
          account(),
          amount('Observed balance'),
          date(),
          reason(),
          const FinanceNotice(
            'The difference is reviewed as an explicit adjustment, never an independently overwritten balance.',
          ),
        ];
      case FinancialAction.archive:
        return [account(), reason()];
      case FinancialAction.category:
        return [text('name', 'Category name')];
      case FinancialAction.debtImport || FinancialAction.borrowing:
        return [
          text('name', 'Debt / lender name'),
          amount(
            action == FinancialAction.debtImport
                ? 'Recognized opening principal'
                : 'Recognized borrowed principal',
          ),
          text(
            'charges',
            'Recognized unpaid charge',
            money: true,
            helper: 'Explicit provider charge only. Future scheduled charges do not belong here.',
          ),
          date(),
          if (action == FinancialAction.borrowing) ...[
            account(label: 'Receive net proceeds in'),
            text('fee', 'Withheld fee', money: true),
          ],
          if (action == FinancialAction.debtImport)
            const FinanceNotice(
              'Only the supplied opening principal is recognized. No historical payment, cash or interest breakdown is inferred.',
            ),
        ];
      case FinancialAction.debtPayment ||
          FinancialAction.payoff ||
          FinancialAction.schedule:
        return [
          select('debt', 'Debt', {for (final d in c.debts) d.id: d.name}),
          if (action == FinancialAction.debtPayment) ...[
            amount('Contractual payment'),
            text('fee', 'External payment fee', money: true),
            account(label: 'Pay from'),
            date(),
            select(
              'classification',
              'Accounting classification',
              choices(['Unresolved', 'Known']),
            ),
            if (values['classification'] == 'Known') ...[
              text('principal', 'Principal component', money: true),
              text('interest', 'Interest component', money: true),
              text(
                'charges',
                'Previously recognized charge repaid',
                money: true,
              ),
            ],
            text('allocation', 'Coverage of current schedule', money: true),
            const FinanceNotice(
              'Due coverage is separate from principal/interest. Unknown components remain unresolved; external fees do not satisfy an installment.',
            ),
          ],
          if (action == FinancialAction.schedule) ...[
            amount('Expected installment'),
            text('count', 'Number of installments'),
            text('due', 'First due date · YYYY-MM-DD'),
            reason(),
            const FinanceNotice(
              'Prior schedule versions and paid mappings remain in history. This revision does not record a payment.',
            ),
          ],
          if (action == FinancialAction.payoff) ...[
            amount('Provider-confirmed principal'),
            text('interest', 'Recognized payoff interest', money: true),
            text('fee', 'Payoff fee', money: true),
            text('waiver', 'Waiver of recognized unpaid charges', money: true),
            text(
              'avoided',
              'Avoided future charges · evidence only',
              money: true,
            ),
            reason(),
            account(label: 'Pay from'),
            date(),
            evidence(),
            const FinanceNotice(
              'A stale quote, unknown allocation or unsupported residual adjustment blocks closure. Future avoided charges are not refunds.',
            ),
          ],
        ];
      case FinancialAction.cardPayment:
        return [
          amount('Actual payment'),
          account(label: 'Pay from'),
          date(),
          text(
            'allocation',
            'Provider-confirmed statement coverage',
            money: true,
          ),
          evidence(),
          const FinanceNotice(
            'Leave coverage at zero when unknown. An overpayment becomes card credit, never liquid cash.',
          ),
        ];
      case FinancialAction.cardFee || FinancialAction.cardInterest:
        return [amount('Recognized charge'), date(), evidence()];
      case FinancialAction.statement:
        return [
          amount('Provider statement balance'),
          text('due', 'Payment due · YYYY-MM-DD'),
          evidence(),
          reason(),
          const FinanceNotice(
            'Recording/revising a statement adds evidence, not a purchase. Unmatched differences stay unresolved until an explicit source action explains them.',
          ),
        ];
      case FinancialAction.installment:
        return [
          amount('Expected amount per installment'),
          text('count', 'Number of installments'),
          text('due', 'First due · YYYY-MM-DD'),
          evidence(),
          reason(),
          const FinanceNotice(
            'Representative plan revision/application. Purchase spending is already recognized; expected installments create no additional liability or expense.',
          ),
        ];
      case FinancialAction.group:
        return [
          text('name', 'Group name'),
          const FinanceNotice(
            'This creates a fictional in-memory group. Online group creation will require a connected identity in production.',
          ),
        ];
      case FinancialAction.member:
        return [
          text('name', 'Participant name'),
          select(
            'memberKind',
            'Identity',
            choices([
              'Manual · no login',
              'Registered · member',
              'Deleted · historical identity',
            ]),
          ),
          const FinanceNotice(
            'Manual and deleted participants cannot authenticate receipt. Owner-entered confirmation stays visibly unverified.',
          ),
        ];
      case FinancialAction.invitation:
        return [
          text('name', 'Invited participant / manual claim'),
          evidence(),
          select(
            'claim',
            'Invitation scenario',
            choices([
              'Accept invitation',
              'Decline invitation',
              'Expired invitation',
            ]),
          ),
          const FinanceNotice(
            'Review consent to existing group history. A claimed manual identity does not upgrade old manual confirmations. This sends no invitations.',
          ),
        ];
      case FinancialAction.sharedBill ||
          FinancialAction.sharedCorrection ||
          FinancialAction.sharedRefund:
        return [
          text('name', 'Shared description'),
          amount(
            action == FinancialAction.sharedRefund
                ? 'Refund total'
                : 'Bill total',
          ),
          date(),
          if (action != FinancialAction.sharedBill) reason(),
          section(
            action == FinancialAction.sharedRefund
                ? '01 · Who received the refund?'
                : '01 · Who paid?',
            [for (final m in c.members.keys) text('paid:$m', m, money: true)],
          ),
          section(
            action == FinancialAction.sharedRefund
                ? '02 · Whose share is credited?'
                : '02 · Who took part?',
            [
              if (action != FinancialAction.sharedRefund)
                select('mode', 'Split method', choices(['Equal', 'Exact'])),
              for (final m in c.members.keys) ...[
                toggle('include:$m', m),
                if (values['include:$m'] == 'true' && values['mode'] == 'Exact')
                  text('share:$m', '$m · exact share', money: true),
              ],
              if (values['mode'] == 'Equal')
                const FinanceNotice(
                  'Centavo remainder goes to canonical participant order: Amihan, Nico, Tala. Display sorting never changes shares.',
                ),
            ],
          ),
          if (action == FinancialAction.sharedBill)
            section('03 · Your private record', [
              toggle('private', 'Also record my own financial effect'),
              if (values['private'] == 'true') ...[
                select(
                  'funding',
                  'My funding source',
                  choices(['New cash', 'New card']),
                ),
                if (values['funding'] != 'New card') account(),
              ],
              const FinanceNotice(
                'Only your funding, consumed share and receivable/payable are private financial effects. Other participants do not receive private postings.',
              ),
            ]),
        ];
      case FinancialAction.settlement:
        return [
          select('sender', 'Sender', choices(c.members.keys.toList())),
          select('recipient', 'Recipient', choices(c.members.keys.toList())),
          amount('Reported payment'),
          date(),
          section('Allocate to selected bills', [
            for (final b in c.groupBills)
              text(
                'allocate:${b.id}',
                b.title,
                money: true,
                helper:
                    'Remaining pairwise source cap ${c.amount(c.billObligation(b, values['sender']!, values['recipient']!))}',
              ),
            const FinanceNotice(
              'Use zero to exclude a bill. Partial and multi-bill allocations are supported. Any remainder is a separately acknowledged advance.',
            ),
          ]),
        ];
      case FinancialAction.confirmation:
        return [
          select('source', 'Reported payment', {
            for (final s in c.groupSettlements)
              s.id:
                  '${s.sender} → ${s.recipient} · ${c.amount(s.amount)} · ${s.status.name}',
          }),
          select(
            'decision',
            'Receipt decision',
            choices([
              'Confirm receipt',
              'Dispute',
              'Cancel report',
              'Reverse confirmation',
            ]),
          ),
          date(),
          reason(),
          const FinanceNotice(
            'Only recipient confirmation affects confirmed positions. Reversal restores group coverage, but never assumes a cash return.',
          ),
        ];
      case FinancialAction.adoption:
        return [
          select('source', 'Shared bill', {
            for (final b in c.groupBills) b.id: b.title,
          }),
          select(
            'funding',
            'Private funding',
            choices([
              'New cash',
              'New card',
              'Existing purchase',
              'Unpaid share',
            ]),
          ),
          if (values['funding'] == 'New cash') account(),
          if (values['funding'] == 'Existing purchase')
            select('existing', 'Your original purchase', {
              for (final r in c.records.where(
                (r) => ['expense', 'cardPurchase'].contains(r.kind),
              ))
                r.id: '${r.title} · ${c.amount(r.amount)}',
            }),
          date(),
          const FinanceNotice(
            'Existing-purchase conversion preserves actual cash/card funding exactly once. An unpaid share creates an expense/payable without cash.',
          ),
        ];
      case FinancialAction.privateReview:
        return [
          select('source', 'Changed group source', {
            for (final b in c.groupBills) b.id: b.title,
          }),
          select(
            'decision',
            'Your private decision',
            choices([
              'Keep actual funding, update share',
              'Correct actual funding',
              'Retain private evidence',
            ]),
          ),
          date(),
          reason(),
          const FinanceNotice(
            'A group owner cannot approve your private difference. Retaining evidence is an attributed review, not a claim that private records match the group.',
          ),
        ];
    }
  }

  Future<void> back() async {
    if (!dirty || result == DemoOutcome.accepted) {
      setState(() => allowPop = true);
      if (mounted) Navigator.pop(context);
      return;
    }
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave this demo draft?'),
        content: const Text(
          'Editing and review preserve your entries. Leaving this workflow discards the unsubmitted draft.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard draft'),
          ),
        ],
      ),
    );
    if (discard == true && mounted) {
      setState(() => allowPop = true);
      Navigator.pop(context);
    }
  }

  void review() {
    FocusScope.of(context).unfocus();
    for (final field in fields.entries) {
      values[field.key] = field.value.text;
    }
    setState(() {
      preview = c.preview(action, values, command);
      reviewing = preview!.valid;
      dirty = true;
    });
  }

  Future<void> simulate() async {
    setState(() => busy = true);
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (!mounted) return;
    setState(() {
      result = c.execute(preview!, outcome);
      busy = false;
    });
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: allowPop || !dirty || result == DemoOutcome.accepted,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop && !busy) back();
    },
    child: FinancePage(
      title: action.label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'FINANCIAL WORKFLOW / ${result != null
                ? 'RESULT'
                : reviewing
                ? '02 REVIEW'
                : '01 DETAILS'}',
            action.label,
            action.caption,
          ),
          FinanceColumns(
            main: EditorialSurface(
              child: AnimatedSize(
                duration: MediaQuery.disableAnimationsOf(context)
                    ? Duration.zero
                    : const Duration(milliseconds: 180),
                alignment: Alignment.topCenter,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (result == null && !reviewing) ...[
                      ...entryFields,
                      toggle('acknowledge', switch (action) {
                        FinancialAction.payoff =>
                          'I confirm the provider quote and liability closure',
                        FinancialAction.invitation => 'I consent to the history policy and manual-evidence limits',
                        FinancialAction.confirmation =>
                          'I acknowledge manual receipt is unverified',
                        FinancialAction.settlement =>
                          'I acknowledge any unallocated advance',
                        FinancialAction.reconcile =>
                          'I acknowledge this explicit balance adjustment',
                        FinancialAction.privateReview =>
                          'I authorize correction of my actual funding',
                        _ => 'I acknowledge a negative account balance if this action creates one',
                      }),
                      if (preview != null && preview!.errors.isNotEmpty)
                        Semantics(
                          liveRegion: true,
                          child: FinanceNotice(
                            preview!.errors.join('\n\n'),
                            warning: true,
                          ),
                        ),
                      FilledButton.icon(
                        key: const ValueKey('review-action'),
                        onPressed: review,
                        icon: const Icon(Icons.arrow_forward),
                        label: const Text('Review effects'),
                      ),
                    ],
                    if (result == null && reviewing) ...[
                      const SectionHeading('Your review'),
                      Text(
                        '${values['date']} · ${action.label}',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 16),
                      for (final effect in preview!.effects)
                        FinancialLine(
                          effect,
                          'Synthetic preview',
                          icon: Icons.check,
                          color: Palette.mint,
                        ),
                      const SizedBox(height: 20),
                      selectOutcome(),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          OutlinedButton(
                            onPressed: busy
                                ? null
                                : () => setState(() => reviewing = false),
                            child: const Text('Edit details'),
                          ),
                          FilledButton.icon(
                            key: const ValueKey('simulate-action'),
                            onPressed: busy ? null : simulate,
                            icon: busy
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.check),
                            label: Text(
                              busy ? 'Simulating…' : 'Simulate action',
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (result != null) ...resultWidgets(),
                  ],
                ),
              ),
            ),
            aside: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ValueBlock(
                  'IN THIS WORKFLOW',
                  reviewing || result != null
                      ? 'Review before action.'
                      : 'Every detail has a place.',
                  'Your draft stays intact between entry and review.',
                  color:
                      action.name.startsWith('shared') ||
                          action == FinancialAction.settlement
                      ? Palette.peach
                      : Palette.lilac,
                ),
                const SizedBox(height: 20),
                const SectionHeading('What stays clear'),
                const FinancialLine(
                  'Your private money',
                  'Account balances and private records belong only to you.',
                  icon: Icons.lock_outline,
                ),
                const FinancialLine(
                  'The full story',
                  'Originals, revisions and simulated command receipts remain inspectable.',
                  icon: Icons.history,
                ),
                const FinanceNotice(
                  'Demo only. Changes live in this session and reset when the application closes. No real records are saved or synchronized.',
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  Widget selectOutcome() => DropdownButtonFormField<DemoOutcome>(
    initialValue: outcome,
    decoration: const InputDecoration(labelText: 'Demo result scenario'),
    isExpanded: true,
    items: [
      for (final o in DemoOutcome.values)
        DropdownMenuItem(
          value: o,
          child: Text(switch (o) {
            DemoOutcome.accepted => 'Accepted',
            DemoOutcome.pending => 'Pending acceptance',
            DemoOutcome.stale => 'Stale / conflict',
            DemoOutcome.unavailable => 'Service unavailable',
            DemoOutcome.unknown => 'Uncertain result / response lost',
          }),
        ),
    ],
    onChanged: busy ? null : (o) => setState(() => outcome = o!),
  );

  List<Widget> resultWidgets() => [
    Icon(
      result == DemoOutcome.accepted
          ? Icons.check_circle_outline
          : Icons.info_outline,
      size: 52,
      color: CraftTheme.of(context).primary,
    ),
    const SizedBox(height: 20),
    Text(switch (result!) {
      DemoOutcome.accepted => 'Demo action complete',
      DemoOutcome.pending => 'Awaiting simulated acceptance',
      DemoOutcome.stale => 'Review the current source',
      DemoOutcome.unavailable => 'Temporarily unavailable',
      DemoOutcome.unknown => 'The result is uncertain',
    }, style: Theme.of(context).textTheme.headlineMedium),
    const SizedBox(height: 12),
    Text(switch (result!) {
      DemoOutcome.accepted =>
        'Updated in this session only. Your original evidence is retained.',
      DemoOutcome.pending => 'Accepted balances have not changed. Check this same command to resolve its status.',
      DemoOutcome.stale => 'No new action was applied by this attempt. Your input is retained; compare the current preview before trying again.',
      DemoOutcome.unavailable =>
        'Nothing was applied. Your draft is ready to retry.',
      DemoOutcome.unknown => 'Do not submit another payment. Check the original command; it may already have been accepted.',
    }),
    const SizedBox(height: 16),
    SelectableText('Demo receipt: $command'),
    const SizedBox(height: 12),
    for (final e in preview!.effects)
      Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(e)),
    const SizedBox(height: 20),
    Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        if (result == DemoOutcome.pending || result == DemoOutcome.unknown)
          FilledButton(
            onPressed: () => setState(() => result = c.checkResult(command)),
            child: const Text('Check original result'),
          ),
        if (result == DemoOutcome.stale || result == DemoOutcome.unavailable)
          FilledButton(
            onPressed: () => setState(() {
              result = null;
              reviewing = false;
              command = c.nextCommand();
              preview = c.preview(action, values, command);
            }),
            child: const Text('Return to retained draft'),
          ),
        OutlinedButton(
          onPressed: () {
            setState(() => allowPop = true);
            Navigator.pop(context);
          },
          child: Text(result == DemoOutcome.accepted ? 'Done' : 'Close result'),
        ),
      ],
    ),
  ];
}
