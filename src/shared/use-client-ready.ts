"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
/** Native controls must wait for hydration before accepting economic edits.
 * Otherwise an early edit can be overwritten when handlers/field refs attach. */
export function useClientReady() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
