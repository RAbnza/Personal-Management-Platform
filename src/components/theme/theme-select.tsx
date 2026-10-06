"use client";

import { useId, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/cn";

type ThemeName = "system" | "light" | "dark";

const themeOptions: readonly {
  value: ThemeName;
  label: string;
}[] = [
  {
    value: "system",
    label: "System",
  },
  {
    value: "light",
    label: "Light",
  },
  {
    value: "dark",
    label: "Dark",
  },
];

function resolveThemeName(theme: string | undefined): ThemeName {
  if (theme === "light" || theme === "dark") {
    return theme;
  }

  return "system";
}

function subscribeToClientReady() {
  return () => {};
}

function useClientReady() {
  return useSyncExternalStore(
    subscribeToClientReady,
    () => true,
    () => false,
  );
}

export interface ThemeSelectProps {
  className?: string;
}

export function ThemeSelect({ className }: ThemeSelectProps) {
  const selectId = useId();
  const clientReady = useClientReady();
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={selectId}
        className="block text-xs font-medium text-foreground"
      >
        Theme
      </label>

      {clientReady ? (
        <select
          id={selectId}
          value={resolveThemeName(theme)}
          onChange={(event) => setTheme(event.target.value)}
          className={[
            "min-h-11 w-full rounded-control border border-input",
            "bg-surface px-3 py-2 text-sm text-foreground",
            "transition-colors duration-(--motion-duration-fast) ease-state",
            "hover:border-ring",
            "motion-reduce:transition-none",
          ].join(" ")}
        >
          {themeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <div
          aria-hidden="true"
          className="h-11 w-full rounded-control border border-disabled-border bg-surface-subtle"
        />
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        Follow your device or choose a theme for this browser.
      </p>
    </div>
  );
}
