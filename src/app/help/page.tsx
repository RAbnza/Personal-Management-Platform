import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { GuideTour } from "@/components/help/guide-tour";
import { getSettingsBootstrap, SettingsShell } from "../settings/_lib";
const topics = [
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
      <div className="grid gap-5 md:grid-cols-2">
        {topics.map(([title, description, href]) => (
          <Panel key={title} title={title!} description={description!}>
            <Link
              className="inline-flex min-h-11 items-center text-link underline"
              href={href!}
            >
              Open supporting workflow
            </Link>
          </Panel>
        ))}
      </div>
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
