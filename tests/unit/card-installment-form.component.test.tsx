// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CardInstallmentPlanForm,
  parseInstallmentAmount,
} from "@/components/money/card-installment-form";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const cardId = "11111111-1111-4111-8111-111111111111",
  purchaseId = "22222222-2222-4222-8222-222222222222";
const purchase = {
  actionId: purchaseId,
  actionRevisionId: purchaseId,
  description: "Already recognized laptop",
  amountMinor: "300000",
  transactionDate: "2026-10-10",
  postingDate: "2026-10-11",
};
const setup: Parameters<typeof CardInstallmentPlanForm>[0]["setup"] = {
  financialRevision: "1",
  card: {
    cardId,
    name: "Visa",
    issuerName: "Provider",
    currency: "PHP",
    creditLimitMinor: null,
    limitVerifiedDate: null,
    notes: null,
    archived: false,
    version: 1,
    postedOutstandingMinor: "300000",
    cardCreditMinor: "0",
  },
  hasMore: false,
  purchases: [purchase],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function fill() {
  for (const [label, value] of [
    ["Financed principal (PHP)", "3000"],
    ["Expected principal (PHP)", "3000"],
    ["Provider verification source", "Actual provider schedule"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  fireEvent.click(screen.getByLabelText(/I confirm this complete schedule/));
}
describe("provider installment review and retry", () => {
  it("leaves future dates/charges unknown and requires review without posting another purchase", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ planId: cardId, financialRevision: "2" }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <CardInstallmentPlanForm
        setup={setup}
        purchase={purchase}
        today="2026-10-12"
      />,
    );
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Review installment evidence" }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Review card command" }),
    ).toHaveFocus();
    expect(screen.getByText(/due Unknown; principal/)).toHaveTextContent(
      "interest Unknown; fee Unknown; total Unknown",
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        `/money/cards/${cardId}/installments`,
      ),
    );
    const b = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(b).toMatchObject({
      purchaseActionId: purchaseId,
      principalMinor: "300000",
      installments: [
        {
          dueDate: null,
          interestMinor: null,
          feeMinor: null,
          totalMinor: null,
        },
      ],
    });
    expect(b).not.toHaveProperty("cardId");
    expect(b).not.toHaveProperty("actionKind");
  });
  it("retains a committed but lost result and freezes identical retry through an authentication failure", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(Error("Lost committed response"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retryable: false, message: "Sign in" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ planId: cardId, financialRevision: "2" }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <CardInstallmentPlanForm
        setup={setup}
        purchase={purchase}
        today="2026-10-12"
      />,
    );
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Review installment evidence" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Financed principal (PHP)")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry identical command" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retry identical command" }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByRole("button", { name: "Back to edit" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry identical command" }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[2]![1].body);
  });
  it("treats an unrelated success payload as unconfirmed and never creates a fresh command", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ actionId: cardId, financialRevision: "2" }),
            { status: 201 },
          ),
        ),
    );
    render(
      <CardInstallmentPlanForm
        setup={setup}
        purchase={purchase}
        today="2026-10-12"
      />,
    );
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Review installment evidence" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    await screen.findByRole("alert");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Financed principal (PHP)")).toBeDisabled();
  });
  it("never infers a schedule when the count changes and keeps retained form labels unique", () => {
    const { container } = render(
      <>
        <CardInstallmentPlanForm
          setup={setup}
          purchase={purchase}
          today="2026-10-12"
        />
        <CardInstallmentPlanForm
          setup={setup}
          purchase={purchase}
          today="2026-10-12"
        />
      </>,
    );
    fireEvent.change(
      screen.getAllByLabelText("Provider installment count")[0]!,
      { target: { value: "3" } },
    );
    expect(screen.getAllByLabelText("Expected principal (PHP)")).toHaveLength(
      2,
    );
    expect(screen.getAllByLabelText("Expected principal (PHP)")[0]).toHaveValue(
      "",
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("parses exact projected provider amounts beyond Number precision", () => {
    expect(parseInstallmentAmount("90071992547409.93")).toBe(
      "9007199254740993",
    );
    for (const amount of ["1.001", "1e3", "-1", "92233720368547758.08"])
      expect(() => parseInstallmentAmount(amount)).toThrow();
  });
});
