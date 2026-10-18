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
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <li
            key={g.id}
            className="rounded-card border border-border bg-surface p-6"
          >
            <div
              aria-hidden="true"
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-control bg-[var(--teal-surface)] text-xl font-semibold"
            >
              {g.name.slice(0, 1).toUpperCase()}
            </div>
            <Link
              className="flex min-h-11 items-center text-lg font-semibold text-link"
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
      <details className="rounded-card bg-surface-subtle p-5">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Create a group
        </summary>
        <CreateGroupForm />
      </details>
    </div>
  );
}
