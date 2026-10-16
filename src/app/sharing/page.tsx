import Link from "next/link";
import { sharingActor } from "./_actor";
import { listGroups } from "@/modules/sharing/services/read-groups";
import { CreateGroupForm } from "@/components/sharing/forms";
export default async function GroupsPage() {
  const groups = await listGroups(await sharingActor());
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Shared expense groups</h1>
      <p>
        Groups share bills and contributions. Each participant keeps control of
        their private financial workspace.
      </p>
      <ul className="space-y-3">
        {groups.map((g) => (
          <li key={g.id}>
            <Link
              className="inline-flex min-h-11 items-center text-link underline"
              href={`/sharing/${g.id}`}
            >
              {g.name}
            </Link>
            {g.archived ? " · Archived" : ""}
            {!g.active ? " · Historical access" : ""}
          </li>
        ))}
      </ul>
      {groups.length === 0 && <p>No shared groups yet.</p>}
      <details>
        <summary className="min-h-11 cursor-pointer font-semibold">
          Create a group
        </summary>
        <CreateGroupForm />
      </details>
    </div>
  );
}
