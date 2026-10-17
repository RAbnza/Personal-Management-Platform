/** Discard prior client/RSC state at the session boundary and let the server
 * authorize a fresh private document. The target is deliberately static. */
export function enterPrivateWorkspace() {
  window.location.replace("/");
}
