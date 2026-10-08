import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getVerifiedAuthenticatedSession } from "@/platform/auth/session-boundary";
import { resolveLifecycleActor } from "@/platform/auth/lifecycle-actor";
import {
  getDeletionPreview,
  getLifecycleState,
  lifecyclePolicy,
} from "@/modules/core/services/workspace-lifecycle";
import { getIdentityProfile } from "@/modules/core/services/profile";
import { LifecycleControls } from "@/components/settings/lifecycle-controls";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SessionNoticeListener } from "@/components/auth/session-notice-listener";
export default async function LifecyclePage() {
  const h = await headers();
  const current = await getVerifiedAuthenticatedSession(h);
  if (!current) redirect("/auth/sign-in");
  const actor = await resolveLifecycleActor(h);
  if (!actor) redirect("/settings");
  const profile = await getIdentityProfile(actor.userId);
  const request = await getLifecycleState(actor.userId);
  const preview =
    profile?.lifecycle === "active"
      ? await getDeletionPreview({
          userId: actor.userId,
          workspaceId: actor.workspaceId,
        })
      : null;
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <SessionNoticeListener />
      <h1 className="text-2xl font-semibold">
        Workspace and account lifecycle
      </h1>
      <p className="text-sm text-muted-foreground">
        Signed in as {current.user.email}. This page grants no ordinary domain
        access while deletion is pending.
      </p>
      {preview ? (
        <Link href="/settings" className="text-link underline">
          Back to Settings
        </Link>
      ) : null}
      <LifecycleControls
        preview={preview}
        request={request}
        retention={lifecyclePolicy.backupRetention}
        scopeKey={actor.workspaceId}
      />
      <SignOutButton />
    </main>
  );
}
