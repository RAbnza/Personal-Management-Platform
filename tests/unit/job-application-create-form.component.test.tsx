import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JobApplicationCreateForm } from "@/components/career/job-application-create-form";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerMocks.push,
    refresh: routerMocks.refresh,
  }),
}));

const fetchMock = vi.fn();

function successResponse() {
  return new Response(
    JSON.stringify({
      applicationId: "11111111-1111-4111-8111-111111111111",

      initialHistoryId: "22222222-2222-4222-8222-222222222222",

      version: 1,
    }),
    {
      status: 201,

      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

async function fillAppliedApplication() {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Company"), "Example Technologies");

  await user.type(screen.getByLabelText("Role title"), "Full Stack Developer");

  await user.type(screen.getByLabelText("Applied date"), "2026-10-07");

  await user.type(
    screen.getByLabelText("Technologies"),
    "TypeScript, React, PostgreSQL",
  );

  return user;
}

beforeEach(() => {
  routerMocks.push.mockReset();
  routerMocks.refresh.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JobApplicationCreateForm", () => {
  it("creates a submitted application with explicit applied and stage dates", async () => {
    fetchMock.mockResolvedValueOnce(successResponse());

    render(<JobApplicationCreateForm workspaceCurrency="PHP" />);

    const user = await fillAppliedApplication();

    await user.click(
      screen.getByRole("button", {
        name: "Save application",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    expect(body).toMatchObject({
      clientCommandId: expect.any(String),

      companyName: "Example Technologies",

      roleTitle: "Full Stack Developer",

      appliedDate: "2026-10-07",

      initialStage: "applied",

      initialOutcome: null,

      initialStageEffectiveDate: "2026-10-07",

      technologyTags: ["TypeScript", "React", "PostgreSQL"],

      allowPossibleDuplicate: false,
    });

    expect(routerMocks.push).toHaveBeenCalledWith("/career/applications");
  });

  it("creates a saved opportunity without an applied date", async () => {
    fetchMock.mockResolvedValueOnce(successResponse());

    render(<JobApplicationCreateForm workspaceCurrency="PHP" />);

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Company"), "Saved Opportunity Inc.");

    await user.type(screen.getByLabelText("Role title"), "Software Engineer");

    await user.selectOptions(screen.getByLabelText("Current stage"), "saved");

    await user.type(screen.getByLabelText("Saved date"), "2026-10-07");

    await user.click(
      screen.getByRole("button", {
        name: "Save application",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    expect(body).toMatchObject({
      companyName: "Saved Opportunity Inc.",

      roleTitle: "Software Engineer",

      appliedDate: null,

      initialStage: "saved",

      initialOutcome: null,

      initialStageEffectiveDate: "2026-10-07",
    });
  });

  it("requires explicit confirmation before creating a separate duplicate attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "POSSIBLE_DUPLICATE_APPLICATION",

            message: "A matching company and role already exists.",

            retryable: false,
          }),
          {
            status: 409,

            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(successResponse());

    render(<JobApplicationCreateForm workspaceCurrency="PHP" />);

    const user = await fillAppliedApplication();

    await user.click(
      screen.getByRole("button", {
        name: "Save application",
      }),
    );

    expect(
      await screen.findByText("Possible duplicate application"),
    ).toBeInTheDocument();

    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Create separate attempt",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
    );

    expect(secondBody.clientCommandId).not.toBe(firstBody.clientCommandId);

    expect(secondBody).toMatchObject({
      companyName: firstBody.companyName,

      roleTitle: firstBody.roleTitle,

      allowPossibleDuplicate: true,
    });
  });

  it("retries an unconfirmed save with the identical command", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "TEMPORARY_UNAVAILABLE",

            retryable: true,
          }),
          {
            status: 503,

            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(successResponse());

    render(<JobApplicationCreateForm workspaceCurrency="PHP" />);

    const user = await fillAppliedApplication();

    await user.click(
      screen.getByRole("button", {
        name: "Save application",
      }),
    );

    expect(
      await screen.findByText("Save outcome unconfirmed"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Retry same save",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
    );

    expect(secondBody).toEqual(firstBody);
  });
});
