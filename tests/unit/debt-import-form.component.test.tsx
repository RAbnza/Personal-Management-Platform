import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebtImportForm } from "@/components/money/debt-import-form";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const result = {
  debtId: "11111111-1111-4111-8111-111111111111",
  openingActionId: "22222222-2222-4222-8222-222222222222",
  scheduleVersionId: "33333333-3333-4333-8333-333333333333",
  financialRevision: "1",
};
async function fill() {
  const user = userEvent.setup();
  for (const [label, value] of [
    ["Debt name", "Existing loan"],
    ["Lender / provider", "Provider"],
    ["Debt start date", "2026-01-01"],
    ["Opening cutoff date (end of day)", "2026-10-06"],
    ["Recognized opening liability (PHP)", "6400.01"],
    ["Component 1 amount (PHP)", "6400.01"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  await user.click(screen.getByRole("button", { name: "Review import" }));
  return user;
}
describe("DebtImportForm", () => {
  it("requires a review before posting exact minor units and navigating to committed details", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(result), { status: 201 }),
    );
    render(<DebtImportForm currency="PHP" />);
    const user = await fill();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Import preview")).toHaveTextContent(
      "PHP 6,400.01",
    );
    expect(screen.getByLabelText("Import preview")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Confirm import" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/money/debts/${result.debtId}`),
    );
    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(payload).toMatchObject({
      openingLiabilityMinor: "640001",
      openingComponents: [{ kind: "unclassified", amountMinor: "640001" }],
      installments: [],
    });
    expect(payload).not.toHaveProperty("workspaceId");
  });
  it("retains the same command through a lost response, expired session, and retry", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(result), { status: 201 }),
      );
    render(<DebtImportForm currency="PHP" />);
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Confirm import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn't confirm",
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Debt name")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry same save" }));
    await user.click(
      await screen.findByRole("button", { name: "Retry same save" }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledOnce());
    const bodies = fetchMock.mock.calls.map((call) => call[1].body);
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
  });
  it("does not treat a malformed success response as a confirmed save", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));
    render(<DebtImportForm currency="PHP" />);
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Confirm import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn't confirm",
    );
    expect(router.push).not.toHaveBeenCalled();
  });
  it("announces mismatched allocations and preserves input without sending money", async () => {
    render(<DebtImportForm currency="PHP" />);
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.change(screen.getByLabelText("Component 1 amount (PHP)"), {
      target: { value: "1.00" },
    });
    await user.click(screen.getByRole("button", { name: "Review import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("must equal");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
