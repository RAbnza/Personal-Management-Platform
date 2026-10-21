import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../design_system/components.dart';
import '../design_system/craft.dart';
import 'navigation_study.dart';
import '../design_system/theme.dart';
import '../prototype/fixtures.dart';
import 'review_editor.dart';
import 'settings.dart';

class GallerySpecimens extends StatefulWidget {
  const GallerySpecimens({
    super.key,
    required this.section,
    required this.compact,
  });
  final GallerySection section;
  final bool compact;
  @override
  State<GallerySpecimens> createState() => _GallerySpecimensState();
}

class _GallerySpecimensState extends State<GallerySpecimens> {
  final amount = TextEditingController(text: '185.50');
  final form = GlobalKey<FormState>();
  bool checked = true, busy = false, svg = false;
  String account = 'Cash wallet', radio = 'Private', result = '';
  DateTime date = DateTime(2026, 10, 21);
  DemoCoverage coverage = DemoCoverage.complete;
  DemoSync sync = DemoSync.localOnly;
  DemoReceipt receipt = DemoReceipt.awaiting;
  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  void announce(String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
  Widget stack(List<Widget> children) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (var i = 0; i < children.length; i++) ...[
        if (i > 0) const SizedBox(height: 24),
        children[i],
      ],
    ],
  );
  Widget panel(String title, String caption, Widget content) => CraftPanel(
    padding: widget.compact ? 16 : 24,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(title, caption: caption),
        content,
      ],
    ),
  );
  @override
  Widget build(BuildContext context) => switch (widget.section) {
    GallerySection.foundations => foundations(),
    GallerySection.typography => typography(),
    GallerySection.actions => actions(),
    GallerySection.finance => finance(),
    GallerySection.navigation => NavigationStudy(compact: widget.compact),
    GallerySection.overlays => overlays(),
    GallerySection.feedback => feedback(),
    GallerySection.branding => branding(),
  };

  Widget foundations() {
    final c = CraftTheme.of(context);
    return stack([
      CraftPanel(
        focal: true,
        child: LayoutBuilder(
          builder: (context, box) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (box.maxWidth <= 500 && CraftPreferences.effectsOf(context))
                const Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: CraftMotif(size: 56),
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Made with care.\nClear by design.',
                          style: Theme.of(context).textTheme.displaySmall,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'A calm place for everyday decisions, shaped by the warmth and rhythm of Filipino craft.',
                        ),
                      ],
                    ),
                  ),
                  if (box.maxWidth > 500)
                    const Padding(
                      padding: EdgeInsets.only(left: 32),
                      child: CraftMotif(size: 144),
                    ),
                ],
              ),
              const SizedBox(height: 24),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(label: Text(c.dark ? 'Midnight Spectrum' : 'Porcelain')),
                  const Chip(label: Text('Nunito Sans')),
                  const Chip(label: Text('Woven Calm')),
                ],
              ),
            ],
          ),
        ),
      ),
      AdaptivePair(
        children: [
          panel(
            'A considered palette',
            'Semantic roles keep money and meaning legible.',
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final swatch in <(String, Color, Color)>[
                  ('Violet', c.primary, c.onPrimary),
                  ('Warm craft', c.warmSurface, c.warm),
                  ('Plum', c.plumSurface, c.plum),
                  ('Blue', c.blueSurface, c.blue),
                ])
                  Container(
                    width: 120,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: swatch.$2,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      swatch.$1,
                      style: TextStyle(
                        color: swatch.$3,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          panel(
            'Surfaces with purpose',
            'Opaque reading surfaces. Expressive framing stays at the edge.',
            stack([
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: c.subtle,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('Inset · quiet context'),
              ),
              const CraftPanel(
                padding: 16,
                child: Text('Base · content and controls'),
              ),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: c.raised,
                  boxShadow: CraftPreferences.effectsOf(context)
                      ? c.shadow
                      : null,
                  border: Border.all(color: c.divider),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text('Raised · focused attention'),
              ),
            ]),
          ),
        ],
      ),
      panel(
        'Rhythm & geometry',
        '4 / 8 / 12 / 16 / 24 / 32 spacing · 12 control / 20 card / 24 dialog corners',
        Wrap(
          spacing: 16,
          runSpacing: 16,
          crossAxisAlignment: WrapCrossAlignment.end,
          children: [
            for (final n in [4, 8, 12, 16, 24, 32])
              Column(
                children: [
                  Container(
                    width: n.toDouble(),
                    height: n.toDouble(),
                    decoration: BoxDecoration(
                      color: c.primary,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('$n'),
                ],
              ),
            const CraftMotif(size: 80),
          ],
        ),
      ),
      const StatusNotice(
        'Craft effects can be switched off. Financial values, labels and statuses remain unchanged.',
        tone: NoticeTone.information,
      ),
    ]);
  }

  Widget typography() => stack([
    const StatusNotice(
      'Nunito Sans is the approved baseline. Geist and Source Sans 3 are comparison specimens only. All fonts are bundled offline.',
      tone: NoticeTone.information,
    ),
    for (final family in ['Nunito Sans', 'Geist', 'Source Sans 3'])
      CraftPanel(
        child: DefaultTextStyle.merge(
          style: TextStyle(
            fontFamily: family,
            fontSize: 16,
            height: 1.5,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                family,
                style: TextStyle(
                  fontFamily: family,
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Your everyday, thoughtfully connected.',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              const Text(
                'Overview · Money · Debts · Shared · Life',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              const Text(
                'A little clarity goes a long way. Review the source and coverage before making a decision.',
              ),
              const SizedBox(height: 12),
              const Text('Everyday bank — family savings and rainy-day fund'),
              const Text(
                'Amount in Philippine pesos',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              Text(
                'Enter an amount greater than zero.',
                style: TextStyle(
                  color: CraftTheme.of(context).tone(NoticeTone.error).$1,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                '₱29,300.75     −₱185.50',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
              ),
              const Text('21 Oct 2026 · Miyerkules'),
              const Text(
                'Áá Éé Íí Óó Úú Ññ · Kumusta, kaibigan?\nPag-iimpok para sa pamilya. Bayanihan.',
              ),
              const SizedBox(height: 16),
              const Align(
                alignment: Alignment.centerRight,
                child: Text(
                  '₱11,111.11\n₱88,888.88\n₱00,000.00',
                  textAlign: TextAlign.right,
                ),
              ),
            ],
          ),
        ),
      ),
  ]);

  Widget actions() => stack([
    panel(
      'Actions, with intention',
      'Tab through controls to inspect focus. Hover and press on Windows.',
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          FilledButton(
            onPressed: () => announce('Primary demo action activated.'),
            child: const Text('Primary action'),
          ),
          OutlinedButton(
            onPressed: () => announce('Secondary demo action activated.'),
            child: const Text('Secondary action'),
          ),
          TextButton(
            onPressed: () => announce('Text demo action activated.'),
            child: const Text('Text action'),
          ),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: CraftTheme.of(context).tone(NoticeTone.error).$1,
            ),
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Discard example?'),
                  content: const Text(
                    'Only the demonstration state will change.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Discard example'),
                    ),
                  ],
                ),
              );
              if (confirmed == true && mounted) {
                announce('Example discarded. No financial record was changed.');
              }
            },
            icon: const Icon(Icons.delete_outline),
            label: const Text('Destructive action'),
          ),
          IconButton(
            tooltip: 'Inspect source',
            onPressed: () => announce('Source: synthetic fixture F-EXPENSE.'),
            icon: const Icon(Icons.info_outline),
          ),
          const FilledButton(onPressed: null, child: Text('Disabled action')),
          BusyAction(
            busy: busy,
            label: 'Simulate processing',
            onPressed: () => setState(() => busy = true),
          ),
          if (busy)
            TextButton(
              onPressed: () => setState(() => busy = false),
              child: const Text('Reset busy state'),
            ),
        ],
      ),
    ),
    panel(
      'An approachable form',
      'Persistent labels, explicit help and exact decimal parsing.',
      Form(
        key: form,
        child: stack([
          TextFormField(
            key: const ValueKey('demo-amount'),
            controller: amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Amount in Philippine pesos',
              prefixText: '₱ ',
              helperText:
                  'Example: 185.50. No commas; at most two decimal places.',
            ),
            validator: DemoMoney.validate,
          ),
          DropdownButtonFormField<String>(
            initialValue: account,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Source account'),
            items: [
              for (final a in demoAccounts)
                DropdownMenuItem(value: a.$1, child: Text(a.$1)),
            ],
            onChanged: (v) => setState(() => account = v!),
          ),
          const TextFormFieldReadOnly(),
          const TextField(
            enabled: false,
            decoration: InputDecoration(
              labelText: 'Unavailable field',
              hintText: 'Disabled specimen',
            ),
          ),
          RadioGroup<String>(
            groupValue: radio,
            onChanged: (v) => setState(() => radio = v!),
            child: Column(
              children: [
                for (final v in ['Private', 'Shared specimen'])
                  RadioListTile<String>(
                    contentPadding: EdgeInsets.zero,
                    title: Text(v),
                    value: v,
                  ),
              ],
            ),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Include a note in this demo'),
            value: checked,
            onChanged: (v) => setState(() => checked = v!),
          ),
          OutlinedButton.icon(
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: DateTime(2026),
                lastDate: DateTime(2027),
              );
              if (picked != null && mounted) setState(() => date = picked);
            },
            icon: const Icon(Icons.calendar_today_outlined),
            label: Text('Date · ${date.day}/${date.month}/${date.year}'),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(
              onPressed: () {
                if (form.currentState!.validate()) {
                  setState(
                    () => result =
                        'Valid demo amount: ${DemoMoney.format(DemoMoney.parse(amount.text)!)}. Nothing saved.',
                  );
                } else {
                  setState(() => result = 'Please correct the amount above.');
                }
              },
              child: const Text('Validate example'),
            ),
          ),
          if (result.isNotEmpty)
            StatusNotice(
              result,
              live: true,
              tone: result.startsWith('Valid')
                  ? NoticeTone.success
                  : NoticeTone.error,
            ),
        ]),
      ),
    ),
  ]);

  Widget finance() {
    final unavailable = [
      DemoCoverage.empty,
      DemoCoverage.loading,
      DemoCoverage.error,
    ].contains(coverage);
    return stack([
      DropdownButtonFormField<DemoCoverage>(
        initialValue: coverage,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'Financial coverage scenario',
        ),
        items: [
          for (final s in DemoCoverage.values)
            DropdownMenuItem(value: s, child: Text(s.name)),
        ],
        onChanged: (v) => setState(() => coverage = v!),
      ),
      if (coverage == DemoCoverage.empty)
        const EmptyPanel(
          title: 'No accounts in this example',
          message: 'An empty list does not mean a verified zero balance.',
        ),
      if (coverage == DemoCoverage.loading)
        const StatusNotice(
          'Loading specimen · totals are withheld until coverage is known.',
        ),
      if (coverage == DemoCoverage.error)
        StatusNotice(
          'Could not load the example. No balance is available.',
          tone: NoticeTone.error,
          action: TextButton(
            onPressed: () => setState(() => coverage = DemoCoverage.complete),
            child: const Text('Retry demo'),
          ),
        ),
      if (coverage == DemoCoverage.incomplete)
        const StatusNotice(
          'Incomplete download · known balances only. Overall total withheld.',
          tone: NoticeTone.warning,
        ),
      if (coverage == DemoCoverage.pending)
        const StatusNotice(
          'Pending expense · projected total is separate from the last accepted total.',
          tone: NoticeTone.information,
        ),
      AdaptivePair(
        children: [
          MoneySummary(
            label: 'Liquid money · actual',
            value: unavailable || coverage == DemoCoverage.incomplete
                ? null
                : DemoMoney.format(DemoMoney.liquid),
            coverage: 'Three synthetic accounts · F-BASE',
            detail: 'Credit card liability is excluded.',
            onDetails: () => showDialog<void>(
              context: context,
              builder: (context) => AlertDialog(
                title: const Text('Coverage & sources'),
                content: const ReviewRows(
                  rows: [
                    ('Coverage', 'Cash wallet, Everyday bank, Mobile wallet'),
                    ('Basis', 'Accepted fixture F-BASE'),
                    ('Excluded', 'Card liability and projected changes'),
                  ],
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Close details'),
                  ),
                ],
              ),
            ),
          ),
          MoneySummary(
            label: coverage == DemoCoverage.pending
                ? 'Liquid money · projected'
                : 'Card liability · separate',
            value: unavailable
                ? null
                : coverage == DemoCoverage.pending
                ? DemoMoney.format(DemoMoney.liquid - DemoMoney.expense)
                : DemoMoney.format(DemoMoney.card),
            coverage: coverage == DemoCoverage.pending
                ? 'After pending ₱185.50 expense · not accepted'
                : 'Amount owed · never added to liquid money',
          ),
        ],
      ),
      if (!unavailable)
        panel(
          'Recent activity',
          'Explicit directions; transfers are never called income.',
          Column(
            children: [
              RecordRow(
                title: 'Food & transport',
                subtitle: '21 Oct 2026 · Cash wallet · Expense',
                amount: '−₱185.50',
                icon: Icons.north_east,
                onDetails: () => openReview(context, ReviewPresentation.dialog),
              ),
              RecordRow(
                title: 'Bank to mobile wallet',
                subtitle: 'Own-account transfer · separate fee ₱10.00',
                amount: '₱1,000.00',
                icon: Icons.swap_horiz,
                onDetails: () => announce(
                  'Transfer principal does not change total liquid money. Fee reduces it by ₱10.00.',
                ),
              ),
              RecordRow(
                title: 'Shared settlement received',
                subtitle: 'Incoming cash · not new income',
                amount: '+₱800.00',
                icon: Icons.south_west,
                onDetails: () => announce(
                  'Synthetic settlement specimen. No account changed.',
                ),
              ),
            ],
          ),
        ),
      if (!unavailable)
        panel(
          'Account balances',
          'Exact centavos formatted at the presentation boundary. Scroll the table horizontally if needed.',
          SingleChildScrollView(
            key: const PageStorageKey('account-table-scroll'),
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columns: const [
                DataColumn(label: Text('Account')),
                DataColumn(label: Text('Balance'), numeric: true),
              ],
              rows: [
                for (final a in demoAccounts)
                  DataRow(
                    cells: [
                      DataCell(Text(a.$1)),
                      DataCell(
                        AmountText(DemoMoney.format(BigInt.parse(a.$2))),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      panel(
        'Upcoming & debt context',
        'Expected obligations are not actual expenses.',
        const ReviewRows(
          rows: [
            ('Electricity · expected 25 Oct', '₱1,850.00'),
            ('Debt · due 28 Oct', '₱2,000.00'),
            ('Debt payment · actual paid', '₱2,050.00'),
            ('Contractual / external fee', '₱2,000.00 / ₱50.00'),
            ('Unresolved breakdown', 'Principal and interest unavailable'),
          ],
        ),
      ),
      ExpansionTile(
        key: const PageStorageKey('expense-allocation-detail'),
        title: const Text('Inspect isolated expense allocation'),
        childrenPadding: const EdgeInsets.all(16),
        children: const [
          ReviewRows(
            rows: [
              ('Food', '₱150.00'),
              ('Transport', '₱35.50'),
              ('Wallet after expense', '₱1,064.50'),
            ],
          ),
        ],
      ),
    ]);
  }

  Widget overlays() => stack([
    panel(
      'A focused moment',
      'The same review/edit content adapts to three presentations. Escape or system Back respects dirty drafts.',
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final p in ReviewPresentation.values)
            FilledButton.icon(
              onPressed: () => openReview(context, p),
              icon: Icon(
                p == ReviewPresentation.sheet
                    ? Icons.vertical_align_bottom
                    : p == ReviewPresentation.panel
                    ? Icons.view_sidebar_outlined
                    : Icons.layers_outlined,
              ),
              label: Text('Open ${p.name}'),
            ),
        ],
      ),
    ),
    const StatusNotice(
      'Try an invalid amount, Review → Edit, then close a changed draft. “Keep editing” preserves it. Simulate unknown outcome to see cautious recovery language.',
      tone: NoticeTone.information,
    ),
    const EmptyPanel(
      title: 'Review before committing',
      message: 'Source, amount, date and coverage stay visible together. This gallery never commits a financial action.',
    ),
  ]);

  Widget feedback() => stack([
    const EmptyPanel(
      title: 'A quiet beginning',
      message: 'No items in this synthetic example. Add controls elsewhere are only demonstrations.',
    ),
    panel(
      'Synchronization status',
      'A transport status is not recipient confirmation.',
      DropdownButtonFormField<DemoSync>(
        initialValue: sync,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Sync specimen'),
        items: [
          for (final s in DemoSync.values)
            DropdownMenuItem(value: s, child: Text(s.name)),
        ],
        onChanged: (v) => setState(() => sync = v!),
      ),
    ),
    StatusNotice(
      switch (sync) {
        DemoSync.localOnly =>
          'Local-only · on this device; no remote backup claimed.',
        DemoSync.offline =>
          'Offline · connection unavailable; inspect local coverage.',
        DemoSync.waiting => 'Waiting for synchronization · not submitted yet.',
        DemoSync.pending => 'Pending acceptance · sent, but not yet accepted.',
        DemoSync.reconciled => 'Synced · server accepted and reconciled. Recipient confirmation remains separate.',
      },
      tone: sync == DemoSync.reconciled
          ? NoticeTone.success
          : NoticeTone.information,
      live: true,
    ),
    panel(
      'Recipient confirmation',
      'Business evidence, independent from sync.',
      DropdownButtonFormField<DemoReceipt>(
        initialValue: receipt,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Receipt specimen'),
        items: [
          for (final s in DemoReceipt.values)
            DropdownMenuItem(value: s, child: Text(s.name)),
        ],
        onChanged: (v) => setState(() => receipt = v!),
      ),
    ),
    StatusNotice(
      switch (receipt) {
        DemoReceipt.awaiting =>
          'Awaiting recipient confirmation · receipt not confirmed.',
        DemoReceipt.confirmed =>
          'Recipient confirmed · synthetic evidence only.',
        DemoReceipt.manual => 'Manually recorded · not recipient-confirmed.',
      },
      tone: receipt == DemoReceipt.confirmed
          ? NoticeTone.success
          : NoticeTone.warning,
      live: true,
    ),
    const StatusNotice('Loading · requesting the example. No amount implied.'),
    StatusNotice(
      'Error · the example could not be loaded.',
      tone: NoticeTone.error,
      action: TextButton(
        onPressed: () =>
            announce('Demo retry requested. No network request was made.'),
        child: const Text('Retry example'),
      ),
    ),
    const StatusNotice(
      'Incomplete download · some records are missing; totals may be unavailable.',
      tone: NoticeTone.warning,
    ),
    const StatusNotice(
      'Unavailable information · do not substitute a zero or guess a breakdown.',
    ),
  ]);

  Widget branding() {
    final c = CraftTheme.of(context);
    const variants = <(String, String, String, bool)>[
      ('Symbol', 'mark/salapiya_mark.svg', 'salapiya_mark.png', false),
      (
        'Horizontal · light',
        'horizontal/salapiya_horizontal_on_light.svg',
        'salapiya_horizontal_on_light.png',
        false,
      ),
      (
        'Horizontal · dark',
        'horizontal/salapiya_horizontal_on_dark.svg',
        'salapiya_horizontal_on_dark.png',
        true,
      ),
      (
        'Vertical · light',
        'vertical/salapiya_vertical_on_light.svg',
        'salapiya_vertical_on_light.png',
        false,
      ),
      (
        'Vertical · dark',
        'vertical/salapiya_vertical_on_dark.svg',
        'salapiya_vertical_on_dark.png',
        true,
      ),
      (
        'Original · archival',
        'source/salapiya_original.svg',
        'salapiya_original.png',
        true,
      ),
    ];
    return stack([
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Compare SVG renderer'),
        subtitle: const Text(
          'Off: transparent browser display exports. On: unchanged source through flutter_svg.',
        ),
        value: svg,
        onChanged: (v) => setState(() => svg = v),
      ),
      AdaptivePair(
        children: [
          for (final v in variants)
            panel(
              v.$1,
              svg
                  ? 'flutter_svg 2.3.0 · source fidelity specimen'
                  : 'Transparent source export · preserved color',
              Container(
                height: 192,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: v.$4 ? Palette.midnight : Palette.porcelain,
                  border: Border.all(color: c.divider),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: svg
                    ? SvgPicture.asset(
                        'assets/branding/${v.$2}',
                        semanticsLabel: v.$1,
                        fit: BoxFit.contain,
                      )
                    : Image.asset(
                        'assets/branding/display/${v.$3}',
                        semanticLabel: v.$1,
                        fit: BoxFit.contain,
                      ),
              ),
            ),
        ],
      ),
      panel(
        'Clear space & practical scale',
        'A quarter-symbol clear space is reserved around the mark. No recoloring or stretching.',
        Wrap(
          spacing: 24,
          runSpacing: 16,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final size in [24.0, 32.0, 48.0, 64.0])
              Column(
                children: [
                  Padding(
                    padding: EdgeInsets.all(size / 4),
                    child: BrandMark(size: size),
                  ),
                  Text('${size.toInt()} px'),
                ],
              ),
          ],
        ),
      ),
      AdaptivePair(
        children: [
          for (final lattice in [false, true])
            CraftPanel(
              focal: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CraftMotif(size: 96, lattice: lattice),
                  const SizedBox(height: 16),
                  SectionTitle(
                    lattice
                        ? 'Luminous Lattice · comparison'
                        : 'Woven Calm · selected',
                    caption: 'A little clarity, every day.',
                  ),
                  const CraftPanel(
                    padding: 16,
                    child: Text('Your next step is yours to choose.'),
                  ),
                ],
              ),
            ),
        ],
      ),
      const StatusNotice(
        'The supplied logos remain unchanged. The abstract craft motifs are separate UI decoration, never a replacement logo.',
        tone: NoticeTone.information,
      ),
    ]);
  }
}

class TextFormFieldReadOnly extends StatelessWidget {
  const TextFormFieldReadOnly({super.key});
  @override
  Widget build(BuildContext context) => TextFormField(
    initialValue: 'Synthetic source · F-EXPENSE',
    readOnly: true,
    decoration: const InputDecoration(
      labelText: 'Source reference · read only',
    ),
  );
}
