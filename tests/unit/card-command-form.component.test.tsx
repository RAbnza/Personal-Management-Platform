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
import { CardCommandForm } from "@/components/money/card-command-form";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const cardId = "11111111-1111-4111-8111-111111111111";
const setup: Parameters<typeof CardCommandForm>[0]["setup"] = {
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
    postedOutstandingMinor: "30000",
    cardCreditMinor: "0",
  },
  accounts: [],
  categories: [],
  purchases: [],
  purchasesHaveMore: false,
  refundSources: [],
  creditSources: { items: [], hasMore: false },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function fill() {
  fireEvent.change(screen.getByLabelText("Activity kind"), {
    target: { value: "card_fee" },
  });
  for (const [label, value] of [
    ["Amount (PHP)", "100.01"],
    ["Transaction date", "2026-10-10"],
    ["Provider posting date", "2026-10-11"],
    ["Description", "Actual fee"],
    ["Actual evidence source", "Provider posted fee"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  fireEvent.click(
    screen.getByLabelText(/I confirm this actual posted transaction/),
  );
}
describe("card command review and retry", () => {
  it.each([401, 403, 404])(
    "retains an already uncertain command after HTTP %s without permitting a new command ID",
    async (status) => {
      const fetch = vi
        .fn()
        .mockRejectedValueOnce(Error("Lost committed response"))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ message: "Unavailable", retryable: false }),
            { status },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ actionId: cardId, financialRevision: "2" }),
            { status: 201 },
          ),
        );
      vi.stubGlobal("fetch", fetch);
      render(<CardCommandForm setup={setup} />);
      fill();
      fireEvent.click(
        screen.getByRole("button", {
          name: "Review card command",
        }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm and record" }),
      );
      await screen.findByRole("alert");
      fireEvent.click(
        screen.getByRole("button", { name: "Retry identical command" }),
      );
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Retry identical command" }),
        ).toBeEnabled(),
      );
      expect(screen.getByLabelText("Amount (PHP)")).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", { name: "Retry identical command" }),
      );
      await waitFor(() => expect(mocks.push).toHaveBeenCalled());
      expect(fetch.mock.calls[0]?.[1].body).toBe(fetch.mock.calls[2]?.[1].body);
    },
  );
  it("requires explicit review and freezes an uncertain command for identical retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(Error("Lost response"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ actionId: cardId, financialRevision: "2" }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(<CardCommandForm setup={setup} />);
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Review card command" }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Review card command" }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Amount (PHP)")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Back to edit" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry identical command" }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/money/cards/${cardId}`),
    );
    expect(fetch.mock.calls[0]?.[1].body).toBe(fetch.mock.calls[1]?.[1].body);
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body).amountMinor).toBe("10001");
  });
  it("returns rejected nonretryable evidence to editable form with a focused error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Reload current evidence",
            retryable: false,
          }),
          { status: 409 },
        ),
      ),
    );
    render(<CardCommandForm setup={setup} />);
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Review card command" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Amount (PHP)")).toBeEnabled();
  });
  it("creates unique label targets for retained forms and blocks archived card commands", () => {
    const { container } = render(
      <>
        <CardCommandForm setup={setup} />
        <CardCommandForm
          setup={{ ...setup, card: { ...setup.card, archived: true } }}
        />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByLabelText("Amount (PHP)")[1]).toBeDisabled();
  });
});
