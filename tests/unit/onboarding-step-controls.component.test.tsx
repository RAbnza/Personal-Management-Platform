import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OnboardingStepControls } from "@/components/onboarding/onboarding-step-controls";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});
const success = (state = "skipped") =>
  new Response(
    JSON.stringify({
      guideVersion: 1,
      stepKey: "add-first-account",
      state,
      completedAt: null,
      updatedAt: "2026-10-09T00:00:00.000Z",
    }),
  );
it("changes only guide progress and resumes an explicitly skipped step", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(success("pending"));
  vi.stubGlobal("fetch", fetch);
  render(
    <OnboardingStepControls
      stepKey="add-first-account"
      state="skipped"
      title="Add your first account"
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Resume: Add your first account" }),
  );
  await screen.findByRole("status");
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/onboarding/steps/add-first-account",
  );
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
    clientCommandId: expect.any(String),
    state: "pending",
  });
  expect(refresh).toHaveBeenCalledOnce();
});
it("retries an unknown outcome with identical payload even after access rejection", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Network lost"))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(success());
  vi.stubGlobal("fetch", fetch);
  render(
    <OnboardingStepControls
      stepKey="add-first-account"
      state="pending"
      title="Add your first account"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: /Retry progress change/ }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await screen.findByRole("button", { name: /Retry progress change/ });
  fireEvent.click(
    screen.getByRole("button", { name: /Retry progress change/ }),
  );
  await screen.findByRole("status");
  expect(fetch.mock.calls.map((c) => c[1].body)).toEqual(
    Array(3).fill(fetch.mock.calls[0]![1].body),
  );
});
it("does not invent success from malformed response or expose a skip on completed evidence", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}")));
  const { rerender } = render(
    <OnboardingStepControls
      stepKey="add-first-account"
      state="pending"
      title="Add your first account"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
  await screen.findByRole("alert");
  expect(refresh).not.toHaveBeenCalled();
  rerender(
    <OnboardingStepControls
      stepKey="add-first-account"
      state="completed"
      title="Add your first account"
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
