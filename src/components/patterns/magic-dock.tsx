"use client";

/** Adapted from Magic UI Dock (MIT, Copyright (c) Magic UI).
 * Source: https://magicui.design/r/dock.json (retrieved 2026-10-17).
 * See magic-dock.LICENSE. Retains upstream distance/transform/spring mechanics.
 * Changes: native nav, clientX coordinates, explicit item context, persistent
 * labels supplied by callers, and static touch/reduced-motion presentation.
 */
import { createContext, useContext, useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import styles from "./navigation-dock.module.css";

const DockContext = createContext<MotionValue<number> | null>(null);

export function MagicDock({ children }: { children: ReactNode }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <DockContext.Provider value={mouseX}>
      <nav
        aria-label="Product navigation prototype"
        className={styles.dock}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") mouseX.set(event.clientX);
        }}
        onPointerLeave={() => mouseX.set(Infinity)}
      >
        {children}
      </nav>
    </DockContext.Provider>
  );
}

export function MagicDockItem({ children }: { children: ReactNode }) {
  const mouseX = useContext(DockContext);
  const ref = useRef<HTMLDivElement>(null);
  const defaultMouseX = useMotionValue(Infinity);
  const reduce = useReducedMotion();
  const distance = useTransform(mouseX ?? defaultMouseX, (value: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return value - bounds.x - bounds.width / 2;
  });
  const size = useTransform(distance, [-140, 0, 140], [76, 88, 76]);
  const width = useSpring(size, { mass: 0.1, stiffness: 150, damping: 12 });
  return (
    <motion.div
      ref={ref}
      style={{ width: reduce ? 76 : width }}
      className={styles.dockItem}
    >
      {children}
    </motion.div>
  );
}
