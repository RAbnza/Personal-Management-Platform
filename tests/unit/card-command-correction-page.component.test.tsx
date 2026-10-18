import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { replacementIntentSchema } from "@/modules/finance/domain/financial-correction";
const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  accounts: vi.fn(),
  categories: vi.fn(),
  cards: vi.fn(),
  card: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock("@/modules/finance/services/correct-financial-action", () => ({
  getFinancialActionDetail: mocks.detail,
}));
vi.mock("@/modules/finance/services/list-financial-accounts", () => ({
  listFinancialAccounts: mocks.accounts,
}));
vi.mock("@/modules/core/services/list-categories", () => ({
  listCategories: mocks.categories,
}));
vi.mock("@/modules/finance/services/read-credit-cards", () => ({
  listCreditCards: mocks.cards,
  getCreditCardDetail: mocks.card,
}));
vi.mock("@/app/money/debts/_workspace", () => ({
  debtWorkspace: mocks.workspace,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Error("Not found");
  },
}));
import FinancialActionPage from "@/app/money/actions/[actionId]/page";
beforeEach(() => vi.resetAllMocks());
describe("card correction reference retention", () => {
  it.each([
    "card_purchase",
    "card_payment",
    "card_fee",
    "card_interest",
    "card_refund",
  ])(
    "retains the original archived %s card beyond the first 100 choices in the real correction form",
    async (actionKind) => {
      const userId = randomUUID(),
        workspaceId = randomUUID(),
        actionId = randomUUID(),
        cardId = randomUUID();
      const card = {
        cardId,
        name: "Historical bound card",
        issuerName: "Provider",
        currency: "PHP",
        creditLimitMinor: null,
        limitVerifiedDate: null,
        notes: null,
        archived: true,
        version: 1,
        postedOutstandingMinor: "10000",
        cardCreditMinor: "0",
      };
      const replacement = replacementIntentSchema.parse({
        actionKind,
        cardId,
        effectiveDate: "2026-10-10",
        postingDate: "2026-10-11",
        description: "Original evidence",
        ...(actionKind === "card_purchase"
          ? {
              purchaseMinor: "10000",
              splits: [{ amountMinor: "10000", categoryId: null }],
            }
          : {
              amountMinor: "10000",
              providerConfirmed: true,
              confirmationSource: "Actual provider record",
              ...(actionKind === "card_payment"
                ? { payingAccountId: randomUUID() }
                : {}),
            }),
      });
      mocks.workspace.mockResolvedValue({
        user: { id: userId },
        workspace: {
          id: workspaceId,
          currency: "PHP",
          timezone: "Asia/Manila",
        },
      });
      mocks.detail.mockResolvedValue({
        current: {
          actionId,
          actionRevisionId: randomUUID(),
          revisionNo: 1,
          actionKind,
          effectiveDate: "2026-10-10",
          currency: "PHP",
          changeKind: "create",
          financialRevision: "4",
          description: "Original evidence",
          reference: null,
          notes: null,
          evidence: replacement,
        },
        replacement,
        history: [],
        cashEffects: [],
        refundSources: [],
        clearingSources: [],
        installments: [],
      });
      mocks.accounts.mockResolvedValue({ items: [] });
      mocks.categories.mockResolvedValue({ items: [] });
      mocks.cards.mockResolvedValue({
        items: Array.from({ length: 100 }, (_, n) => ({
          ...card,
          cardId: randomUUID(),
          name: `Other card ${n}`,
          archived: false,
        })),
        hasMore: true,
      });
      mocks.card.mockResolvedValue({ card });
      render(
        await FinancialActionPage({ params: Promise.resolve({ actionId }) }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Correct entry" }),
      );
      expect(screen.getByLabelText("Credit card")).toHaveValue(cardId);
      expect(
        screen.getByRole("option", {
          name: "Historical bound card (archived)",
        }),
      ).toBeInTheDocument();
      expect(mocks.card).toHaveBeenCalledExactlyOnceWith({
        userId,
        workspaceId,
        cardId,
      });
      expect(mocks.cards).toHaveBeenCalledExactlyOnceWith({
        userId,
        workspaceId,
        includeArchived: true,
        pageSize: 100,
      });
    },
  );
});
