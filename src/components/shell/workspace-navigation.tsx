"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import {
  House,
  CalendarDays,
  LayoutGrid,
  MoreHorizontal,
  Search,
  Settings,
} from "lucide-react";
import { MagicDock, MagicDockItem } from "@/components/patterns/magic-dock";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  WorkspaceThemeSelect,
  type WorkspaceThemeName,
} from "@/components/theme/workspace-theme-select";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useNavigationCapabilities } from "./navigation-capabilities";
import {
  modules,
  screens,
  utilities,
  availableDestinations,
  isDestinationCurrent,
  type Destination,
  type NavigationModule,
} from "./navigation-model";
import dock from "@/components/patterns/navigation-dock.module.css";
import styles from "./shell.module.css";

type Menu = "Modules" | "More";
export interface WorkspaceNavigationProps {
  activePath: string;
  task?: boolean;
  userName: string;
  userEmail: string;
  initialModules?: readonly NavigationModule[];
  workspaceTheme: WorkspaceThemeName;
  workspacePreferenceVersion: number;
  gettingStartedDismissed: boolean;
}

export function WorkspaceNavigation(props: WorkspaceNavigationProps) {
  const { activePath, userEmail, initialModules } = props;
  const { sharing } = useNavigationCapabilities();
  const router = useRouter();
  const [preferences, setPreferences] = useState<
    readonly NavigationModule[] | null
  >(initialModules ?? null);
  const [unavailable, setUnavailable] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const commandTrigger = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(true);
  const panelId = useId();
  const titleId = useId();

  // No private cache or record index: only the existing authenticated capability snapshot.
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const read = async () => {
      try {
        const response = await fetch("/api/v1/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Navigation unavailable");
        const data = await response.json();
        if (live) {
          setPreferences(data.modules ?? []);
          setUnavailable(false);
        }
      } catch {
        if (live) {
          setPreferences(null);
          setUnavailable(true);
        }
      }
    };
    if (!initialModules) void read();
    window.addEventListener("pmp-module-preferences-changed", read);
    return () => {
      live = false;
      controller.abort();
      window.removeEventListener("pmp-module-preferences-changed", read);
    };
  }, [activePath, userEmail, initialModules]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        commandTrigger.current?.getClientRects().length &&
        !(
          target instanceof Element &&
          target.closest("input,textarea,select,[contenteditable=true]")
        )
      ) {
        event.preventDefault();
        setMenu(null);
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const focusDestination = useCallback(
    () =>
      panelRef.current
        ?.querySelector<HTMLElement>("a[href],button:not([data-close-menu])")
        ?.focus(),
    [],
  );
  useEffect(() => {
    if (menu) focusDestination();
  }, [menu, focusDestination]);

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    const kind = event.currentTarget.dataset.menu as Menu;
    anchorRef.current = event.currentTarget.closest("nav");
    triggerRef.current = event.currentTarget;
    restoreFocus.current = true;
    setMenu((current) => (current === kind ? null : kind));
  };
  const closeForNavigation = () => {
    restoreFocus.current = false;
    setMenu(null);
  };
  const moduleLinks = availableDestinations(modules, preferences, sharing);
  const commandLinks = availableDestinations(screens, preferences, sharing);
  const moduleActive = [
    "/money",
    "/career",
    "/trackers",
    "/sharing",
    "/reports",
  ].some((path) => activePath.startsWith(path));
  const moreActive = ["/settings", "/help", "/onboarding"].some((path) =>
    activePath.startsWith(path),
  );
  const addExpense =
    !props.task &&
    preferences?.some((item) => item.moduleKey === "money" && item.enabled) &&
    (activePath === "/" || activePath.startsWith("/money"));
  const renderDestinations = (items: readonly Destination[]) =>
    items.map(({ href, label, description, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        className={dock.destination}
        onClick={closeForNavigation}
        aria-current={
          isDestinationCurrent(activePath, href) ? "page" : undefined
        }
      >
        <Icon aria-hidden="true" />
        <span>
          {label} <small>{description}</small>
        </span>
      </Link>
    ));
  const items = [
    <Link
      key="home"
      href="/"
      className={dock.item}
      aria-current={activePath === "/" ? "page" : undefined}
    >
      <span className={dock.tile}>
        <House aria-hidden="true" />
      </span>
      <span>Home</span>
    </Link>,
    <Link
      key="calendar"
      href="/calendar"
      className={dock.item}
      aria-current={activePath.startsWith("/calendar") ? "page" : undefined}
    >
      <span className={dock.tile}>
        <CalendarDays aria-hidden="true" />
      </span>
      <span>Calendar</span>
    </Link>,
    ...(["Modules", "More"] as const).map((kind) => {
      const Icon = kind === "Modules" ? LayoutGrid : MoreHorizontal;
      return (
        <button
          key={kind}
          type="button"
          className={dock.item}
          aria-current={
            (kind === "Modules" ? moduleActive : moreActive)
              ? "true"
              : undefined
          }
          aria-haspopup="dialog"
          aria-expanded={menu === kind}
          aria-controls={menu === kind ? panelId : undefined}
          data-dock-menu-trigger=""
          data-state={menu === kind ? "open" : "closed"}
          data-menu={kind}
          onClick={toggle}
        >
          <span className={dock.tile}>
            <Icon aria-hidden="true" />
          </span>
          <span>{kind}</span>
        </button>
      );
    }),
  ];
  return (
    <>
      <button
        ref={commandTrigger}
        type="button"
        className={styles.findButton}
        onClick={() => {
          setMenu(null);
          setCommandOpen(true);
        }}
      >
        <Search aria-hidden="true" className="size-4" />
        <span>Find a screen</span>
        <kbd className="hidden text-xs text-muted-foreground sm:inline">
          Ctrl K
        </kbd>
      </button>
      {addExpense && (
        <Link
          href="/money/transactions?kind=expense"
          className="inline-flex min-h-11 items-center rounded-button bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Add expense
        </Link>
      )}
      <Popover.Root
        open={menu !== null}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
      >
        <Popover.Anchor virtualRef={anchorRef} />
        <div className={styles.dockPosition}>
          <MagicDock compact label="Primary">
            {items.map((item) => (
              <MagicDockItem key={item.key} compact>
                {item}
              </MagicDockItem>
            ))}
          </MagicDock>
        </div>
        <Popover.Portal>
          <Popover.Content
            ref={panelRef}
            id={panelId}
            aria-labelledby={titleId}
            className={dock.expansion}
            side="top"
            align="center"
            sideOffset={2}
            collisionPadding={12}
            avoidCollisions={false}
            hideWhenDetached
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              focusDestination();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (restoreFocus.current)
                triggerRef.current?.focus({ preventScroll: true });
            }}
            onInteractOutside={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("[data-dock-menu-trigger]")
              )
                event.preventDefault();
              else restoreFocus.current = false;
            }}
          >
            <div className={dock.menuBody}>
              <div className={dock.menuHeading}>
                <h2 id={titleId}>
                  {menu === "Modules"
                    ? "Your modules"
                    : "Workspace and account"}
                </h2>
                <Popover.Close
                  data-close-menu
                  className={dock.menuClose}
                  aria-label={`Close ${menu} menu`}
                >
                  Close
                </Popover.Close>
              </div>
              {menu === "Modules" ? (
                <>
                  {preferences === null && (
                    <p
                      role="status"
                      className="px-3 py-2 text-sm text-muted-foreground"
                    >
                      {unavailable
                        ? "Module availability could not be loaded. Settings and source links remain available; reload to retry."
                        : "Loading enabled modules…"}
                    </p>
                  )}
                  {renderDestinations(moduleLinks)}
                  <Link
                    href="/settings?section=modules"
                    className={dock.destination}
                    onClick={closeForNavigation}
                  >
                    <Settings aria-hidden="true" />
                    <span>
                      Manage modules
                      <small>
                        Hidden modules keep their records and independent Agenda
                        settings.
                      </small>
                    </span>
                  </Link>
                </>
              ) : (
                <>
                  <div className="border-b border-border px-3 py-3">
                    <p className="font-semibold">{props.userName}</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {userEmail}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your account · Shared group records retain their own
                      authority.
                    </p>
                  </div>
                  {renderDestinations(utilities)}
                  <div className="border-t border-border px-3 py-3">
                    <WorkspaceThemeSelect
                      theme={props.workspaceTheme}
                      version={props.workspacePreferenceVersion}
                      gettingStartedDismissed={props.gettingStartedDismissed}
                    />
                    <SignOutButton className="mt-3" />
                  </div>
                </>
              )}
            </div>
            <Popover.Arrow
              className={dock.expansionArrow}
              width={12}
              height={6}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogContent
          title="Find a screen"
          description="Search available screens and task names. Your private records are never indexed."
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            commandTrigger.current?.focus();
          }}
        >
          <Command label="Screen and action search">
            <Command.Input
              className={styles.commandInput}
              placeholder="Try accounts, repay or restore…"
            />
            <Command.List className={styles.commandList}>
              <Command.Empty className="p-3 text-sm">
                No matching available screens.
              </Command.Empty>
              <Command.Item
                className={styles.commandItem}
                value="Home dashboard"
                onSelect={() => {
                  setCommandOpen(false);
                  router.push("/");
                }}
              >
                <House aria-hidden="true" />
                Home
              </Command.Item>
              {commandLinks.map(
                ({ href, label, description, icon: Icon, aliases }) => (
                  <Command.Item
                    key={href}
                    className={styles.commandItem}
                    value={`${label} ${description} ${aliases?.join(" ") ?? ""}`}
                    onSelect={() => {
                      setCommandOpen(false);
                      router.push(href);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>
                      {label} <small>{description}</small>
                    </span>
                  </Command.Item>
                ),
              )}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
