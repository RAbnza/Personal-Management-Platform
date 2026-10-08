"use client";
import { useEffect } from "react";
export function SessionNoticeListener() {
  useEffect(() => {
    const reset = () => window.location.replace("/auth/sign-in");
    const storage = (e: StorageEvent) => {
      if (e.key === "pmp-session-change") reset();
    };
    window.addEventListener("storage", storage);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("pmp-session")
        : null;
    if (channel) channel.onmessage = reset;
    return () => {
      window.removeEventListener("storage", storage);
      channel?.close();
    };
  }, []);
  return null;
}
