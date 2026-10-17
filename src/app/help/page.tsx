import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GuideTour } from "@/components/help/guide-tour";
import { getSettingsBootstrap, SettingsShell } from "../settings/_lib";
const topics = [
  [
    "Private trackers and history",
    "Start with Learning, Books or Personal Tasks. Custom fields publish immutable versions; migrate populated trackers only after reviewing mappings and invalid entries. Reports separate current state, recorded completion transitions and migration activity. Manual completion dates are not recorded transition dates. Archive retains history; hiding navigation leaves Calendar and reminder switches separate.",
    "/trackers",
  ],
  [
    "Money and corrections",
    "Opening balances are not income. Internal transfers and principal repayments are not spending. A later refund uses its actual date and offsets spending; corrections preserve original evidence through reversal and replacement.",
    "/money/transactions",
  ],
  [
    "Debt payments and schedules",
    "Accounting components explain cash and liability effects. Contractual allocations separately explain due satisfaction; confirm them visibly. Schedule changes preserve prior versions.",
    "/money/debts",
  ],
  [
    "Career and Calendar",
    "Archive an application to retain its history and remove active due prompts. Reschedule or cancel at the source; reminder acknowledgement is independent. A personal event cancellation retains its record.",
    "/calendar",
  ],
  [
    "Reports and exports",
    "Choose a shared period and drill down to the records behind each number. Hidden modules retain financial and Career history; coverage is still disclosed. Each CSV describes its selected records and dates.",
    "/reports",
  ],
  [
    "Archive, hide or delete",
    "Hiding retains data and can be reversed in Settings. Archived financial accounts retain history and cannot be deleted while referenced. Posted financial evidence requires explicit corrections. Whole-workspace deletion also removes the sign-in identity after grace.",
    "/settings/lifecycle",
  ],
];
export default async function HelpPage() {
  const b = await getSettingsBootstrap();
  return (
    <SettingsShell bootstrap={b} title="Help and guides" path="/help">
      <GuideTour />
      <section
        aria-label="Task guides"
        className="rounded-panel border border-border bg-surface px-4 sm:px-6"
      >
        <ul className="divide-y divide-border">
          {topics.map(([title, description, href]) => (
            <li
              key={title}
              className="grid gap-3 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
            >
              <Link
                href={href!}
                className="inline-flex min-h-11 items-start gap-2 py-2 font-semibold text-link underline-offset-4 hover:underline"
              >
                {title}
                <ArrowUpRight
                  className="mt-1 size-4 shrink-0"
                  aria-hidden="true"
                />
              </Link>
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap gap-5">
        <Link href="/onboarding" className="text-link underline">
          Resume Getting Started
        </Link>
        <Link href="/settings" className="text-link underline">
          Manage Settings
        </Link>
        <Link href="/help/support" className="text-link underline">
          Support and feedback
        </Link>
      </div>
    </SettingsShell>
  );
}
