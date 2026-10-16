/** Deterministic attribution policy v1: offset own paid/share first, then match
 * remaining debtors to creditors in canonical participant UUID order per bill.
 * No cross-person obligation is discharged by a projection. All arithmetic is bigint. */
export type SourcePosition = {
  expenseId: string;
  revisionId: string;
  participantId: string;
  paidMinor: string;
  shareMinor: string;
  refundReceivedMinor: string;
  refundShareMinor: string;
};
export type Allocation = {
  expenseId: string;
  sourceRevisionId: string;
  amountMinor: string;
};
export type Settlement = {
  id: string;
  senderId: string;
  recipientId: string;
  amountMinor: string;
  advanceMinor: string;
  state: string;
  allocations: Allocation[];
};
export type Edge = {
  senderId: string;
  recipientId: string;
  amountMinor: string;
  expenseId: string | null;
  sourceId: string;
  kind: "bill_after_refunds" | "settlement";
};
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function matchPositions(
  positions: { participantId: string; netMinor: string }[],
) {
  const debtors = positions
    .filter((p) => BigInt(p.netMinor) < 0n)
    .sort((a, b) => compare(a.participantId, b.participantId))
    .map((p) => ({ id: p.participantId, left: -BigInt(p.netMinor) }));
  const creditors = positions
    .filter((p) => BigInt(p.netMinor) > 0n)
    .sort((a, b) => compare(a.participantId, b.participantId))
    .map((p) => ({ id: p.participantId, left: BigInt(p.netMinor) }));
  if (positions.reduce((n, p) => n + BigInt(p.netMinor), 0n) !== 0n)
    throw new RangeError("Group positions must sum to zero.");
  const out: { senderId: string; recipientId: string; amountMinor: string }[] =
    [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!,
      c = creditors[j]!,
      amount = d.left < c.left ? d.left : c.left;
    out.push({
      senderId: d.id,
      recipientId: c.id,
      amountMinor: amount.toString(),
    });
    d.left -= amount;
    c.left -= amount;
    if (!d.left) i++;
    if (!c.left) j++;
  }
  return out;
}
export function calculateBalances(
  sources: SourcePosition[],
  settlements: Settlement[],
) {
  const edges: Edge[] = [];
  for (const expenseId of [
    ...new Set(sources.map((p) => p.expenseId)),
  ].sort()) {
    const rows = sources.filter((p) => p.expenseId === expenseId);
    for (const edge of matchPositions(
      rows.map((p) => ({
        participantId: p.participantId,
        netMinor: (
          BigInt(p.paidMinor) -
          BigInt(p.shareMinor) -
          BigInt(p.refundReceivedMinor) +
          BigInt(p.refundShareMinor)
        ).toString(),
      })),
    ))
      edges.push({
        ...edge,
        expenseId,
        sourceId: expenseId,
        kind: "bill_after_refunds",
      });
  }
  for (const s of settlements.filter((s) => s.state === "confirmed")) {
    for (const a of s.allocations)
      edges.push({
        senderId: s.recipientId,
        recipientId: s.senderId,
        amountMinor: a.amountMinor,
        expenseId: a.expenseId,
        sourceId: s.id,
        kind: "settlement",
      });
    if (BigInt(s.advanceMinor) > 0n)
      edges.push({
        senderId: s.recipientId,
        recipientId: s.senderId,
        amountMinor: s.advanceMinor,
        expenseId: null,
        sourceId: s.id,
        kind: "settlement",
      });
  }
  const people = new Map<string, bigint>(),
    pairs = new Map<
      string,
      { firstId: string; secondId: string; net: bigint; explanations: Edge[] }
    >();
  for (const e of edges) {
    const amount = BigInt(e.amountMinor);
    people.set(e.senderId, (people.get(e.senderId) ?? 0n) - amount);
    people.set(e.recipientId, (people.get(e.recipientId) ?? 0n) + amount);
    const [firstId, secondId] = [e.senderId, e.recipientId].sort(compare) as [
        string,
        string,
      ],
      key = firstId + secondId;
    const pair = pairs.get(key) ?? {
      firstId,
      secondId,
      net: 0n,
      explanations: [],
    };
    pair.net += e.senderId === firstId ? amount : -amount;
    pair.explanations.push(e);
    pairs.set(key, pair);
  }
  const positions = [...people]
    .sort(([a], [b]) => compare(a, b))
    .map(([participantId, net]) => ({
      participantId,
      netMinor: net.toString(),
    }));
  return {
    edges,
    positions,
    pairs: [...pairs.values()].map((p) => ({
      firstId: p.firstId,
      secondId: p.secondId,
      firstOwesSecondMinor: p.net.toString(),
      explanations: p.explanations,
    })),
    suggestions: settlements.some((s) => s.state === "disputed")
      ? []
      : matchPositions(positions),
  };
}
export function obligationFor(
  edges: Edge[],
  senderId: string,
  recipientId: string,
  expenseId?: string,
) {
  return edges
    .filter((e) => expenseId === undefined || e.expenseId === expenseId)
    .reduce(
      (n, e) =>
        n +
        (e.senderId === senderId && e.recipientId === recipientId
          ? BigInt(e.amountMinor)
          : e.senderId === recipientId && e.recipientId === senderId
            ? -BigInt(e.amountMinor)
            : 0n),
      0n,
    );
}
export function previewSettlement(
  sources: SourcePosition[],
  settlements: Settlement[],
  senderId: string,
  recipientId: string,
  amountMinor: string,
  selected?: Allocation[],
) {
  const balance = calculateBalances(sources, settlements),
    due = obligationFor(balance.edges, senderId, recipientId),
    amount = BigInt(amountMinor);
  const allocations: Allocation[] = [];
  let left = amount;
  if (selected) {
    if (new Set(selected.map((a) => a.expenseId)).size !== selected.length)
      throw new RangeError("An expense can be selected only once.");
    for (const a of selected) {
      const source = sources.find((p) => p.expenseId === a.expenseId);
      if (!source || source.revisionId !== a.sourceRevisionId)
        throw new RangeError(
          "A selected bill changed. Review the current revision.",
        );
      if (
        BigInt(a.amountMinor) <= 0n ||
        BigInt(a.amountMinor) >
          obligationFor(balance.edges, senderId, recipientId, a.expenseId)
      )
        throw new RangeError(
          "Allocation exceeds this recipient's current bill obligation.",
        );
      allocations.push(a);
      left -= BigInt(a.amountMinor);
    }
  } else {
    let applicable = due > 0n ? (amount < due ? amount : due) : 0n;
    for (const expenseId of [
      ...new Set(
        balance.edges.flatMap((e) => (e.expenseId ? [e.expenseId] : [])),
      ),
    ].sort()) {
      const owed = obligationFor(
          balance.edges,
          senderId,
          recipientId,
          expenseId,
        ),
        use = owed > 0n ? (owed < applicable ? owed : applicable) : 0n;
      if (use > 0n) {
        allocations.push({
          expenseId,
          sourceRevisionId: sources.find((p) => p.expenseId === expenseId)!
            .revisionId,
          amountMinor: use.toString(),
        });
        applicable -= use;
        left -= use;
      }
    }
    // An earlier advance is a relationship obligation without a source bill.
  }
  if (left < 0n) throw new RangeError("Allocations exceed the payment.");
  return {
    dueMinor: (due > 0n ? due : 0n).toString(),
    allocations,
    advanceMinor: left.toString(),
    projectedRelationshipMinor: (due - amount).toString(),
  };
}
