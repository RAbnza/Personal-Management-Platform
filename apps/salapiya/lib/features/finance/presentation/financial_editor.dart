import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../application/financial_controller.dart';
import '../contracts/financial_models.dart';
import 'financial_widgets.dart';
import '../../../local/local_finance_controller.dart';
import '../../../local/finance_domain.dart';
import '../../../shared/shared_screen.dart';

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
  String get actionLabel =>
      c.production &&
          action == FinancialAction.reconcile &&
          ['adjustment', 'manual'].contains(values['mode'])
      ? 'Adjust account balance'
      : action.label;
  late final String operation =
      '${action.name}:${widget.sourceId ?? ''}${c.production && action == FinancialAction.reconcile ? ':${values['mode'] ?? 'compare'}' : ''}';
  bool restoring = false, restored = false, draftUnavailable = false;
  String? draftError;
  int draftRevision = 0, savedDraftRevision = 0;
  Future<void> draftWork = Future.value();
  @override
  void initState() {
    super.initState();
    if (c.production) {
      restoring = true;
      unawaited(loadDraft());
    }
  }

  Future<void> loadDraft() async {
    try {
      final draft = await c.restoreDraft(operation);
      if (!mounted) return;
      draftUnavailable = false;
      if (draft != null) {
        values.addAll(Map<String, String>.from(draft['values'] as Map));
        command = draft['command'] as String;
        dirty = true;
        restored = true;
      }
    } catch (_) {
      draftUnavailable = true;
      if (mounted) draftError = 'The saved draft could not be read. Reopen this profile before editing.';
    } finally {
      if (mounted) setState(() => restoring = false);
    }
  }

  void retain() {
    if (!c.production) return;
    final revision = ++draftRevision;
    final frozen = Map<String, String>.from(values), id = command;
    draftWork = draftWork
        .then((_) => c.retainDraft(operation, id, frozen))
        .then((_) {
          if (mounted) {
            setState(() {
              draftError = null;
              savedDraftRevision = revision;
            });
          }
        })
        .catchError((Object _) {
          if (mounted) {
            setState(
              () => draftError = 'Draft could not be saved. Keep this screen open and check available storage.',
            );
          }
        });
  }

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
              ? const TextInputType.numberWithOptions(
                  decimal: true,
                  signed: true,
                )
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
            retain();
          }),
        ),
      );
  Widget select(String key, String label, Map<String, String> choices) =>
      Padding(
        key: ValueKey('select-$key'),
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
            retain();
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
      retain();
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
    if (c.production &&
        [FinancialAction.correction, FinancialAction.reversal].contains(action))
      for (final a in c.accounts.where(
        (a) => a.archived && a.id == values[key],
      ))
        a.id: '${a.name} · archived historical account',
    if (card && !c.production) 'card': 'Everyday credit · liability',
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
    if (c.production) return productionFields;
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

  List<Widget> get productionFields {
    final local = c as LocalFinancialController;
    final source = local.snapshot.revisions
        .where((r) => r.id == values['source'])
        .firstOrNull;
    final kind = action == FinancialAction.correction
        ? source?.kind
        : action.name;
    Widget categories(String key, String label, String classification) =>
        select(key, label, local.categoryChoices(classification));
    final purchase = source?.kind == 'refund' && source?.source != null
        ? local.snapshot.revision(source!.source!)
        : source;
    Widget refundPortions([
      String key = 'refundPosting',
    ]) => select(key, 'Original purchase / fee portion', {
      for (final e
          in (purchase?.postings ?? <LocalPosting>[]).asMap().entries.where(
            (e) => e.value.ledger == 'expense',
          ))
        '${purchase!.id}-p${e.key + 1}':
            '${local.categoryName(e.value.category)} · ${c.amount(e.value.amount)} · ${e.value.date}',
    });
    final refundCount = int.tryParse(values['refundCount'] ?? '') ?? 2;
    List<Widget> refundAllocationFields() => [
      refundPortions(),
      if ((purchase?.postings.where((p) => p.ledger == 'expense').length ?? 0) >
          1) ...[
        toggle('refundMultiple', 'Allocate refund across original portions'),
        if (values['refundMultiple'] == 'true') ...[
          text('refundFirstAmount', 'First portion refund', money: true),
          for (var i = 1; i < refundCount; i++) ...[
            refundPortions('refund${i}Posting'),
            text('refund${i}Amount', 'Portion ${i + 1} refund', money: true),
          ],
          Wrap(
            spacing: 8,
            children: [
              TextButton.icon(
                onPressed: refundCount < 100
                    ? () => setState(() {
                        values['refundCount'] = '${refundCount + 1}';
                        dirty = true;
                        retain();
                      })
                    : null,
                icon: const Icon(Icons.add),
                label: const Text('Add refund portion'),
              ),
              if (refundCount > 2)
                TextButton(
                  onPressed: () => setState(() {
                    values['refundCount'] = '${refundCount - 1}';
                    dirty = true;
                    retain();
                  }),
                  child: const Text('Remove last portion'),
                ),
            ],
          ),
        ],
      ],
    ];
    final splitCount = int.tryParse(values['splitCount'] ?? '') ?? 2;
    final feeCount = int.tryParse(values['feeCount'] ?? '') ?? 1;
    void addFee() => setState(() {
      values.addAll({
        'feeCount': '${feeCount + 1}',
        'extraFee${feeCount}Amount': '',
        'extraFee${feeCount}Treatment': 'source_additional',
        'extraFee${feeCount}Category': 'category-fees',
        'extraFee${feeCount}Account': values['account'] ?? '',
        'extraFee${feeCount}Date': '',
        'extraFee${feeCount}Label': '',
      });
      dirty = true;
      retain();
    });
    void splitNumber(int delta) => setState(() {
      values['splitCount'] = '${splitCount + delta}';
      dirty = true;
      retain();
    });
    final details = [
      text('reference', 'Reference (optional)'),
      text('notes', 'Notes (optional)'),
    ];
    if (action == FinancialAction.reversal) {
      return [
        date(),
        reason(),
        const FinanceNotice(
          'The current financial effect is voided at its original dates. Every revision remains visible.',
        ),
      ];
    }
    if (action == FinancialAction.refund) {
      return [
        amount('Refund amount'),
        account(label: 'Receiving account'),
        date(),
        ...refundAllocationFields(),
        reason(),
        ...details,
        const FinanceNotice(
          'Allocate only the amount returned for the selected original category. Prior refunds reduce its available amount. A refund reduces spending; it is not income.',
        ),
      ];
    }
    if (action == FinancialAction.reconcile) {
      if (values['mode'] == 'manual') {
        return [
          account(),
          amount('Signed balance adjustment'),
          date(),
          reason(),
          ...details,
          const FinanceNotice(
            'Post a signed adjustment against equity. It is not income or spending. Use reconciliation first when comparing a statement or cash count.',
          ),
        ];
      }
      return values['mode'] == 'adjustment'
          ? [
              account(),
              date(),
              reason(),
              const FinanceNotice(
                'Post the reviewed comparison difference as an explicit equity adjustment. It is not income or spending. Changed sources require a new comparison.',
              ),
            ]
          : [
              account(),
              amount('Observed balance (signed)'),
              date(),
              text('reference', 'Statement / evidence reference (optional)'),
              text('notes', 'Notes (optional)'),
              const FinanceNotice(
                'Save a comparison without changing money. Inspect it in account history, then explicitly review an adjustment if needed.',
              ),
            ];
    }
    switch (kind) {
      case 'account':
        return [
          text('name', 'Account name'),
          select(
            'kind',
            'Account type',
            choices(['Cash', 'Bank', 'Mobile wallet', 'Checking', 'Savings']),
          ),
          amount('Opening balance'),
          text('cutoff', 'Opening cutoff · YYYY-MM-DD'),
          text('institution', 'Institution (optional)'),
          text('notes', 'Notes (optional)'),
          const FinanceNotice(
            'This balance is your baseline at the end of the cutoff date, not income. Record new activity strictly after that date.',
          ),
        ];
      case 'category':
        return [
          text('name', 'Category name'),
          select('classification', 'Classification', {
            'expense': 'Expense',
            'income': 'Income',
          }),
        ];
      case 'archive':
        return [
          account(),
          reason(),
          const FinanceNotice(
            'History and balance are retained. Archiving disables new entries for this account.',
          ),
        ];
      case 'expense':
      case 'income':
        return [
          text('name', 'Description'),
          amount(),
          account(),
          date(),
          categories('category', 'Category', kind!),
          if (kind == 'income') ...[
            select('incomeClass', 'Income classification', {
              'earned': 'Earned',
              'gift': 'Gift',
              'reward': 'Reward',
              'other': 'Other',
            }),
            text('sender', 'Received from (optional)'),
            text('sourceLabel', 'Income source (optional)'),
          ],
          if (kind == 'expense') ...[
            text('merchant', 'Merchant (optional)'),
            toggle('split', 'Split across categories'),
            if (values['split'] == 'true') ...[
              text('splitAmount', 'First category amount', money: true),
              for (var i = 2; i < splitCount; i++) ...[
                text('split${i}Amount', 'Split ${i + 1} amount', money: true),
                categories(
                  'split${i}Category',
                  'Split ${i + 1} category',
                  'expense',
                ),
              ],
              categories('splitCategory', 'Remainder category', 'expense'),
              Wrap(
                spacing: 8,
                children: [
                  TextButton.icon(
                    onPressed: splitCount < 100 ? () => splitNumber(1) : null,
                    icon: const Icon(Icons.add),
                    label: const Text('Add category split'),
                  ),
                  if (splitCount > 2)
                    TextButton(
                      onPressed: () => splitNumber(-1),
                      child: const Text('Remove last split'),
                    ),
                ],
              ),
            ],
          ],
          ...details,
          if (action == FinancialAction.correction) reason(),
        ];
      case 'transfer':
        return [
          text('name', 'Description (optional)'),
          amount('Amount arriving at destination'),
          account(label: 'From account'),
          account(key: 'destination', label: 'To account'),
          date(),
          text('fee', 'Transfer fee', money: true),
          select('feeTreatment', 'Fee payment', {
            'source_additional': 'Paid additionally by source',
            'withheld': 'Withheld from amount sent',
            'separate': 'Paid by another account',
          }),
          if (values['feeTreatment'] == 'separate')
            account(key: 'feeAccount', label: 'Fee-bearing account'),
          categories('feeCategory', 'Fee category', 'expense'),
          text('feeDate', 'Fee date · YYYY-MM-DD (blank uses transfer date)'),
          for (var i = 1; i < feeCount; i++) ...[
            SectionHeading('Additional fee ${i + 1}'),
            text('extraFee${i}Label', 'Fee label (optional)'),
            text('extraFee${i}Amount', 'Fee amount', money: true),
            select('extraFee${i}Treatment', 'Fee payment', {
              'source_additional': 'Paid additionally by source',
              'withheld': 'Withheld from amount sent',
              'separate': 'Paid by another account',
            }),
            if (values['extraFee${i}Treatment'] == 'separate')
              account(key: 'extraFee${i}Account', label: 'Fee-bearing account'),
            categories('extraFee${i}Category', 'Fee category', 'expense'),
            text('extraFee${i}Date', 'Fee date (blank uses transfer date)'),
          ],
          Wrap(
            spacing: 8,
            children: [
              TextButton.icon(
                onPressed: feeCount < 20 ? addFee : null,
                icon: const Icon(Icons.add),
                label: const Text('Add transfer fee'),
              ),
              if (feeCount > 1)
                TextButton(
                  onPressed: () => setState(() {
                    values['feeCount'] = '${feeCount - 1}';
                    dirty = true;
                    retain();
                  }),
                  child: const Text('Remove last fee'),
                ),
            ],
          ),
          ...details,
          if (action == FinancialAction.correction) reason(),
          const FinanceNotice(
            'Both principal sides commit together. Fees are recognized once; principal is neither income nor spending.',
          ),
        ];
      case 'refund':
        return [
          amount('Corrected refund'),
          account(label: 'Receiving account'),
          date(),
          ...refundAllocationFields(),
          reason(),
          ...details,
        ];
      case 'opening':
        return [
          amount('Corrected opening balance'),
          date(),
          reason(),
          const FinanceNotice(
            'The original account and coverage cutoff stay fixed. This corrects the baseline and preserves the full original evidence.',
          ),
        ];
      case 'adjustment':
        return [
          account(),
          if (source?.source == null) amount('Signed balance adjustment'),
          date(),
          reason(),
          ...details,
          const FinanceNotice(
            'Adjustment corrections preserve equity classification and the original comparison link, when present.',
          ),
        ];
      default:
        return [
          const FinanceNotice('Use the source workflow to review this action.'),
        ];
    }
  }

  Future<void> back() async {
    if (busy || restoring) return;
    if (c.production && dirty && result != DemoOutcome.accepted) {
      final choice = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Leave this draft?'),
          content: const Text(
            'Keep your entries encrypted on this device, or discard this unposted draft.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Keep editing'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, 'discard'),
              child: const Text('Discard draft'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, 'keep'),
              child: const Text('Save draft & leave'),
            ),
          ],
        ),
      );
      if (choice == null) return;
      await draftWork;
      if (choice == 'discard') {
        await c.discardDraft(operation);
      }
      if (draftError != null && choice == 'keep') return;
      if (mounted) {
        setState(() => allowPop = true);
        Navigator.pop(context);
      }
      return;
    }
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
    retain();
  }

  Future<void> simulate() async {
    setState(() => busy = true);
    await draftWork;
    if (c.production && draftError != null) {
      if (mounted) setState(() => busy = false);
      return;
    }
    if (!c.production) {
      await Future<void>.delayed(const Duration(milliseconds: 350));
    }
    final committed = await c.commitPreview(preview!, outcome);
    if (!mounted) return;
    setState(() {
      result = committed;
      busy = false;
    });
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop:
        !busy &&
        !restoring &&
        (allowPop || !dirty || result == DemoOutcome.accepted),
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop && !busy) back();
    },
    child: FinancePage(
      title: actionLabel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceHeading(
            'FINANCIAL WORKFLOW / ${result != null
                ? 'RESULT'
                : reviewing
                ? '02 REVIEW'
                : '01 DETAILS'}',
            actionLabel,
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
                    if (restoring)
                      const Center(child: CircularProgressIndicator()),
                    if (restored && result == null)
                      const FinanceNotice(
                        'Restored encrypted draft. Review current financial effects before saving.',
                      ),
                    if (draftError != null)
                      FinanceNotice(draftError!, warning: true),
                    if (c.production &&
                        dirty &&
                        result == null &&
                        draftError == null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(
                            savedDraftRevision == draftRevision
                                ? 'Draft saved on this device · not posted'
                                : 'Saving draft…',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                      ),
                    if (draftUnavailable)
                      TextButton(
                        onPressed: loadDraft,
                        child: const Text('Retry reading saved draft'),
                      ),
                    if (result == null &&
                        !reviewing &&
                        !restoring &&
                        !draftUnavailable) ...[
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
                        '${values['date']} · $actionLabel',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 16),
                      for (final effect in preview!.effects)
                        FinancialLine(
                          effect,
                          c.production
                              ? 'Reviewed local effect'
                              : 'Synthetic preview',
                          icon: Icons.check,
                          color: Palette.mint,
                        ),
                      const SizedBox(height: 20),
                      if (!c.production) selectOutcome(),
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
                              c.production
                                  ? (busy ? 'Saving…' : 'Confirm & save')
                                  : (busy ? 'Simulating…' : 'Simulate action'),
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
                FinancialLine(
                  'The full story',
                  c.production
                      ? 'Originals, revisions and durable command receipts remain inspectable.'
                      : 'Originals, revisions and simulated command receipts remain inspectable.',
                  icon: Icons.history,
                ),
                FinanceNotice(
                  c.production
                      ? (c is LocalFinancialController &&
                                (c as LocalFinancialController).connected
                            ? 'A successful save is encrypted on this device. Waiting work is included once in your view and becomes synced after server acceptance and download. Drafts stay on this device.'
                            : 'Local only. A successful save is committed to encrypted storage on this device. Drafts are protected and are not posted money.')
                      : 'Demo only. Changes live in this session and reset when the application closes. No real records are saved or synchronized.',
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
      DemoOutcome.accepted =>
        c.production ? 'Saved on this device' : 'Demo action complete',
      DemoOutcome.pending => 'Awaiting simulated acceptance',
      DemoOutcome.stale => 'Review the current source',
      DemoOutcome.unavailable => 'Temporarily unavailable',
      DemoOutcome.unknown => 'The result is uncertain',
    }, style: Theme.of(context).textTheme.headlineMedium),
    const SizedBox(height: 12),
    Text(switch (result!) {
      DemoOutcome.accepted =>
        c.production
            ? 'Committed to encrypted storage. Your original evidence is retained.'
            : 'Updated in this session only. Your original evidence is retained.',
      DemoOutcome.pending => 'Accepted balances have not changed. Check this same command to resolve its status.',
      DemoOutcome.stale => 'No new action was applied by this attempt. Your input is retained; compare the current preview before trying again.',
      DemoOutcome.unavailable =>
        'Nothing was applied. Your draft is ready to retry.',
      DemoOutcome.unknown => 'Do not submit another payment. Check the original command; it may already have been accepted.',
    }),
    const SizedBox(height: 16),
    if (c is LocalFinancialController &&
        (c as LocalFinancialController).lastError != null)
      FinanceNotice((c as LocalFinancialController).lastError!, warning: true),
    SelectableText(
      '${c.production ? 'Local command' : 'Demo receipt'}: $command',
    ),
    const SizedBox(height: 12),
    for (final e in preview!.effects)
      Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(e)),
    const SizedBox(height: 20),
    Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        if (c is LocalFinancialController &&
            action == FinancialAction.expense &&
            result == DemoOutcome.accepted)
          FilledButton(
            onPressed: () async {
              try {
                await sharePrivatePurchase(
                  context,
                  c as LocalFinancialController,
                  command,
                );
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        e is LocalRuleException ? e.message : 'Group sharing could not complete. Your private purchase remains saved.',
                      ),
                    ),
                  );
                }
              }
            },
            child: const Text('Share this purchase'),
          ),
        if (result == DemoOutcome.pending || result == DemoOutcome.unknown)
          FilledButton(
            onPressed: () async {
              final resolved = c is LocalFinancialController
                  ? await (c as LocalFinancialController).resolveReceipt(
                      command,
                    )
                  : c.checkResult(command);
              if (mounted) setState(() => result = resolved);
            },
            child: const Text('Check original result'),
          ),
        if (result == DemoOutcome.stale || result == DemoOutcome.unavailable)
          FilledButton(
            onPressed: () => setState(() {
              result = null;
              reviewing = false;
              if (!c.production) command = c.nextCommand();
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
