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
import { CardStatementForm } from "@/components/money/card-statement-form";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const cardId = "11111111-1111-4111-8111-111111111111",
  statementId = "22222222-2222-4222-8222-222222222222";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function fill() {
  for (const [label, value] of [
    ["Cycle start", "2026-10-01"],
    ["Cycle end", "2026-10-31"],
    ["Statement date", "2026-11-01"],
    ["Due date", "2026-11-20"],
    ["Statement balance (PHP)", "90071992547409.93"],
    ["Minimum due (PHP)", "0"],
    ["Provider verification date", "2026-11-02"],
    ["Verification source", "Provider PDF"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
}
describe("statement form", () => {
  it("reviews exact evidence and freezes an uncertain command for identical retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(Error("Lost committed response"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statementId,
            revisionId: cardId,
            version: 1,
            financialRevision: "1",
          }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <CardStatementForm cardId={cardId} currency="PHP" candidates={[]} />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Review statement" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Review verified statement" }),
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm provider-verified statement",
      }),
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Statement balance (PHP)")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same save" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        `/money/cards/${cardId}/statements/${statementId}`,
      ),
    );
    expect(fetch.mock.calls[0]?.[1].body).toBe(fetch.mock.calls[1]?.[1].body);
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body).balanceMinor).toBe(
      "9007199254740993",
    );
  });
  it("requires explicit links; keeps unknown provider lines nullable", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <CardStatementForm cardId={cardId} currency="PHP" candidates={[]} />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Add provider line" }));
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Unknown provider charge" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review statement" }));
    expect(screen.getByText(/Unknown amount/)).toHaveTextContent(
      "Unknown provider charge",
    );
    expect(screen.getByText(/Unknown amount/)).toHaveTextContent("Unresolved");
  });
  it("uses distinct labels when more than one retained form exists", () => {
    const { container } = render(
      <>
        <CardStatementForm cardId={cardId} currency="PHP" candidates={[]} />
        <CardStatementForm
          cardId={statementId}
          currency="PHP"
          candidates={[]}
        />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByLabelText("Verification source")).toHaveLength(2);
  });
});
