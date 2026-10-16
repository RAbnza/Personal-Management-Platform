import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { resolveActorContext } from "@/platform/auth/actor-context";
import { trackersEnabled } from "@/modules/trackers/feature";
export async function trackerActor() {
  await connection();
  if (!trackersEnabled()) notFound();
  const a = await resolveActorContext(await headers());
  if (a.kind === "unauthorized") redirect("/auth/sign-in");
  if (a.kind !== "authenticated")
    throw new Error("Active private workspace unavailable.");
  return a.actor;
}
