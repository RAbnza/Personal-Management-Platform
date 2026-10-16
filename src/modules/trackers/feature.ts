/** Full V3 domain. Optional operational switch never enables external delivery. */
export function trackersEnabled() {
  return process.env.TRACKERS_ENABLED !== "false";
}
