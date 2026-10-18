import {
  Wallet,
  BriefcaseBusiness,
  CalendarDays,
  ListChecks,
  Users,
  ChartNoAxesCombined,
  Settings,
  CircleHelp,
  Sparkles,
  ShieldCheck,
  Folder,
  Bell,
  Database,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavigationModule = { moduleKey: string; enabled: boolean };
export type Destination = {
  href: string;
  label: string;
  pageLabel?: string;
  description: string;
  icon: LucideIcon;
  module?: string;
  sharing?: boolean;
  local?: "Money" | "Plans" | "Settings";
  aliases?: string[];
};

export const modules: readonly Destination[] = [
  {
    href: "/money/actions",
    local: "Money",
    label: "Money",
    pageLabel: "Activity",
    description: "Activity, accounts, debts, cards and plans",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/career/applications",
    label: "Career",
    pageLabel: "Applications",
    description: "Applications and next steps",
    icon: BriefcaseBusiness,
    module: "career",
  },
  {
    href: "/calendar",
    label: "Calendar",
    description: "Agenda and source reminders",
    icon: CalendarDays,
    module: "time",
  },
  {
    href: "/trackers",
    label: "Trackers",
    description: "Private entries and versioned templates",
    icon: ListChecks,
    module: "trackers",
  },
  {
    href: "/sharing",
    label: "Shared expenses",
    description: "Groups, bills and confirmed settlements",
    icon: Users,
    sharing: true,
  },
  {
    href: "/reports",
    label: "Reports",
    description: "Financial, Career and tracker evidence",
    icon: ChartNoAxesCombined,
  },
];

export const utilities: readonly Destination[] = [
  {
    href: "/onboarding",
    label: "Getting started",
    description: "Resume your setup and starting goals",
    icon: Sparkles,
  },
  {
    href: "/settings",
    local: "Settings",
    label: "Settings",
    description: "Profile, appearance and module preferences",
    icon: Settings,
  },
  {
    href: "/settings/sessions",
    local: "Settings",
    label: "Security",
    description: "Passwords and active sessions",
    icon: ShieldCheck,
  },
  {
    href: "/help",
    label: "Help",
    description: "Task guides and replayable tour",
    icon: CircleHelp,
  },
];

export const screens: readonly Destination[] = [
  ...modules,
  ...utilities,
  {
    href: "/money/accounts",
    local: "Money",
    label: "Accounts",
    description: "Balances, history and reconciliation",
    icon: Wallet,
    module: "money",
    aliases: ["reconcile", "balance"],
  },
  {
    href: "/money/debts",
    local: "Money",
    label: "Debts",
    description: "Borrowing, payments and schedules",
    icon: Wallet,
    module: "money",
    aliases: ["repay", "settle", "borrow"],
  },
  {
    href: "/money/cards",
    local: "Money",
    label: "Cards",
    description: "Charges, statements and installments",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/money/recurring",
    local: "Plans",
    label: "Recurring",
    description: "Definitions and expected occurrences",
    icon: CalendarDays,
    module: "money",
  },
  {
    href: "/money/budgets",
    local: "Plans",
    label: "Budgets",
    description: "Limits and actual spending",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/money/goals",
    local: "Plans",
    label: "Savings goals",
    description: "Targets and reservations",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/money/forecasts",
    local: "Plans",
    label: "Forecast",
    description: "Projected cash flow, separate from actual funds",
    icon: ChartNoAxesCombined,
    module: "money",
  },
  {
    href: "/money/transactions?kind=expense",
    label: "Add expense",
    description: "Enter and review an actual purchase",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/money/transactions?kind=income",
    label: "Add income",
    description: "Record an actual receipt into an account",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/money/transfers",
    label: "Transfer money",
    description: "Move existing money between accounts",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/career/applications/new",
    label: "Add application",
    description: "Record a Career application",
    icon: BriefcaseBusiness,
    module: "career",
  },
  {
    href: "/trackers/templates/new",
    label: "Create tracker template",
    description: "Prepare a versioned template definition",
    icon: ListChecks,
    module: "trackers",
    aliases: ["templates"],
  },
  {
    href: "/settings/files",
    local: "Settings",
    label: "Files",
    description: "Private evidence and attachments",
    icon: Folder,
  },
  {
    href: "/settings/portability",
    local: "Settings",
    label: "Data and portability",
    description: "Import, export and restore",
    icon: Database,
    aliases: ["backup", "restore", "CSV"],
  },
  {
    href: "/settings/notifications",
    local: "Settings",
    label: "Notifications",
    description: "Optional email and reminder settings",
    icon: Bell,
  },
  {
    href: "/settings/lifecycle",
    local: "Settings",
    label: "Account lifecycle",
    description: "Review deletion status and consequences",
    icon: UserRound,
  },
  {
    href: "/help/support",
    label: "Support",
    description: "Prepare feedback without automatic transmission",
    icon: CircleHelp,
  },
];

export function availableDestinations(
  items: readonly Destination[],
  preferences: readonly NavigationModule[] | null,
  sharing: boolean,
) {
  return items.filter(
    (item) =>
      (!item.sharing || sharing) &&
      (!item.module ||
        preferences?.some((m) => m.moduleKey === item.module && m.enabled)),
  );
}

export const isDestinationCurrent = (path: string, href: string) =>
  path === href || (href !== "/" && path.startsWith(`${href}/`));

/** Module membership is broader than its landing-page URL. */
export function activeModule(path: string) {
  return modules.find(
    (item) =>
      path === item.href.split("/").slice(0, 2).join("/") ||
      path.startsWith(item.href.split("/").slice(0, 2).join("/") + "/"),
  );
}
export function localDestinations(group: "Money" | "Plans" | "Settings") {
  return screens
    .filter((item) => item.local === group)
    .map((item) => ({
      ...item,
      label: item.pageLabel ?? item.label,
    }));
}

export type BreadcrumbItem = { label: string; href?: string };
export type BreadcrumbLabels = Readonly<Record<string, string>>;
// Only real landing pages receive links. Dynamic labels are supplied by the
// already-authorized page, never fetched or cached by the navigation shell.
const locations: Record<string, { label: string; landing?: string }> = {
  "/money": { label: "Money", landing: "/money/actions" },
  "/career": { label: "Career", landing: "/career/applications" },

  "/money/transactions": { label: "Record transaction" },
  "/money/accounts/:id": { label: "Account", landing: "history" },
  "/money/debts/:id": { label: "Debt", landing: "self" },
  "/money/actions/:id": { label: "Transaction", landing: "self" },
  "/money/cards/:id": { label: "Card", landing: "self" },
  "/money/cards/:id/statements": { label: "Statements", landing: "self" },
  "/money/cards/:id/statements/:id": { label: "Statement", landing: "self" },
  "/money/cards/:id/installments": { label: "Installments", landing: "self" },
  "/money/cards/:id/installments/:id": {
    label: "Installment plan",
    landing: "self",
  },
  "/money/cards/:id/commands": { label: "Card commands" },
  "/money/recurring/:id": { label: "Recurring plan", landing: "self" },
  "/money/recurring/occurrences": { label: "Occurrences" },
  "/money/recurring/occurrences/:id": { label: "Occurrence", landing: "self" },
  "/money/budgets/:id": { label: "Budget", landing: "self" },
  "/money/goals/:id": { label: "Savings goal", landing: "self" },
  "/career/applications/:id": { label: "Application", landing: "self" },
  "/calendar/events": { label: "Events", landing: "/calendar" },
  "/calendar/events/:id": { label: "Event", landing: "self" },
  "/calendar/reminders": { label: "Reminder settings" },
  "/sharing/:id": { label: "Group", landing: "self" },
  "/sharing/:id/expenses": { label: "Expenses" },
  "/sharing/:id/expenses/:id": { label: "Expense", landing: "self" },
  "/sharing/:id/people": { label: "People" },
  "/sharing/:id/people/:id": { label: "Participant", landing: "self" },
  "/sharing/:id/effects": { label: "Source effect" },
  "/trackers/templates": { label: "Templates", landing: "/trackers" },
  "/trackers/templates/:id": { label: "Template", landing: "self" },
  "/trackers/:id": { label: "Tracker", landing: "self" },
  "/trackers/entries": { label: "Entries" },
  "/trackers/entries/:id": { label: "Entry", landing: "self" },
  "/trackers/versions": { label: "Versions" },
  "/trackers/versions/:id": { label: "Version", landing: "self" },
  "/trackers/migrations": { label: "Migrations" },
  "/trackers/migrations/:id": { label: "Migration", landing: "self" },
  "/reports/financial": { label: "Financial report", landing: "self" },
  "/reports/career": { label: "Career report", landing: "self" },
  "/trackers/reports": { label: "Tracker reports", landing: "self" },
};
const taskLabels: Record<string, string> = {
  history: "Account history",
  reconcile: "Check balance",
  pay: "Record payment",
  settle: "Settle debt",
  "revise-schedule": "Revise schedule",
  borrow: "Record borrowing",
  import: "Import debt",
  new: "Create",
  revise: "Revise",
  allocations: "Allocations",
  applications: "Applications",
  detail: "Details",
  invitations: "Invitations",
  entries: "Entries",
  migration: "Migration",
  edit: "Edit",
  versions: "Versions",
};
export function breadcrumbsFor(
  path: string,
  labels: BreadcrumbLabels = {},
): BreadcrumbItem[] {
  const parts = path.split("?")[0]!.split("/").filter(Boolean);
  const result: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  const pattern: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i]!;
    const prefix = "/" + parts.slice(0, i + 1).join("/");
    const isId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment);
    pattern.push(isId ? ":id" : segment);
    const location = locations["/" + pattern.join("/")];
    const destination = screens.find((item) => item.href === prefix);
    // Don't expose arbitrary URL segments (IDs, query values or source kinds).
    if (!location && !destination && i < parts.length - 1) continue;
    const label =
      labels[prefix] ||
      location?.label ||
      destination?.pageLabel ||
      destination?.label ||
      taskLabels[segment] ||
      "Details";
    const landing = location?.landing;
    const href =
      landing === "self"
        ? prefix
        : landing?.startsWith("/")
          ? landing
          : landing
            ? prefix + "/" + landing
            : destination?.href;
    result.push({ label, ...(href ? { href } : {}) });
  }
  const current = result[result.length - 1]!;
  delete current.href;
  for (const item of result) if (item.href === path) delete item.href;
  return result;
}
