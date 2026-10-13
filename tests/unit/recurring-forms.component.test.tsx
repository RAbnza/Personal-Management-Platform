// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  RecurringDefinitionForm,
  RecurringOccurrenceForm,
} from "@/components/money/recurring-forms";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function fill() {
  for (const [label, value] of [
    ["Name", "Planned subscription"],
    ["Expected amount (PHP)", "123.45"],
    ["First rule effective date", "2026-11-01"],
    ["Month day", "31"],
    ["Short-month behavior", "last_valid_day"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
}
describe("recurring definition review", () => {
  it("submits accessible skip and actual-link review controls without posting until confirmation", async () => {
    const id = "11111111-1111-4111-8111-111111111111",
      source = "22222222-2222-4222-8222-222222222222",
      revision = "33333333-3333-4333-8333-333333333333";
    const data: Parameters<typeof RecurringOccurrenceForm>[0]["data"] = {
      occurrence: {
        id,
        obligation_id: id,
        recurrence_version_id: id,
        logical_date: "2026-10-15",
        due_date: "2026-10-15",
        expected_minor: "10000",
        state: "planned",
        version: 1,
        override_reason: null,
      },
      root: {
        id,
        name: "Bill plan",
        kind: "bill",
        current_version_id: id,
        archived_at: null,
        version: 1,
      },
      rule: {
        effectiveFrom: "2026-10-01",
        frequency: "monthly",
        intervalCount: 1,
        weekdays: null,
        dayOfMonth: 15,
        shortMonthPolicy: "last_valid_day",
        endsOn: null,
        occurrenceLimit: null,
        expectedMinor: "10000",
        currency: "PHP",
        categoryId: null,
        defaultAccountId: null,
        timezone: "Asia/Manila",
      },
      links: [],
      remainingMinor: "10000",
      linkedMinor: "0",
      actuals: [
        {
          actionId: source,
          actionRevisionId: revision,
          transactionDate: "2026-10-15",
          description: "Actual bill",
          amountMinor: "10000",
          availableMinor: "10000",
          kind: "expense",
        },
      ],
      preferredActionId: null,
      nextActualCursor: null,
      history: [],
    };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<RecurringOccurrenceForm data={data} />);
    fireEvent.change(screen.getByLabelText("Occurrence change"), {
      target: { value: "skip" },
    });
    fireEvent.change(screen.getByLabelText("Occurrence change reason"), {
      target: { value: "Explicit skip" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review occurrence change" }),
    );
    expect(
      screen.getByLabelText("Review recurring occurrence"),
    ).toHaveTextContent("skip");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    fireEvent.change(screen.getByLabelText("Existing actual transaction"), {
      target: { value: source },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review actual link" }));
    expect(
      screen.getByLabelText("Review recurring occurrence"),
    ).toHaveTextContent("Actual bill");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("previews exact dates and amount without posting or sending a command until confirmed", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <RecurringDefinitionForm
        timezone="Asia/Manila"
        accounts={[]}
        categories={[]}
      />,
    );
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview and review recurrence" }),
    );
    expect(screen.getByLabelText("Recurrence preview")).toHaveTextContent(
      "2026-11-30",
    );
    expect(screen.getByLabelText("Recurrence preview")).toHaveTextContent(
      "2026-12-31",
    );
    expect(screen.getByLabelText("Review recurring plan")).toHaveTextContent(
      "PHP 123.45",
    );
    expect(fetch).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Review recurring plan" }),
      ).toHaveFocus(),
    );
  });
  it("retains byte-identical commands after a lost response and subsequent authentication error", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(Error("Lost committed response"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ retryable: false, message: "Unavailable" }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            obligationId: "11111111-1111-4111-8111-111111111111",
            financialRevision: "3",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <RecurringDefinitionForm
        timezone="Asia/Manila"
        accounts={[]}
        categories={[]}
      />,
    );
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview and review recurrence" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Name")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry identical command" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retry identical command" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry identical command" }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/money/recurring/11111111-1111-4111-8111-111111111111",
      ),
    );
    const bodies = fetch.mock.calls.map((call) => call[1].body);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toMatchObject({
      operation: "definition",
      rule: { expectedMinor: "12345", shortMonthPolicy: "last_valid_day" },
    });
  });
});
