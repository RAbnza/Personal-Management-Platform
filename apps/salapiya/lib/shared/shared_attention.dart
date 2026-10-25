import 'package:flutter/material.dart';

import '../features/finance/presentation/financial_widgets.dart';
import '../design_system/theme.dart';
import '../local/local_runtime.dart';

class SharedAttention extends StatelessWidget {
  const SharedAttention({super.key, required this.session, required this.open});
  final LocalSession session;
  final VoidCallback open;
  @override
  Widget build(BuildContext context) {
    final c = session.runtime.connected;
    if (c.needMyConfirmation +
            c.waitingForOthers +
            c.sharedPendingCount +
            c.sharedReviewCount +
            c.changedPrivateSources ==
        0) {
      return const SizedBox.shrink();
    }
    return FinancialLine(
      'Shared Expenses needs attention',
      '${c.needMyConfirmation} receipts need your confirmation · ${c.waitingForOthers} waiting for others\n${c.sharedPendingCount} waiting for group acceptance · ${c.sharedReviewCount} rejected / restored reviews · ${c.changedPrivateSources} changed private sources',
      icon: Icons.people_outline,
      color: Palette.peach,
      onTap: open,
    );
  }
}
