import { notFound } from "next/navigation";
import { sharingActor } from "../../../_actor";
import { getGroup } from "@/modules/sharing/services/read-groups";
import { id } from "@/modules/sharing/domain/sharing";
import { getPrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";
import { SharedBillForm } from "@/components/sharing/bill-form";
export default async function NewBillPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  if (!id.safeParse(groupId).success) notFound();
  const actor = await sharingActor();
  const [data, setup] = await Promise.all([
    getGroup(actor, groupId),
    getPrivateSharingSetup(actor),
  ]);
  if (!data.group.active || data.group.archived) notFound();
  return <SharedBillForm data={data} setup={setup} />;
}
