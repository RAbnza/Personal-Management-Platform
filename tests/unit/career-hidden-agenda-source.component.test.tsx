import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  detail: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/_lib/private-app-bootstrap", () => ({
  resolvePrivateAppBootstrap: mocks.bootstrap,
}));
vi.mock("@/modules/career/services/get-job-application-detail", () => ({
  getJobApplicationDetail: mocks.detail,
}));
vi.mock("@/components/shell/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/career/application-event-actions", () => ({
  ApplicationEventActions: () => null,
}));
vi.mock("@/components/career/application-event-create-form", () => ({
  ApplicationEventCreateForm: () => null,
}));
vi.mock("@/components/career/application-stage-transition-form", () => ({
  ApplicationStageTransitionForm: () => null,
}));
vi.mock("@/components/career/career-observation-form", () => ({
  CareerObservationForm: () => null,
}));
import Page from "@/app/career/applications/[applicationId]/page";
import { JobApplicationUnavailableError } from "@/modules/career/domain/application";
import type { GetJobApplicationDetailResult } from "@/modules/career/services/get-job-application-detail";
import { paymentIds as ids } from "./helpers/debt-payment";
const detail: GetJobApplicationDetailResult = {
  application: {
    applicationId: ids.debt,
    companyName: "Example",
    roleTitle: "Engineer",
    postingUrl: null,
    sourceName: null,
    roleDescriptionSnapshot: null,
    location: null,
    workArrangement: null,
    salaryMinMinor: null,
    salaryMaxMinor: null,
    salaryCurrency: null,
    salaryPeriod: null,
    technologyTags: [],
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    resumeVersion: null,
    appliedDate: null,
    currentStage: "saved",
    currentOutcome: null,
    currentHistoryId: ids.revision,
    nextActionEventId: null,
    notes: null,
    archived: false,
    createdAt: "2026-10-08T01:00:00.000Z",
    updatedAt: "2026-10-08T01:00:00.000Z",
    version: 1,
  },
  stageHistory: [],
  events: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bootstrap.mockResolvedValue({
    kind: "ready",
    user: { id: ids.user, name: "Owner", email: "owner@example.test" },
    workspace: { id: ids.workspace, timezone: "Asia/Manila", currency: "PHP" },
    preference: {
      theme: "system",
      version: 1,
      gettingStartedDismissedAt: null,
    },
    modules: [{ moduleKey: "career", enabled: false }],
  });
  mocks.detail.mockResolvedValue(detail);
});
describe("hidden Career Agenda source", () => {
  it("opens an owned source with a hidden-module badge", async () => {
    render(
      await Page({ params: Promise.resolve({ applicationId: ids.debt }) }),
    );
    expect(screen.getByText(/Career module hidden/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Engineer" }),
    ).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.detail).toHaveBeenCalledWith({
      userId: ids.user,
      workspaceId: ids.workspace,
      applicationId: ids.debt,
    });
  });
  it("still rejects an unavailable or foreign source", async () => {
    mocks.detail.mockRejectedValue(new JobApplicationUnavailableError());
    render(
      await Page({ params: Promise.resolve({ applicationId: ids.debt }) }),
    );
    expect(
      screen.getByRole("heading", { name: "Application unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Engineer" }),
    ).not.toBeInTheDocument();
  });
});
