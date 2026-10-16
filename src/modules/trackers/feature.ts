/** Assignment 1 preview never enables a deployed incomplete domain. */
export function trackersEnabled() {
  return (
    process.env.TRACKERS_PREVIEW_ENABLED === "true" &&
    ["local", "test"].includes(process.env.PMP_DEPLOYMENT_ENV ?? "")
  );
}
