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
      <section aria-label="Task guides">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground">
            A LITTLE GUIDANCE
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            What would you like to do?
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {topics.map(([title, description, href], index) => (
            <details
              key={title}
              className="rounded-panel border border-border bg-surface p-5"
            >
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                <span className="mr-3 text-sm text-muted-foreground">
                  0{index + 1}
                </span>
                {title}
              </summary>
              <p className="py-4 text-sm leading-7 text-muted-foreground">
                {description}
              </p>
              <Link href={href!} className="action-link">
                Open {title!.split(" and ")[0]!.toLowerCase()}
                <ArrowUpRight size={16} />
              </Link>
            </details>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-5">
        <Link href="/onboarding" className="action-link">
          Resume Getting Started
        </Link>
        <Link href="/settings" className="action-link">
          Manage Settings
        </Link>
        <Link href="/help/support" className="action-link">
          Support and feedback
        </Link>
      </div>
    </SettingsShell>
  );
}
