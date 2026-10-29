import 'package:flutter/material.dart';

import '../../../app/demo_routes.dart';
import '../../../design_system/editorial.dart';
import '../../../design_system/theme.dart';
import '../../../prototype/scenarios.dart';
import '../../common/prototype_form.dart';
import '../../planning/presentation/planning_screen.dart';
import '../application/financial_controller.dart';
import 'financial_widgets.dart';

class GroupLifecycle extends StatelessWidget {
  const GroupLifecycle({super.key, required this.session});
  final PrototypeSession session;
  @override
  Widget build(BuildContext context) {
    final c = session.finance,
        group = c.activeGroup,
        owner = c.groupOwners[c.activeGroup] ?? 'Amihan';
    void change(
      String title,
      List<DemoField> fields,
      void Function(Map<String, String>) apply, {
      bool ownerOnly = true,
    }) => reviewForm(
      context,
      title: title,
      fields: fields,
      revision: () => c.version,
      explanation: 'Shared lifecycle simulation. Private records stay private. Removal never cancels debt or erases already downloaded history.',
      save: (v) {
        if (ownerOnly && !c.groupAdministrationAvailable) {
          throw const FormatException(
            'Current owner authority is required; administration may be frozen.',
          );
        }
        if ((v['reason'] ?? '').trim().isEmpty) {
          throw const FormatException(
            'Record a reason for this lifecycle change.',
          );
        }
        apply(v);
        c.groupHistory.add(
          '$title · ${v['reason']} · acting identity ${c.actor}',
        );
        c.version++;
        c.changed();
      },
    );
    return DemoViewState(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FinanceColumns(
            main: ValueBlock(
              'GROUP STEWARDSHIP',
              c.groups[group]!,
              'Owner: $owner · ${c.archivedGroups.contains(group)
                  ? 'Archived'
                  : c.unavailableOwners.contains(group)
                  ? 'Owner administration frozen'
                  : 'Active'}',
              color: Palette.peach,
            ),
            aside: ValueBlock(
              'YOUR ACCESS',
              c.formerMember
                  ? 'Retained history'
                  : c.isGroupOwner
                  ? 'Owner'
                  : 'Member',
              'Acting identity ${c.actor}. No role grants access to another person’s private accounts.',
              color: Palette.mint,
            ),
          ),
          const SizedBox(height: 24),
          const SectionHeading('People, with a history'),
          for (final member in c.members.entries)
            FinancialLine(
              member.key,
              member.value,
              icon: Icons.person_outline,
              onTap: () => change(
                'Member lifecycle · ${member.key}',
                [
                  DemoField(
                    'action',
                    'Action',
                    value: 'Remove from active membership',
                    options: options([
                      'Remove from active membership',
                      'Detach deleted identity',
                      'Restore by reviewed invitation',
                    ]),
                  ),
                  const DemoField('reason', 'Reason'),
                ],
                (v) {
                  if (member.key == owner) {
                    throw const FormatException(
                      'Transfer ownership or archive the group before removing the owner.',
                    );
                  }
                  if (v['action'] == 'Restore by reviewed invitation') {
                    c.members[member.key] = 'Registered · member';
                    c.exitEntitlements.remove('$group:${member.key}');
                    c.exitHistories.remove('$group:${member.key}');
                    if (c.actor == member.key) c.formerMember = false;
                  } else {
                    c.exitEntitlements['$group:${member.key}'] = c.bills
                        .where((b) => b.groupId == group)
                        .map((b) => b.id)
                        .toSet();
                    c.exitHistories['$group:${member.key}'] = List.of(
                      c.groupHistory,
                    );
                    c.members[member.key] =
                        v['action'] == 'Detach deleted identity'
                        ? 'Former · deleted identity · historical participant retained'
                        : 'Former · removed 21 Oct 2026';
                    if (c.actor == member.key) c.formerMember = true;
                  }
                },
              ),
            ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton(
                onPressed: () => change(
                  'Transfer ownership',
                  [
                    DemoField(
                      'target',
                      'New registered owner',
                      value:
                          c.members.entries
                              .where(
                                (e) =>
                                    e.key != owner &&
                                    e.value.startsWith('Registered'),
                              )
                              .firstOrNull
                              ?.key ??
                          '',
                      options: {
                        for (final e in c.members.entries.where(
                          (e) =>
                              e.key != owner &&
                              e.value.startsWith('Registered'),
                        ))
                          e.key: e.key,
                      },
                    ),
                    DemoField(
                      'online',
                      'Online authority scenario',
                      value: 'Current online permission',
                      options: options([
                        'Current online permission',
                        'Offline',
                        'Stale permission',
                      ]),
                    ),
                    const DemoField('reason', 'Reason'),
                  ],
                  (v) {
                    if (v['online'] != 'Current online permission') {
                      throw const FormatException(
                        'Ownership transfer needs current online permission. Keep the draft and retry after revalidation.',
                      );
                    }
                    c.groupOwners[group] = v['target']!;
                    c.members[owner] = 'Registered · member';
                    c.members[v['target']!] = 'Registered · owner';
                  },
                ),
                child: const Text('Transfer ownership'),
              ),
              OutlinedButton(
                onPressed: () => change(
                  'Leave group',
                  [const DemoField('reason', 'Reason')],
                  (_) {
                    if (c.actor == owner) {
                      throw const FormatException(
                        'An owner must transfer ownership or archive the group first.',
                      );
                    }
                    c.exitEntitlements['$group:${c.actor}'] = c.groupBills
                        .map((b) => b.id)
                        .toSet();
                    c.exitHistories['$group:${c.actor}'] = List.of(
                      c.groupHistory,
                    );
                    c.members[c.actor] = 'Former · left voluntarily';
                    c.formerMember = true;
                  },
                  ownerOnly: false,
                ),
                child: const Text('Leave group'),
              ),
              OutlinedButton(
                onPressed: () => change('Archive group', [
                  const DemoField('reason', 'Reason'),
                ], (_) => c.archivedGroups.add(group)),
                child: const Text('Archive group'),
              ),
              OutlinedButton(
                onPressed: () => openDemoPage<void>(
                  context,
                  FinancePage(
                    title: 'Group export preview',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const FinanceNotice(
                          'Synthetic preview only. No file is written. Only entitled shared facts; no private accounts, private adoption records, or private attachments.',
                        ),
                        Text(
                          '${c.groups[group]} · ${c.formerMember ? 'retained exit entitlement' : 'current member coverage'}',
                        ),
                        for (final b in c.groupBills)
                          FinancialLine(
                            b.title,
                            'v${b.revision} · creator ${b.creator}',
                            value: session.amount(b.total - b.refunded),
                          ),
                        for (final p in c.groupSettlements)
                          FinancialLine(
                            '${p.sender} → ${p.recipient}',
                            p.status.name,
                            value: session.amount(p.amount),
                          ),
                      ],
                    ),
                  ),
                  'shared/export',
                ),
                child: const Text('Export group preview'),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const SectionHeading('Recovery without a takeover'),
          const FinanceNotice(
            'An offline or lost owner device does not stop ordinary member activity. Permanent owner loss freezes owner-only administration; recovery policy needs verified service operations. Members never appoint themselves automatically.',
          ),
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton(
                onPressed: () {
                  c.unavailableOwners.add(group);
                  c.groupHistory.add(
                    'Owner identity unavailable · administration frozen',
                  );
                  c.version++;
                  c.changed();
                },
                child: const Text('Explore owner-loss state'),
              ),
              OutlinedButton(
                onPressed: () => change(
                  'Same-owner identity recovery',
                  [
                    DemoField(
                      'identity',
                      'Recovered identity',
                      value: owner,
                      options: options([owner]),
                    ),
                    const DemoField('reason', 'Recovery evidence'),
                  ],
                  (_) {
                    if (c.actor != owner) {
                      throw const FormatException(
                        'Only the same owner identity can recover ownership in this scenario.',
                      );
                    }
                    c.unavailableOwners.remove(group);
                  },
                  ownerOnly: false,
                ),
                child: const Text('Review owner recovery'),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const SectionHeading('Entitlement & retained history'),
          const Text(
            'Former members keep the bills entitled at exit and later corrections to those same sources. Unrelated later bills are excluded. Permitted receipt resolution is source-scoped; private evidence survives.',
          ),
          for (final h in c.visibleGroupHistory.reversed)
            FinancialLine(
              'History',
              session.hideAmounts ? 'Amounts hidden' : h,
              icon: Icons.history,
            ),
          if (c.formerMember)
            FinanceNotice(
              '${c.groupBills.length} retained bills · ${c.bills.where((b) => b.groupId == group).length - c.groupBills.length} unrelated later bills withheld.',
            ),
        ],
      ),
    );
  }
}
