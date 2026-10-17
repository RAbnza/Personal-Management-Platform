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
  description: string;
  icon: LucideIcon;
  module?: string;
  sharing?: boolean;
  aliases?: string[];
};

export const modules: readonly Destination[] = [
  {
    href: "/money/actions",
    label: "Money",
    description: "Activity, accounts, debts, cards and plans",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/career/applications",
    label: "Career",
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
    label: "Settings",
    description: "Profile, appearance and module preferences",
    icon: Settings,
  },
  {
    href: "/settings/sessions",
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
    label: "Accounts",
    description: "Balances, history and reconciliation",
    icon: Wallet,
    module: "money",
    aliases: ["reconcile", "balance"],
  },
  {
    href: "/money/debts",
    label: "Debts",
    description: "Borrowing, payments and schedules",
    icon: Wallet,
    module: "money",
    aliases: ["repay", "settle", "borrow"],
  },
  {
    href: "/money/cards",
    label: "Cards",
    description: "Charges, statements and installments",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/money/recurring",
    label: "Recurring",
    description: "Definitions and expected occurrences",
    icon: CalendarDays,
    module: "money",
  },
  {
    href: "/money/budgets",
    label: "Budgets",
    description: "Limits and actual spending",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/money/goals",
    label: "Savings goals",
    description: "Targets and reservations",
    icon: Wallet,
    module: "money",
  },
  {
    href: "/money/forecasts",
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
    label: "Files",
    description: "Private evidence and attachments",
    icon: Folder,
  },
  {
    href: "/settings/portability",
    label: "Data and portability",
    description: "Import, export and restore",
    icon: Database,
    aliases: ["backup", "restore", "CSV"],
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    description: "Optional email and reminder settings",
    icon: Bell,
  },
  {
    href: "/settings/lifecycle",
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
