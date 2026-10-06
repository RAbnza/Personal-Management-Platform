"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { cn } from "@/lib/cn";

export type WorkspaceThemeName = "system" | "light" | "dark";

const themeOptions: readonly {
  value: WorkspaceThemeName;
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

function resolveThemeName(theme: string | undefined): WorkspaceThemeName {
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

export interface WorkspaceThemeSelectProps {
  theme: WorkspaceThemeName;
  version: number;
  gettingStartedDismissed: boolean;
  className?: string | undefined;
}

export function WorkspaceThemeSelect({
  theme,
  version,
  gettingStartedDismissed,
  className,
}: WorkspaceThemeSelectProps) {
  const selectId = useId();
  const descriptionId = `${selectId}-description`;
  const errorId = `${selectId}-error`;

  const router = useRouter();
  const clientReady = useClientReady();

  const { theme: clientTheme, setTheme } = useTheme();

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
   * The authenticated workspace preference is authoritative. next-themes'
   * browser storage is only a presentation cache, so reconcile it whenever
   * fresh server state arrives.
   */
  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  async function saveTheme(nextTheme: WorkspaceThemeName) {
    if (saving || nextTheme === theme) {
      return;
    }

    setSaveError(null);
    setSaving(true);

    /*
     * Apply the small reversible UI preference immediately. A failed server
     * command rolls this presentation state back below.
     */
    setTheme(nextTheme);

    try {
      const response = await fetch("/api/v1/settings/preference", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientCommandId: crypto.randomUUID(),
          expectedVersion: version,
          theme: nextTheme,
          gettingStartedDismissed,
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        setTheme(theme);
        setSaveError(
          "Your theme preference couldn't be saved. The previous workspace theme has been restored.",
        );

        /*
         * A stale-version response may mean another browser or tab changed the
         * preference. Refresh server state rather than guessing which version
         * should win.
         */
        router.refresh();
        return;
      }

      /*
       * Refresh the Server Component snapshot so both desktop and mobile theme
       * controls receive the new preference version before another mutation.
       */
      router.refresh();
    } catch {
      setTheme(theme);
      setSaveError(
        "A temporary problem prevented the theme preference from being saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  const describedBy = saveError ? `${descriptionId} ${errorId}` : descriptionId;

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
          value={resolveThemeName(clientTheme)}
          disabled={saving}
          aria-describedby={describedBy}
          onChange={(event) => {
            void saveTheme(event.target.value as WorkspaceThemeName);
          }}
          className={[
            "min-h-11 w-full rounded-control border border-input",
            "bg-surface px-3 py-2 text-sm text-foreground",
            "transition-colors duration-(--motion-duration-fast) ease-state",
            "hover:border-ring",
            "disabled:cursor-wait disabled:bg-surface-subtle disabled:text-disabled-foreground",
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

      <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
        Saved to your private workspace and restored when you sign in.
      </p>

      {saveError ? (
        <p id={errorId} role="alert" className="text-xs leading-5 text-danger">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
