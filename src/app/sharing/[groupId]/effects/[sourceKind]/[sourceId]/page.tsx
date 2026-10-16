import Link from "next/link";
import { notFound } from "next/navigation";
import { sharingActor } from "../../../../_actor";
import {
  getGroupEffectPreview,
  effectReferenceSchema,
} from "@/modules/finance/services/adopt-group-effect";
import { getPrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";
import { EffectAdoption } from "@/components/sharing/effect-adoption";
export default async function EffectPage({
  params,
}: {
  params: Promise<{ groupId: string; sourceKind: string; sourceId: string }>;
}) {
  const parsed = effectReferenceSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const actor = await sharingActor();
  const [preview, setup] = await Promise.all([
    getGroupEffectPreview(actor, parsed.data),
    getPrivateSharingSetup(actor),
  ]);
  return (
    <div className="space-y-5">
      <Link
        className="text-link underline"
        href={`/sharing/${parsed.data.groupId}`}
      >
        Back to group
      </Link>
      <EffectAdoption preview={preview} setup={setup} />
    </div>
  );
}
