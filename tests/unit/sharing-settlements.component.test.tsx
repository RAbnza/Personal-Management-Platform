// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { SettlementPanel } from "@/components/sharing/settlements";
import { EffectAdoption } from "@/components/sharing/effect-adoption";
import { RetainPrivateEvidence } from "@/components/sharing/retain-private-evidence";
import {
  calculateBalances,
  type SourcePosition,
} from "@/modules/sharing/domain/balances";
import type { GroupDetail } from "@/modules/sharing/services/read-groups";
import type { SettlementRecord } from "@/modules/sharing/services/ledger";
import type { EffectPreview } from "@/modules/finance/services/adopt-group-effect";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  bill = "33333333-3333-4333-8333-333333333333",
  revision = "44444444-4444-4444-8444-444444444444",
  payment = "55555555-5555-4555-8555-555555555555";
const sources: SourcePosition[] = [
  {
    expenseId: bill,
    revisionId: revision,
    participantId: a,
    paidMinor: "2000",
    shareMinor: "1000",
    refundReceivedMinor: "0",
    refundShareMinor: "0",
  },
  {
    expenseId: bill,
    revisionId: revision,
    participantId: b,
    paidMinor: "0",
    shareMinor: "1000",
    refundReceivedMinor: "0",
    refundShareMinor: "0",
  },
];
function data(pending = false, manual = false): GroupDetail {
  const settlements: SettlementRecord[] = pending
    ? [
        {
          id: payment,
          senderId: b,
          recipientId: a,
          reportedBy: b,
          amountMinor: "400",
          advanceMinor: "0",
          state: "pending",
          mode: "custom",
          version: 1,
          paymentDate: "2026-10-15",
          note: null,
          createdAt: "2026-10-15T00:00:00Z",
          allocations: [
            { expenseId: bill, sourceRevisionId: revision, amountMinor: "400" },
          ],
          events: [],
        },
      ]
    : [];
  return {
    group: {
      id: bill,
      name: "Dinner group",
      version: 7,
      archived: false,
      active: true,
      owner: true,
      participantId: b,
    },
    participants: [
      {
        id: a,
        displayName: "Recipient",
        identityKind: manual ? "manual" : "registered",
        active: !manual,
        role: "member",
        paidMinor: "2000",
        shareMinor: "1000",
        netMinor: "1000",
      },
      {
        id: b,
        displayName: "Sender",
        identityKind: "registered",
        active: true,
        role: "owner",
        paidMinor: "0",
        shareMinor: "1000",
        netMinor: "-1000",
      },
    ],
    bills: [
      {
        id: bill,
        revisionId: revision,
        revisionNo: 1,
        description: "Dinner",
        expenseDate: "2026-10-10",
        totalMinor: "2000",
        splitMethod: "equal",
        creatorId: a,
        categoryLabel: null,
        notes: null,
      },
    ],
    nextCursor: null,
    invitations: [],
    ledger: {
      sources,
      settlements,
      refunds: [],
      ...calculateBalances(sources, settlements),
      projected: calculateBalances(
        sources,
        settlements.map((s) => ({ ...s, state: "confirmed" })),
      ),
    },
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("settlement review workflows", () => {
  it("keeps confirmed and pending projected amounts visibly separate and never posts a suggestion", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<SettlementPanel data={data(true)} />);
    expect(screen.getByText(/Your confirmed net:/)).toHaveTextContent(
      /-PHP 10.00.*-PHP 6.00/,
    );
    expect(screen.getByText(/Pending outgoing:/)).toHaveTextContent("PHP 4.00");
    expect(screen.getByText(/Suggestions do not post/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("submits an exact partial selected bill with its reviewed revision and no client-owned scope", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(<SettlementPanel data={data()} />);
    fireEvent.change(screen.getByLabelText("Settlement scope"), {
      target: { value: "selected" },
    });
    fireEvent.change(screen.getByLabelText("Payment amount (PHP)"), {
      target: { value: "4.00" },
    });
    fireEvent.change(screen.getByLabelText(/Dinner.*pay \(PHP\)/), {
      target: { value: "4.00" },
    });
    fireEvent.change(screen.getByLabelText("Payment date"), {
      target: { value: "2026-10-15" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Report payment sent" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      kind: "settlement",
      expectedVersion: 7,
      recipientId: a,
      amountMinor: "400",
      allocations: [
        { expenseId: bill, sourceRevisionId: revision, amountMinor: "400" },
      ],
    });
    expect(body).not.toHaveProperty("workspaceId");
    expect(body).not.toHaveProperty("userId");
  });
  it("discloses unavailable recipient authentication and preserves explicit manual confirmation evidence", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(<SettlementPanel data={data(true, true)} />);
    fireEvent.click(screen.getByText("Review payment and record a decision"));
    expect(
      screen.getByText(/Recipient cannot authenticate/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Transition"), {
      target: { value: "manual_confirm" },
    });
    fireEvent.change(screen.getByLabelText("Transition reason"), {
      target: { value: "Manually received" },
    });
    fireEvent.click(
      screen.getByLabelText(/I acknowledge the recipient has no authenticated/),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Record settlement transition" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      operation: "manual_confirm",
      acknowledgeManualLimitation: true,
      expectedSettlementVersion: 1,
    });
  });
  it("requires a reason and explicit approval to retain a reviewed private difference", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(
      <RetainPrivateEvidence
        groupId={bill}
        linkId={a}
        linkRevisionId={revision}
        sourceHash={"ab".repeat(32)}
        financialRevision="9"
        review={null}
      />,
    );
    expect(
      screen.getByText(
        /posts no money and does not mark the sources as synchronized/,
      ),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Reason for retaining private evidence"),
      { target: { value: "Independent verified amount" } },
    );
    fireEvent.click(
      screen.getByLabelText(/I reviewed this exact current source/),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Record reviewed private difference",
      }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      linkId: a,
      expectedLinkRevisionId: revision,
      expectedSourceHash: "ab".repeat(32),
      approved: true,
      reason: "Independent verified amount",
    });
  });
  it("reviews clearing using retained funding and discloses that reversal does not return cash", async () => {
    const preview: EffectPreview = {
      groupId: bill,
      sourceKind: "settlement",
      sourceId: payment,
      purpose: "settlement_sent",
      sourceVersion: 3,
      state: "reversed",
      paidMinor: "400",
      shareMinor: "0",
      cashMinor: "-400",
      spendingMinor: "0",
      groupMinor: "0",
      clearingMinor: "400",
      canResolve: false,
      effectiveDate: "2026-10-15",
      sourceHash: "aa".repeat(32),
      financialRevision: "9",
      link: {
        id: a,
        revisionId: revision,
        revisionNo: 1,
        actionId: b,
        sourceHash: "bb".repeat(32),
      },
      existingMovements: [],
      needsReview: true,
      review: null,
      retainedAmounts: null,
    };
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(
      <EffectAdoption
        preview={preview}
        setup={{
          financialRevision: "9",
          accounts: [],
          cards: [],
          categories: [],
          purchases: [],
        }}
      />,
    );
    expect(
      screen.getByText(/does not claim a physical return/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/I approve these exact amounts/));
    fireEvent.click(
      screen.getByRole("button", { name: "Approve clearing review" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      funding: { kind: "keep" },
      expectedSourceHash: preview.sourceHash,
      approved: true,
    });
  });
});
