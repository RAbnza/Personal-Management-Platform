"use client";
import { useEffect, useRef } from "react";
import styles from "./money-workspace.module.css";

export function TaskStage({
  reviewing,
  active = true,
}: {
  reviewing: boolean;
  active?: boolean;
}) {
  const marker = useRef<HTMLParagraphElement>(null);
  const previous = useRef(reviewing);
  const previousActive = useRef(active);
  useEffect(() => {
    if (active && (previous.current !== reviewing || !previousActive.current)) {
      marker.current?.focus({ preventScroll: true });
      marker.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
    }
    previous.current = reviewing;
    previousActive.current = active;
  }, [reviewing, active]);
  return (
    <p
      ref={marker}
      tabIndex={-1}
      className={styles.steps}
      aria-label={
        reviewing ? "Step 2 of 2: Review" : "Step 1 of 2: Enter details"
      }
    >
      <span aria-current={!reviewing ? "step" : undefined}>
        1. Enter details
      </span>
      <span aria-current={reviewing ? "step" : undefined}>
        2. Review and confirm
      </span>
    </p>
  );
}
