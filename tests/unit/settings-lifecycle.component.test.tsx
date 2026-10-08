// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LifecycleControls } from "@/components/settings/lifecycle-controls";
import {
  ProfileForm,
  ModulePreferenceForm,
} from "@/components/settings/settings-forms";
import { GuideTour } from "@/components/help/guide-tour";
import { SessionControls } from "@/components/settings/session-controls";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const preview = {
  snapshot: "a".repeat(64),
  manifest: {
    schemaVersion: 1,
    workspaceVersion: 1,
    profileVersion: 1,
    financialRevision: "3",
    records: [{ area: "finance", kind: "posting", count: "12" }],
    identity: "All",
    files: "None",
    sharedHistory: "None",
  },
  policy: {
    graceDays: 7,
    backupRetention: "Backups have not been verified.",
    exportCoverage: "CSV is not a backup.",
  },
};
beforeEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
describe("Settings and lifecycle confirmation", () => {
  it("requires review, typed confirmation and server password verification", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(
      <LifecycleControls
        scopeKey="test-workspace"
        preview={preview}
        request={null}
        retention={preview.policy.backupRetention}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: "Confirm whole-workspace deletion",
      }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Review deletion scope" }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm whole-workspace deletion" }),
    ).toBeDisabled();
    await user.click(screen.getByLabelText(/I reviewed/));
    await user.type(
      screen.getByLabelText("Type DELETE MY WORKSPACE AND ACCOUNT"),
      "DELETE MY WORKSPACE AND ACCOUNT",
    );
    expect(fetch).not.toHaveBeenCalled();
    await user.type(
      screen.getByLabelText("Current password"),
      "test-passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Verify password" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Confirm whole-workspace deletion",
        }),
      ).toBeEnabled(),
    );
    expect(fetch.mock.calls[0]![0]).toBe("/api/auth/reauthenticate");
  });
  it("locks an uncertain deletion and retries its exact saved command", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.includes("reauthenticate")
          ? new Response("{}", { status: 200 })
          : new Response("{}", { status: 503 }),
      );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(
      <LifecycleControls
        scopeKey="test-workspace"
        preview={preview}
        request={null}
        retention="No immediate backup erasure"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Review deletion scope" }),
    );
    await user.click(screen.getByLabelText(/I reviewed/));
    await user.type(
      screen.getByLabelText("Type DELETE MY WORKSPACE AND ACCOUNT"),
      "DELETE MY WORKSPACE AND ACCOUNT",
    );
    await user.type(
      screen.getByLabelText("Current password"),
      "test-passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Verify password" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm whole-workspace deletion" }),
    );
    await screen.findByText(/Save outcome unknown/);
    expect(
      screen.getByLabelText("Type DELETE MY WORKSPACE AND ACCOUNT"),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Retry same deletion command" }),
    );
    const writes = fetch.mock.calls.filter((c) => c[0] === "/api/v1/lifecycle");
    expect(writes).toHaveLength(2);
    expect(writes[0]![1].body).toBe(writes[1]![1].body);
  });
  it("offers only cancellation during pending grace and no normal workspace form", () => {
    render(
      <LifecycleControls
        scopeKey="test-workspace"
        preview={null}
        request={{
          id: "1",
          state: "pending",
          requestedAt: "2026-10-01T00:00:00Z",
          purgeAfter: "2099-10-01T00:00:00Z",
          completedAt: null,
        }}
        retention="Backups may remain"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Review deletion scope" }),
    ).not.toBeInTheDocument();
  });
  it("never restores another workspace's uncertain deletion command", async () => {
    sessionStorage.setItem(
      "pmp-deletion-command:other-workspace",
      JSON.stringify({
        clientCommandId: "other-command",
        expectedSnapshot: preview.snapshot,
        confirmation: "DELETE MY WORKSPACE AND ACCOUNT",
      }),
    );
    render(
      <LifecycleControls
        scopeKey="test-workspace"
        preview={preview}
        request={null}
        retention="Backups may remain"
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review deletion scope" }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText(/An earlier deletion command/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry same deletion command" }),
    ).not.toBeInTheDocument();
  });
  it("does not offer cancellation after purging has started", () => {
    render(
      <LifecycleControls
        scopeKey="test-workspace"
        preview={null}
        request={{
          id: "1",
          state: "purging",
          requestedAt: "2026-10-01T00:00:00Z",
          purgeAfter: "2026-10-02T00:00:00Z",
          completedAt: null,
        }}
        retention="Backups may remain"
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Confirm cancellation" }),
    ).not.toBeInTheDocument();
  });
  it("retries an uncertain profile save without a new command identity", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error());
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(
      <ProfileForm
        profile={{ displayName: "Old", version: 1, lifecycle: "active" }}
      />,
    );
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "New");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText(/Save outcome unknown/);
    await user.click(
      screen.getByRole("button", { name: "Retry same profile change" }),
    );
    expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
  });
  it("shows module retention and independent Agenda/reminder controls", async () => {
    render(
      <ModulePreferenceForm
        module={{
          moduleKey: "career",
          enabled: false,
          agendaVisible: true,
          remindersEnabled: true,
          version: 2,
        }}
      />,
    );
    expect(screen.getByText(/Hidden; records retained/)).toBeVisible();
    expect(
      screen.getByLabelText("Show source deadlines in Agenda"),
    ).toBeChecked();
    expect(screen.getByLabelText("Enable in-app reminders")).toBeChecked();
  });
  it("replays instructional guidance without any business writes", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<GuideTour />);
    await user.click(screen.getByRole("button", { name: "Start tour" }));
    for (let i = 0; i < 4; i++)
      await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish tour" }));
    await user.click(screen.getByRole("button", { name: "Start tour" }));
    expect(screen.getByText("Step 1 of 5")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("loads safe session metadata and requires explicit revocation review", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sessions: [
            {
              id: "1",
              current: true,
              device: "Edge on Windows",
              createdAt: "2026-10-01T00:00:00Z",
              lastActiveAt: "2026-10-01T00:00:00Z",
              expiresAt: "2026-10-08T00:00:00Z",
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<SessionControls />);
    await screen.findByText(/Current session/);
    await user.click(
      screen.getByRole("button", { name: "Sign out all devices" }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm revocation" }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
