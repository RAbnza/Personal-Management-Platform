// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  BudgetDefinitionForm,
  BudgetLifecycleForm,
} from "@/components/money/budget-forms";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const id = "11111111-1111-4111-8111-111111111111",
  categories = [{ id, name: "Food", archived: false }];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function fill() {
  fireEvent.change(screen.getByLabelText("Expense category"), {
    target: { value: id },
  });
  fireEvent.change(screen.getByLabelText("Spending limit (PHP)"), {
    target: { value: "92233720368547758.07" },
  });
  fireEvent.change(screen.getByLabelText("Budget start date"), {
    target: { value: "2024-02-01" },
  });
  fireEvent.change(screen.getByLabelText("Budget end date (inclusive)"), {
    target: { value: "2024-02-29" },
  });
}
describe("reviewed budget commands", () => {
  it("reviews exact bigint/period evidence and freezes inputs before any POST", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ budgetId: id, version: 1, financialRevision: "1" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(<BudgetDefinitionForm categories={categories} today="2024-02-01" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review budget" }),
      ).toBeEnabled(),
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Review budget" }));
    expect(fetch).not.toHaveBeenCalled();
    const review = screen.getByRole("region", { name: "Review budget" });
    await waitFor(() =>
      expect(within(review).getByRole("heading")).toHaveFocus(),
    );
    expect(review).toHaveTextContent("PHP 92,233,720,368,547,758.07");
    expect(screen.getByLabelText("Spending limit (PHP)")).toBeDisabled();
    fireEvent.click(
      within(review).getByRole("button", { name: "Confirm and record" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.fields).toMatchObject({
      limitMinor: "9223372036854775807",
      startDate: "2024-02-01",
      endDateExclusive: "2024-03-01",
      basis: "net",
    });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/money/budgets/${id}`),
    );
  });
  it("preserves byte-identical retry after a lost response followed by expired authentication", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(Error("Lost response"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Sign in", retryable: false }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ budgetId: id, version: 1, financialRevision: "1" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(<BudgetDefinitionForm categories={categories} today="2024-02-01" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review budget" }),
      ).toBeEnabled(),
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Review budget" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retry identical command" }),
      ).toBeEnabled(),
    );
    const original = fetch.mock.calls[0]![1].body;
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
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch.mock.calls[1]![1].body).toBe(original);
    expect(fetch.mock.calls[2]![1].body).toBe(original);
  });
  it("uses distinct accessible labels for retained forms and requires lifecycle review", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <>
        <BudgetDefinitionForm categories={categories} today="2024-02-01" />
        <BudgetDefinitionForm categories={categories} today="2024-02-01" />
        <BudgetLifecycleForm budgetId={id} version={1} archived={false} />
      </>,
    );
    const amount = screen.getAllByLabelText("Spending limit (PHP)");
    expect(amount[0]!.id).not.toBe(amount[1]!.id);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review archive" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Reason to archive budget"), {
      target: { value: "Preserve this completed period" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review archive" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Review budget lifecycle" }),
    ).toHaveTextContent("recorded period remains protected");
  });
});
