"use client";

import {
  Children,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./horizontal-collection.module.css";

/** Native scrolling owns touch/trackpad gestures. Controls never rotate or move focus. */
export function HorizontalCollection({
  label,
  children,
  mode = "cards",
}: {
  label: string;
  children: ReactNode;
  mode?: "single" | "cards";
}) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    index: 0,
    atStart: true,
    atEnd: false,
  });
  const items = Children.toArray(children);
  const measure = useCallback(() => {
    const rail = viewport.current;
    if (!rail) return;
    const left = rail.getBoundingClientRect().left;
    const offsets = Array.from(rail.children, (child) =>
      Math.abs(child.getBoundingClientRect().left - left),
    );
    const index = offsets.indexOf(Math.min(...offsets));
    const next = {
      index: Math.max(0, index),
      atStart: rail.scrollLeft <= 2,
      atEnd: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2,
    };
    setPosition((old) =>
      old.index === next.index &&
      old.atStart === next.atStart &&
      old.atEnd === next.atEnd
        ? old
        : next,
    );
  }, []);
  useEffect(() => {
    const rail = viewport.current;
    if (!rail) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [measure, items.length]);
  function go(index: number) {
    const rail = viewport.current;
    const slide =
      rail?.children[Math.max(0, Math.min(index, items.length - 1))];
    if (!rail || !slide) return;
    rail.scrollTo({
      left:
        rail.scrollLeft +
        slide.getBoundingClientRect().left -
        rail.getBoundingClientRect().left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <section
      className={styles.collection}
      aria-label={label}
      aria-roledescription="carousel"
    >
      <div
        ref={viewport}
        id={id}
        className={styles.viewport}
        data-mode={mode}
        tabIndex={items.length > 1 ? 0 : undefined}
        aria-label={`${label}: scroll horizontally or use arrow keys`}
        onScroll={measure}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowRight") {
            event.preventDefault();
            go(position.index + 1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(position.index - 1);
          }
          if (event.key === "Home") {
            event.preventDefault();
            go(0);
          }
          if (event.key === "End") {
            event.preventDefault();
            go(items.length - 1);
          }
        }}
      >
        {items.map((child, index) => (
          <div
            className={styles.slide}
            key={index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${items.length}`}
          >
            {child}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className={styles.controls}>
          <span aria-live="polite" aria-atomic="true">
            {position.index + 1} / {items.length}
            <span className={styles.hint}> · Swipe or browse</span>
          </span>
          <div>
            <button
              type="button"
              aria-controls={id}
              aria-label={`Previous ${label}`}
              disabled={position.atStart}
              onClick={() => go(position.index - 1)}
            >
              <ArrowLeft size={17} />
            </button>
            <button
              type="button"
              aria-controls={id}
              aria-label={`Next ${label}`}
              disabled={position.atEnd}
              onClick={() => go(position.index + 1)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
