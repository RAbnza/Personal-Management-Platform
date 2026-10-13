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
import { afterEach, it, describe, expect, vi } from "vitest";
import {
  SavingsGoalForm,
  SavingsReservationForm,
  SavingsLifecycleForm,
  SavingsReallocationForm,
} from "@/components/money/savings-goal-forms";
import type {
  GoalEvidence,
  CashPool,
} from "@/modules/planning/repositories/savings-goal-repository";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const id = "11111111-1111-4111-8111-111111111111",
  goal: GoalEvidence = {
    id,
    workspace_id: id,
    name: "Emergency",
    target_minor: "10000",
    target_date: null,
    status: "active",
    notes: null,
    version: 1,
    write_revision: "1",
    command_receipt_id: id,
    recorded_by_user_id: id,
    request_id: null,
  },
  account: CashPool = {
    financialAccountId: id,
    name: "Owned cash",
    accountType: "checking",
    currency: "PHP",
    accountVersion: 1,
    archived: false,
    eligible: true,
    balanceMinor: "10000",
    capacityMinor: "10000",
    reservedMinor: "0",
    availableMinor: "10000",
    shortfallMinor: "0",
  };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("reviewed conceptual savings commands", () => {
  it("reviews a full bigint target and freezes input without an unconfirmed POST", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ goalId: id, financialRevision: "2" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<SavingsGoalForm />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review goal" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Goal name"), {
      target: { value: "Emergency" },
    });
    fireEvent.change(screen.getByLabelText("Target amount (PHP)"), {
      target: { value: "92233720368547758.07" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review goal" }));
    const review = screen.getByRole("region", { name: "Review savings goal" });
    await waitFor(() =>
      expect(within(review).getByRole("heading")).toHaveFocus(),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(review).toHaveTextContent("PHP 92,233,720,368,547,758.07");
    expect(screen.getByLabelText("Goal name")).toBeDisabled();
    fireEvent.click(
      within(review).getByRole("button", { name: "Confirm and record" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetch.mock.calls[0]![1].body).fields.targetMinor).toBe(
      "9223372036854775807",
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/money/goals/${id}`),
    );
  });
  it("preserves identical reservation retry through response loss and expired authentication", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(Error("Lost response"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Sign in", retryable: false }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goalId: id, financialRevision: "3" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <SavingsReservationForm
        goal={goal}
        accounts={[account]}
        financialRevision="1"
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review reservation" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Reservation account"), {
      target: { value: id },
    });
    fireEvent.change(screen.getByLabelText("Total reservation (PHP)"), {
      target: { value: "10.00" },
    });
    fireEvent.change(screen.getByLabelText("Reason for reservation change"), {
      target: { value: "Explicit allocation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review reservation" }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retry identical command" }),
      ).toBeEnabled(),
    );
    const body = fetch.mock.calls[0]![1].body;
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
    expect(fetch.mock.calls[1]![1].body).toBe(body);
    expect(fetch.mock.calls[2]![1].body).toBe(body);
    expect(JSON.parse(body)).toMatchObject({
      reservedMinor: "1000",
      expectedVersion: 1,
      expectedFinancialRevision: "1",
    });
  });
  it("uses unique labels and explicitly reviews completion without releasing cash", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <>
        <SavingsGoalForm />
        <SavingsGoalForm />
        <SavingsLifecycleForm goal={goal} operation="complete" />
      </>,
    );
    const inputs = screen.getAllByLabelText("Goal name");
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review complete" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Reason to complete goal"), {
      target: { value: "Management milestone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review complete" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Review goal milestone" }),
    ).toHaveTextContent("never creates income");
  });
  it("reviews explicit reallocation to another goal before mutation", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const other = {
      ...goal,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Travel",
      version: 3,
    };
    render(
      <SavingsReallocationForm
        goal={goal}
        accounts={[account]}
        targets={[other]}
        financialRevision="4"
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review reallocation" }),
      ).toBeEnabled(),
    );
    for (const label of [
      "Source reservation account",
      "Destination cash account",
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value: id } });
    fireEvent.change(screen.getByLabelText("Destination savings goal"), {
      target: { value: other.id },
    });
    fireEvent.change(screen.getByLabelText("Reallocation amount (PHP)"), {
      target: { value: "5.00" },
    });
    fireEvent.change(screen.getByLabelText("Reason for reallocation"), {
      target: { value: "Explicit reassignment" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review reallocation" }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Review reallocation" }),
    ).toHaveTextContent("Travel");
  });
});
