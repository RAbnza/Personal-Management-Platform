import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";

export async function debtWorkspace() {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());
  if (bootstrap.kind === "unauthorized") redirect("/auth/sign-in");
  if (bootstrap.kind === "unavailable")
    throw new Error("Private workspace unavailable");
  return bootstrap;
}
