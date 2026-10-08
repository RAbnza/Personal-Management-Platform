import Link from "next/link";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navigationItems: readonly NavigationItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined },
];

export interface AppNavigationProps {
  activePath: string;
  onNavigate?: () => void;
}

export function AppNavigation({ activePath, onNavigate }: AppNavigationProps) {
  return (
    <ul className="space-y-1">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        const isActive = activePath === item.href;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              {...(isActive ? { "aria-current": "page" as const } : {})}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              className={cn(
                "relative flex min-h-11 items-center gap-3 rounded-control px-3 py-2",
                "text-sm font-medium text-muted-foreground",
                "transition-colors duration-(--motion-duration-fast) ease-state",
                "hover:bg-accent hover:text-accent-foreground",
                "motion-reduce:transition-none",
                isActive && [
                  "bg-accent font-semibold text-accent-foreground",
                  "before:absolute before:inset-y-2 before:left-0",
                  "before:w-0.5 before:rounded-full before:bg-link",
                ],
              )}
            >
              <Icon
                aria-hidden="true"
                className="size-5 shrink-0"
                strokeWidth={1.9}
              />

              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
