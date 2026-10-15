import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { resolveActorContext } from "@/platform/auth/actor-context";
import { sharingEnabled } from "@/modules/sharing/domain/sharing";
export async function sharingActor() {
  if (!sharingEnabled()) notFound();
  const a = await resolveActorContext(await headers());
  if (a.kind === "unauthorized") redirect("/auth/sign-in");
  if (a.kind !== "authenticated")
    throw new Error("Active workspace unavailable");
  return a.actor;
}
