// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { defaultNotificationPreferences } from "@/modules/time/domain/notification";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => vi.unstubAllGlobals());
it("defaults to unchecked consent and progressively discloses paired quiet hours and due-date opt-in", async () => {
  const user = userEvent.setup();
  render(<NotificationSettings preferences={defaultNotificationPreferences} />);
  expect(screen.getByRole("checkbox", { name: /I opt in/ })).not.toBeChecked();
  await user.click(screen.getByText("Quiet hours and content"));
  expect(screen.getByLabelText("Quiet hours start")).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: /Include the recorded/ }),
  ).not.toBeChecked();
});
it("freezes uncertain changes and retries byte-identical commands", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  render(<NotificationSettings preferences={defaultNotificationPreferences} />);
  await user.click(screen.getByRole("checkbox", { name: /I opt in/ }));
  await user.click(
    screen.getByRole("button", { name: "Save notification preferences" }),
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("checkbox", { name: /I opt in/ })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Retry identical save" }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1]![1].body).toBe(fetch.mock.calls[0]![1].body);
  expect(JSON.parse(fetch.mock.calls[0]![1].body).preferences.enabled).toBe(
    true,
  );
});
it("holds a stale or invalid command for reload instead of silently changing consent", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 409 })),
  );
  render(<NotificationSettings preferences={defaultNotificationPreferences} />);
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Save notification preferences" }),
    );
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "Reload preferences" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Save notification preferences" }),
  ).toBeDisabled();
});
