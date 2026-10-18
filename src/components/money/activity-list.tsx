import Link from "next/link";
import { CompactRecordList, RecordTable } from "@/components/patterns/records";
import type { listFinancialActions } from "@/modules/finance/services/list-financial-actions";

export function ActivityList({
  items,
}: {
  items: Awaited<ReturnType<typeof listFinancialActions>>;
}) {
  const destination = (item: (typeof items)[number]) => (
    <Link className="action-link" href={`/money/actions/${item.actionId}`}>
      {item.description}
    </Link>
  );
  const status = (item: (typeof items)[number]) =>
    `Revision ${item.revisionNo} · ${item.changeKind === "void" ? "Reversed" : "Current"}`;
  const empty = (
    <p className="rounded-panel border border-border p-5 text-sm text-muted-foreground">
      No financial actions match this view. Recorded transactions will appear
      here; filters do not change your records.
    </p>
  );
  return (
    <>
      <div className="hidden md:block">
        <RecordTable
          label="Financial activity"
          records={items}
          rowKey={(item) => item.actionId}
          empty={empty}
          columns={[
            { key: "description", label: "Activity", cell: destination },
            {
              key: "date",
              label: "Effective date",
              cell: (item) => (
                <time dateTime={item.effectiveDate}>{item.effectiveDate}</time>
              ),
            },
            {
              key: "kind",
              label: "Kind",
              cell: (item) => item.actionKind.replaceAll("_", " "),
            },
            {
              key: "funding",
              label: "Funding evidence",
              cell: (item) => (
                <>
                  {item.fundingName ?? "Open source for details"}
                  {item.postingDate && (
                    <small className="mt-1 block">
                      Provider posted {item.postingDate}
                    </small>
                  )}
                </>
              ),
            },
            { key: "state", label: "Revision", cell: status },
          ]}
        />
      </div>
      <div className="md:hidden">
        <CompactRecordList
          label="Financial activity"
          empty={empty}
          records={items.map((item) => ({
            key: item.actionId,
            title: destination(item),
            metadata: (
              <>
                {item.actionKind.replaceAll("_", " ")} ·{" "}
                <time dateTime={item.effectiveDate}>{item.effectiveDate}</time>
                {item.fundingName && (
                  <p>
                    Paid with {item.fundingName}
                    {item.postingDate
                      ? ` · Provider posted ${item.postingDate}`
                      : ""}
                  </p>
                )}
              </>
            ),
            status: status(item),
            action: null,
          }))}
        />
      </div>
    </>
  );
}
