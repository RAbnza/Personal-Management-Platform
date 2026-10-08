import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
import { ReminderControls } from "@/components/calendar/reminder-controls";
import type { ReminderView } from "@/modules/time/domain/reminder";
const view: ReminderView = {
  target: {
    sourceKind: "personal_event",
    sourceId: "33333333-3333-4333-8333-333333333333",
  },
  snapshot: "a".repeat(64),
  mode: "inherit",
  timezone: "Asia/Manila",
  moduleRemindersEnabled: true,
  moduleHidden: false,
  agendaVisible: true,
  eligible: true,
  sourceVersion: 1,
  occurrenceKey: "single",
  sourceGeneration: 1,
  title: "Interview",
  sourceRoute: "/calendar/events/33333333-3333-4333-8333-333333333333",
  dueDate: "2026-10-01",
  remainingMinor: null,
  configuration: [{ offsetDays: 0, localTime: "09:00" }],
  rules: [
    {
      id: null,
      key: "0:09:00",
      offsetDays: 0,
      localTime: "09:00",
      generation: 1,
      scheduledFor: "2026-10-01T01:00:00.000Z",
      state: "active",
      snoozedUntil: null,
      occurrenceId: null,
      version: 0,
      due: true,
    },
  ],
  history: [],
};
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("accessible reminder confirmation and retry", () => {
  it("requires an explicit review before saving and retains source labels", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ saved: true }))
      .mockResolvedValueOnce(Response.json(view));
    vi.stubGlobal("fetch", fetcher);
    render(<ReminderControls initial={view} />);
    expect(screen.getByText(/Due reminder/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reminder" }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /source date and payment\/completion state stay unchanged/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm reminder change" }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).action).toEqual({
      kind: "dismiss",
      ruleKey: "0:09:00",
    });
  });
  it("locks uncertain saves and retries the exact command", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(Error("Disconnected"))
      .mockResolvedValueOnce(Response.json({ saved: true }))
      .mockResolvedValueOnce(Response.json(view));
    vi.stubGlobal("fetch", fetcher);
    render(<ReminderControls initial={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reminder" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm reminder change" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Reminder mode")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same reminder command" }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body);
  });
  it("requires reload after a stale-source rejection", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Source changed" }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json(view));
    vi.stubGlobal("fetch", fetcher);
    render(<ReminderControls initial={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reminder" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm reminder change" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Dismiss reminder" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload reminder state" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dismiss reminder" }),
      ).toHaveProperty("disabled", false),
    );
  });
  it("does not call a confirmed save uncertain when its subsequent read fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ saved: true }))
      .mockRejectedValueOnce(Error());
    vi.stubGlobal("fetch", fetcher);
    render(<ReminderControls initial={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reminder" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm reminder change" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByText(/change saved.*updated read is unavailable/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry same reminder command" }),
    ).toBeNull();
  });
  it("resolved sources expose history without editable reminder controls", () => {
    render(
      <ReminderControls initial={{ ...view, eligible: false, rules: [] }} />,
    );
    expect(
      screen.getByText(/resolved, cancelled, replaced or archived/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Dismiss reminder" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Review reminder settings" }),
    ).toBeNull();
  });
});
