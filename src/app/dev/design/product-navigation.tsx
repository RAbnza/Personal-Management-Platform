"use client";

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
  NavigationCapsule,
  CapsuleLink,
  capsuleItem,
} from "@/components/patterns/navigation-capsule";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import styles from "./proofs.module.css";

function Destinations({ screen, mobile }: { screen: string; mobile: boolean }) {
  const moduleActive = ["activity", "expense", "migration"].includes(screen);
  const currentModule = screen === "migration" ? "Trackers" : "Money";
  return (
    <>
      <CapsuleLink
        href="/dev/design?screen=home"
        aria-current={screen === "home" ? "page" : undefined}
      >
        <House aria-hidden="true" className="size-5" />
        <span>Home</span>
      </CapsuleLink>
      <CapsuleLink
        href="/dev/design?screen=calendar"
        aria-current={screen === "calendar" ? "page" : undefined}
      >
        <CalendarDays aria-hidden="true" className="size-5" />
        <span>Calendar</span>
      </CapsuleLink>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            className={capsuleItem}
            variant="ghost"
            aria-current={moduleActive ? "true" : undefined}
            aria-label={`Modules${moduleActive ? ` · ${currentModule}` : ""}`}
          >
            <LayoutGrid aria-hidden="true" className="size-5" />
            <span>{mobile || !moduleActive ? "Modules" : currentModule}</span>
            {!mobile ? (
              <ChevronDown aria-hidden="true" className="size-4" />
            ) : null}
          </Button>
        </DialogTrigger>
        <SheetContent
          title="Modules · navigation prototype"
          description="Representative synthetic destinations only. The complete capability-aware directory belongs to M2."
        >
          <div className="space-y-3">
            <CapsuleLink
              href="/dev/design?screen=activity"
              className="justify-start bg-accent text-accent-foreground"
            >
              <Wallet aria-hidden="true" className="size-5" />
              Money · Financial activity
            </CapsuleLink>
            <CapsuleLink
              href="/dev/design?screen=migration"
              className="justify-start bg-plum-surface text-plum"
            >
              <ListChecks aria-hidden="true" className="size-5" />
              Trackers · Template migration
            </CapsuleLink>
          </div>
        </SheetContent>
      </Dialog>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            className={capsuleItem}
            variant="ghost"
            aria-current={screen === "states" ? "true" : undefined}
          >
            <MoreHorizontal aria-hidden="true" className="size-5" />
            <span>More</span>
          </Button>
        </DialogTrigger>
        <SheetContent
          title="More · navigation prototype"
          description="Review-only controls; no real account, preferences or authentication are changed."
        >
          <CapsuleLink
            href="/dev/design?screen=states"
            className="justify-start bg-accent text-accent-foreground"
          >
            <CircleHelp aria-hidden="true" className="size-5" />
            Interaction states
          </CapsuleLink>
        </SheetContent>
      </Dialog>
    </>
  );
}

export function ProductNavigation({ screen }: { screen: string }) {
  return (
    <>
      <div className={styles.productFrame}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-panel bg-accent p-3 text-accent-foreground">
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
          <NavigationCapsule aria-label="Product navigation prototype">
            <Destinations screen={screen} mobile={false} />
          </NavigationCapsule>
        </div>
      </div>
      <div className={styles.mobileNavigation}>
        <NavigationCapsule aria-label="Product navigation prototype">
          <Destinations screen={screen} mobile />
        </NavigationCapsule>
      </div>
    </>
  );
}
