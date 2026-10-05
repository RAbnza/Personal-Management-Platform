/**
 * Better Auth CLI entry point.
 *
 * Re-export the runtime instance so schema generation always uses the same
 * pinned configuration that serves authentication requests.
 */
export { auth } from "./server";
