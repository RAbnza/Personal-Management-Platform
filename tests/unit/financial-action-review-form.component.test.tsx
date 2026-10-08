// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FinancialActionReviewForm,
  correctionCashEffects,
} from "@/components/money/financial-action-review-form";
import { replacementIntentSchema } from "@/modules/finance/domain/financial-correction";
import { paymentIds as ids, paymentAccount } from "./helpers/debt-payment";
const fetchMock = vi.fn();
const account = paymentAccount;
function setup() {
  const replacement = replacementIntentSchema.parse({
    actionKind: "expense",
    fundingAccountId: account.accountId,
    effectiveDate: "2026-10-08",
    purchaseMinor: "1000",
    splits: [{ amountMinor: "1000", categoryId: null, memo: null }],
    description: "Purchase",
  });
  return {
    current: {
      actionId: ids.payment,
      actionRevisionId: ids.revision,
      revisionNo: 1,
      actionKind: "expense",
      effectiveDate: "2026-10-08",
      currency: "PHP",
      changeKind: "create",
      financialRevision: "4",
      description: "Purchase",
      reference: null,
      notes: null,
      evidence: replacement,
    },
    replacement,
    history: [],
    cashEffects: [
      {
        accountId: account.accountId,
        accountName: account.name,
        effectiveDate: "2026-10-08",
        signedMinor: "-1000",
      },
    ],
    refundSources: [],
    clearingSources: [],
    installments: [],
  };
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
async function review() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Required reason"), "Wrong amount");
  await user.click(
    screen.getByRole("checkbox", { name: /explicitly acknowledge/i }),
  );
  await user.click(
    screen.getByRole("button", { name: "Review exact changes" }),
  );
  return user;
}
describe("financial action review", () => {
  it("previews a withheld transfer fee with exactly one actual source deduction", () => {
    const intent = replacementIntentSchema.parse({
      actionKind: "transfer",
      sourceAccountId: ids.account,
      destinationAccountId: ids.debt,
      effectiveDate: "2026-10-08",
      destinationPrincipalMinor: "1000",
      description: "Transfer with withheld fee",
      fees: [
        { amountMinor: "100", treatment: "withheld", label: "Provider fee" },
      ],
    });
    const effects = correctionCashEffects(intent);
    expect(
      effects
        .filter((e) => e.accountId === ids.account)
        .reduce((s, e) => s + BigInt(e.signedMinor), 0n),
    ).toBe(-1100n);
    expect(
      effects
        .filter((e) => e.accountId === ids.debt)
        .reduce((s, e) => s + BigInt(e.signedMinor), 0n),
    ).toBe(1000n);
  });
  it("shows exact before/after and requires a separate final confirmation", async () => {
    render(
      <FinancialActionReviewForm
        detail={setup()}
        accounts={[account]}
        categories={[]}
        today="2026-10-09"
      />,
    );
    const user = await review();
    expect(
      screen.getByRole("region", { name: "Exact financial review" }),
    ).toHaveTextContent("Cancel the current economics at their original dates");
    expect(
      screen.getByRole("button", { name: "Confirm and save" }),
    ).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("checkbox", { name: /confirm the exact dates/i }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm and save" }),
    ).toBeEnabled();
  });
  it("clears the durable acknowledgement when the reviewed intent changes", async () => {
    render(
      <FinancialActionReviewForm
        detail={setup()}
        accounts={[account]}
        categories={[]}
        today="2026-10-09"
      />,
    );
    const user = await review();
    await user.click(screen.getByRole("button", { name: "Edit review" }));
    expect(
      screen.getByRole("checkbox", { name: /explicitly acknowledge/i }),
    ).not.toBeChecked();
  });
  it("locks an uncertain save and retries the identical command with acknowledgement", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            actionId: ids.payment,
            actionRevisionId: ids.command,
            financialRevision: "5",
          }),
          { status: 201 },
        ),
      );
    render(
      <FinancialActionReviewForm
        detail={setup()}
        accounts={[account]}
        categories={[]}
        today="2026-10-09"
      />,
    );
    const user = await review();
    await user.click(
      screen.getByRole("checkbox", { name: /confirm the exact dates/i }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm and save" }));
    await screen.findByRole("button", { name: "Retry identical command" });
    expect(screen.getAllByLabelText("Purchase amount")[0]).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Retry identical command" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Financial command saved",
      ),
    );
    expect(fetchMock.mock.calls[0]![1].body).toBe(
      fetchMock.mock.calls[1]![1].body,
    );
    expect(
      JSON.parse(fetchMock.mock.calls[0]![1].body).replacement
        .acknowledgeNegativeBalance,
    ).toBe(true);
  });
  it("treats a malformed success as uncertain", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));
    render(
      <FinancialActionReviewForm
        detail={setup()}
        accounts={[account]}
        categories={[]}
        today="2026-10-09"
      />,
    );
    const user = await review();
    await user.click(
      screen.getByRole("checkbox", { name: /confirm the exact dates/i }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm and save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Save outcome unconfirmed",
    );
  });
  it("requires reload after a stale preview instead of issuing a new command automatically", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Evidence changed" }), {
        status: 409,
      }),
    );
    render(
      <FinancialActionReviewForm
        detail={setup()}
        accounts={[account]}
        categories={[]}
        today="2026-10-09"
      />,
    );
    const user = await review();
    await user.click(
      screen.getByRole("checkbox", { name: /confirm the exact dates/i }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm and save" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Reload and review",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
