"use client";

import * as NavigationMenu from "@radix-ui/react-navigation-menu";
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
import type { ReactNode } from "react";
import { MagicDock, MagicDockItem } from "@/components/patterns/magic-dock";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import dock from "@/components/patterns/navigation-dock.module.css";
import styles from "./proofs.module.css";

type Concept = "dock" | "radix";
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

function Drawer({
  kind,
  concept,
  className,
  current,
  children,
}: {
  kind: "Modules" | "More";
  concept: Concept;
  className: string | undefined;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={className}
          aria-current={current ? "true" : undefined}
        >
          {children}
        </button>
      </DialogTrigger>
      <SheetContent
        title={`${kind} · navigation prototype`}
        description="Synthetic destinations for M1 comparison. Real routing and capability-aware integration remain M2 work."
      >
        {kind === "Modules" ? (
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
      </SheetContent>
    </Dialog>
  );
}

function TouchOrDock({
  screen,
  concept,
}: {
  screen: string;
  concept: Concept;
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
    <Drawer
      key="modules"
      kind="Modules"
      concept={concept}
      className={item}
      current={moduleActive}
    >
      {icon(<LayoutGrid aria-hidden="true" />)}
      <span>Modules</span>
    </Drawer>,
    <Drawer
      key="more"
      kind="More"
      concept={concept}
      className={item}
      current={screen === "states"}
    >
      {icon(<MoreHorizontal aria-hidden="true" />)}
      <span>More</span>
    </Drawer>,
  ];
  return concept === "dock" ? (
    <MagicDock>
      {items.map((child) => (
        <MagicDockItem key={child.key}>{child}</MagicDockItem>
      ))}
    </MagicDock>
  ) : (
    <nav className={dock.rail} aria-label="Product navigation prototype">
      <div className={dock.railList}>{items}</div>
    </nav>
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
  return (
    <>
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
        <div className={styles.desktopNavigation}>
          {concept === "dock" ? (
            <TouchOrDock screen={screen} concept={concept} />
          ) : (
            <RadixRail screen={screen} />
          )}
        </div>
      </div>
      <div className={styles.mobileNavigation}>
        <TouchOrDock screen={screen} concept={concept} />
      </div>
    </>
  );
}
