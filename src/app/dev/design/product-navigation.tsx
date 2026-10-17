"use client";

import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import * as Popover from "@radix-ui/react-popover";
import {
  CalendarDays,
  ChevronDown,
  House,
  LayoutGrid,
  MoreHorizontal,
  Wallet,
  ListChecks,
  CircleHelp,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { MagicDock, MagicDockItem } from "@/components/patterns/magic-dock";
import dock from "@/components/patterns/navigation-dock.module.css";
import styles from "./proofs.module.css";

type Concept = "dock" | "radix";
type DockMenuKind = "Modules" | "More";
const url = (screen: string, concept: Concept) =>
  `/dev/design?screen=${screen}&nav=${concept}`;

function ModuleDestinations({
  concept,
  radix = false,
}: {
  concept: Concept;
  radix?: boolean;
}) {
  const links = [
    {
      screen: "activity",
      title: "Money",
      description: "Financial activity and exact effects",
      Icon: Wallet,
    },
    {
      screen: "migration",
      title: "Trackers",
      description: "Templates, entries and migration",
      Icon: ListChecks,
    },
  ];
  return (
    <div>
      {links.map(({ screen, title, description, Icon }) => {
        const link = (
          <a href={url(screen, concept)} className={dock.destination}>
            <Icon aria-hidden="true" />
            <span>
              {title}
              <small>{description}</small>
            </span>
          </a>
        );
        return radix ? (
          <NavigationMenu.Link asChild key={screen}>
            {link}
          </NavigationMenu.Link>
        ) : (
          <div key={screen}>{link}</div>
        );
      })}
    </div>
  );
}

function TouchOrDock({
  screen,
  concept,
  compact = false,
  menu,
  panelId,
  onToggle,
}: {
  screen: string;
  concept: Concept;
  compact?: boolean;
  menu: DockMenuKind | null;
  panelId: string;
  onToggle: (kind: DockMenuKind, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const moduleActive = ["activity", "expense", "migration"].includes(screen);
  const item = concept === "dock" ? dock.item : dock.railItem;
  const icon = (node: ReactNode) =>
    concept === "dock" ? <span className={dock.tile}>{node}</span> : node;
  const items = [
    <a
      key="home"
      className={item}
      href={url("home", concept)}
      aria-current={screen === "home" ? "page" : undefined}
    >
      {icon(<House aria-hidden="true" />)}
      <span>Home</span>
    </a>,
    <a
      key="calendar"
      className={item}
      href={url("calendar", concept)}
      aria-current={screen === "calendar" ? "page" : undefined}
    >
      {icon(<CalendarDays aria-hidden="true" />)}
      <span>Calendar</span>
    </a>,
    <button
      key="modules"
      type="button"
      className={item}
      aria-current={moduleActive ? "true" : undefined}
      aria-haspopup="dialog"
      aria-expanded={menu === "Modules"}
      aria-controls={menu === "Modules" ? panelId : undefined}
      data-dock-menu-trigger=""
      data-state={menu === "Modules" ? "open" : "closed"}
      onClick={(event) => onToggle("Modules", event)}
    >
      {icon(<LayoutGrid aria-hidden="true" />)}
      <span>Modules</span>
    </button>,
    <button
      key="more"
      type="button"
      className={item}
      aria-current={screen === "states" ? "true" : undefined}
      aria-haspopup="dialog"
      aria-expanded={menu === "More"}
      aria-controls={menu === "More" ? panelId : undefined}
      data-dock-menu-trigger=""
      data-state={menu === "More" ? "open" : "closed"}
      onClick={(event) => onToggle("More", event)}
    >
      {icon(<MoreHorizontal aria-hidden="true" />)}
      <span>More</span>
    </button>,
  ];
  return (
    <>
      {concept === "dock" ? (
        <MagicDock compact={compact}>
          {items.map((child) => (
            <MagicDockItem key={child.key} compact={compact}>
              {child}
            </MagicDockItem>
          ))}
        </MagicDock>
      ) : (
        <nav className={dock.rail} aria-label="Product navigation prototype">
          <div className={dock.railList}>{items}</div>
        </nav>
      )}
    </>
  );
}

function RadixRail({ screen }: { screen: string }) {
  const moduleActive = ["activity", "expense", "migration"].includes(screen);
  return (
    <NavigationMenu.Root
      className={dock.rail}
      aria-label="Product navigation prototype"
      delayDuration={150}
    >
      <NavigationMenu.List className={dock.railList}>
        <NavigationMenu.Item>
          <NavigationMenu.Link asChild active={screen === "home"}>
            <a href={url("home", "radix")} className={dock.railItem}>
              <House aria-hidden="true" />
              Home
            </a>
          </NavigationMenu.Link>
        </NavigationMenu.Item>
        <NavigationMenu.Item>
          <NavigationMenu.Link asChild active={screen === "calendar"}>
            <a href={url("calendar", "radix")} className={dock.railItem}>
              <CalendarDays aria-hidden="true" />
              Calendar
            </a>
          </NavigationMenu.Link>
        </NavigationMenu.Item>
        <NavigationMenu.Item>
          <NavigationMenu.Trigger
            className={dock.railItem}
            aria-current={moduleActive ? "true" : undefined}
          >
            <LayoutGrid aria-hidden="true" />
            {moduleActive
              ? screen === "migration"
                ? "Trackers"
                : "Money"
              : "Modules"}
            <ChevronDown aria-hidden="true" />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className={dock.content}>
            <p className="mb-2 px-3 text-xs font-semibold text-muted-foreground">
              YOUR MODULES · SYNTHETIC
            </p>
            <ModuleDestinations concept="radix" radix />
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        <NavigationMenu.Item>
          <NavigationMenu.Trigger
            className={dock.railItem}
            aria-current={screen === "states" ? "true" : undefined}
          >
            <MoreHorizontal aria-hidden="true" />
            More
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className={dock.content}>
            <NavigationMenu.Link asChild>
              <a href={url("states", "radix")} className={dock.destination}>
                <CircleHelp aria-hidden="true" />
                Interaction states
              </a>
            </NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}

export function ProductNavigation({
  screen,
  concept,
}: {
  screen: string;
  concept: Concept;
}) {
  const [menu, setMenu] = useState<DockMenuKind | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(true);
  const panelId = useId();
  const titleId = useId();
  const focusDestination = () =>
    panelRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
  useEffect(() => {
    if (menu) focusDestination();
  }, [menu]);
  const toggleMenu = (
    kind: DockMenuKind,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    // One shared panel anchors to the dock that was actually activated.
    anchorRef.current = event.currentTarget.closest("nav");
    triggerRef.current = event.currentTarget;
    restoreFocus.current = true;
    setMenu((current) => (current === kind ? null : kind));
  };
  const menuProps = { menu, panelId, onToggle: toggleMenu };
  return (
    <Popover.Root
      open={menu !== null}
      onOpenChange={(open) => {
        if (!open) setMenu(null);
      }}
    >
      <Popover.Anchor virtualRef={anchorRef} />
      <div className={styles.productFrame}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-panel bg-accent p-2.5 text-accent-foreground">
            <LayoutGrid aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Personal workspace</p>
            <p className="text-xs text-muted-foreground">
              Private workspace · synthetic preview
            </p>
          </div>
        </div>
        {concept === "radix" && (
          <div className={styles.desktopNavigation}>
            <RadixRail screen={screen} />
          </div>
        )}
      </div>
      {concept === "dock" && (
        <div className={styles.desktopDock}>
          <TouchOrDock
            screen={screen}
            concept={concept}
            compact
            {...menuProps}
          />
        </div>
      )}
      <div className={styles.mobileNavigation}>
        <TouchOrDock screen={screen} concept={concept} {...menuProps} />
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
            ) {
              event.preventDefault();
            } else restoreFocus.current = false;
          }}
        >
          <div className={dock.menuBody}>
            <div className={dock.menuHeading}>
              <h2 id={titleId}>{menu} · navigation prototype</h2>
              <Popover.Close
                className={dock.menuClose}
                aria-label={`Close ${menu} menu`}
              >
                Close
              </Popover.Close>
            </div>
            {menu === "Modules" ? (
              <ModuleDestinations concept={concept} />
            ) : (
              <a className={dock.destination} href={url("states", concept)}>
                <CircleHelp aria-hidden="true" />
                <span>
                  Interaction states
                  <small>Inspect shared feedback and controls</small>
                </span>
              </a>
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
  );
}
