/** No credentials or private data in cross-tab messages. A full navigation
 * discards client and Server Component state after logout/account switch. */
export function notifySessionChanged() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("pmp-session-change", crypto.randomUUID());
  } catch {
    /* Storage can be disabled. */
  }
  if (typeof BroadcastChannel !== "undefined") {
    const c = new BroadcastChannel("pmp-session");
    c.postMessage("changed");
    c.close();
  }
}
