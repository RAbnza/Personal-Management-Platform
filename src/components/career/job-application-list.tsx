import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, MapPin, Plus } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import type {
  CareerApplicationOutcome,
  CareerApplicationStage,
  CareerWorkArrangement,
} from "@/modules/career/domain/application";
import type {
  JobApplicationListItem,
  ListJobApplicationsResult,
} from "@/modules/career/services/list-job-applications";

const stageLabels: Record<CareerApplicationStage, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  technical_assessment: "Technical assessment",
  final_interview: "Final interview",
  offer: "Offer",
  accepted: "Accepted",
};

const outcomeLabels: Record<CareerApplicationOutcome, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  offer_declined: "Offer declined",
  offer_expired: "Offer expired",
  employer_cancelled: "Employer cancelled",
};

const workArrangementLabels: Record<CareerWorkArrangement, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  unspecified: "Unspecified",
};

const nextActionKindLabels = {
  interview: "Interview",
  assessment: "Assessment",
  follow_up: "Follow-up",
} as const;

function formatNextAction(item: JobApplicationListItem): string | null {
  const nextAction = item.nextAction;

  if (!nextAction) {
    return null;
  }

  if (nextAction.temporalKind === "date") {
    return `${nextActionKindLabels[nextAction.eventKind]} · ${
      nextAction.eventDate ?? ""
    }`;
  }

  if (!nextAction.startsAt || !nextAction.timezone) {
    return nextAction.title;
  }

  const formatted = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: nextAction.timezone,
  }).format(new Date(nextAction.startsAt));

  return `${nextActionKindLabels[nextAction.eventKind]} · ${formatted} · ${
    nextAction.timezone
  }`;
}

function createOlderPageHref(input: {
  cursor: string;
  search: string;
  stage: CareerApplicationStage | null;
}): string {
  const query = new URLSearchParams();

  if (input.search) {
    query.set("search", input.search);
  }

  if (input.stage) {
    query.set("stage", input.stage);
  }

  query.set("cursor", input.cursor);

  return `/career/applications?${query.toString()}`;
}

export interface JobApplicationListProps {
  applications: ListJobApplicationsResult;

  search: string;
  stage: CareerApplicationStage | null;

  paginatedView?: boolean;
}

export function JobApplicationList({
  applications,
  search,
  stage,
  paginatedView = false,
}: JobApplicationListProps) {
  return (
    <div className="space-y-5">
      <Panel
        title="Applications"
        description="Each row represents one application attempt. A later application to the same company and role remains a separate attempt."
        action={
          <Link
            href="/career/applications/new"
            className={[
              "inline-flex min-h-11 items-center justify-center gap-2",
              "rounded-button border border-primary-border",
              "bg-primary px-4 py-2.5",
              "text-sm font-semibold text-primary-foreground",
              "transition-colors duration-(--motion-duration-fast) ease-state",
              "hover:bg-primary-hover active:bg-primary-pressed",
              "motion-reduce:transition-none",
            ].join(" ")}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.9} />
            Add application
          </Link>
        }
      >
        {applications.items.length === 0 ? (
          <div className="flex gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
              <BriefcaseBusiness
                aria-hidden="true"
                className="size-6"
                strokeWidth={1.8}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">
                No matching applications
              </p>

              <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
                {search || stage
                  ? "Adjust the current filters or add another application attempt."
                  : "Add a saved opportunity or an application you have already submitted."}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-208 border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                  <th scope="col" className="pb-3 pr-5">
                    Company and role
                  </th>

                  <th scope="col" className="pb-3 pr-5">
                    Stage
                  </th>

                  <th scope="col" className="pb-3 pr-5">
                    Applied
                  </th>

                  <th scope="col" className="pb-3 pr-5">
                    Location
                  </th>

                  <th scope="col" className="pb-3">
                    Next action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {applications.items.map((application) => {
                  const nextAction = formatNextAction(application);

                  return (
                    <tr key={application.applicationId} className="align-top">
                      <td className="py-4 pr-5">
                        <p className="font-semibold text-foreground">
                          {application.companyName}
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {application.roleTitle}
                        </p>

                        {application.archived ? (
                          <p className="mt-2 text-xs font-medium text-muted-foreground">
                            Archived
                          </p>
                        ) : null}
                      </td>

                      <td className="py-4 pr-5">
                        <span className="inline-flex rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-foreground">
                          {stageLabels[application.currentStage]}
                        </span>

                        {application.currentOutcome ? (
                          <p className="mt-2 text-xs font-medium text-muted-foreground">
                            {outcomeLabels[application.currentOutcome]}
                          </p>
                        ) : null}
                      </td>

                      <td className="py-4 pr-5 text-sm text-foreground">
                        {application.appliedDate ? (
                          <time dateTime={application.appliedDate}>
                            {application.appliedDate}
                          </time>
                        ) : (
                          <span className="text-muted-foreground">
                            Not submitted
                          </span>
                        )}
                      </td>

                      <td className="py-4 pr-5">
                        <div className="flex max-w-52 gap-2 text-sm text-muted-foreground">
                          <MapPin
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0"
                            strokeWidth={1.9}
                          />

                          <div>
                            <p>
                              {application.location ?? "No location recorded"}
                            </p>

                            {application.workArrangement ? (
                              <p className="mt-1 text-xs">
                                {
                                  workArrangementLabels[
                                    application.workArrangement
                                  ]
                                }
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="py-4">
                        {nextAction ? (
                          <div className="flex max-w-64 gap-2 text-sm text-foreground">
                            <CalendarClock
                              aria-hidden="true"
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              strokeWidth={1.9}
                            />

                            <span>{nextAction}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            None scheduled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <nav
        aria-label="Job application pagination"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        {paginatedView ? (
          <Link
            href={
              search || stage
                ? `/career/applications?${new URLSearchParams({
                    ...(search ? { search } : {}),
                    ...(stage ? { stage } : {}),
                  }).toString()}`
                : "/career/applications"
            }
            className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
          >
            Back to first page
          </Link>
        ) : (
          <span />
        )}

        {applications.nextCursor ? (
          <Link
            href={createOlderPageHref({
              cursor: applications.nextCursor,
              search,
              stage,
            })}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
          >
            Older applications
          </Link>
        ) : applications.items.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            End of matching applications
          </span>
        ) : null}
      </nav>
    </div>
  );
}
