"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { z } from "zod";
import type { financialActivityFiltersSchema } from "@/modules/finance/services/list-financial-actions";

export function ActivityFilters({
  filters,
}: {
  filters: z.infer<typeof financialActivityFiltersSchema>;
}) {
  const router = useRouter();
  return (
    <form
      aria-label="Activity filters"
      className="flex flex-wrap items-end gap-3 rounded-panel border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(event.currentTarget))
          if (typeof value === "string" && value) params.set(key, value);
        router.push(`/money/actions${params.size ? `?${params}` : ""}`);
      }}
    >
      <label className="grid gap-1 text-sm">
        Funding
        <select
          name="fundingSource"
          defaultValue={filters.fundingSource ?? ""}
          className="min-h-11 rounded-control border border-input bg-surface px-3"
        >
          <option value="">All activity</option>
          <option value="cash">Cash expenses</option>
          <option value="card">Card purchases and charges</option>
        </select>
      </label>
      {(
        [
          ["transactionFrom", "Transaction from"],
          ["transactionTo", "Transaction to"],
          ["postingFrom", "Provider posted from"],
          ["postingTo", "Provider posted to"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="grid min-w-0 gap-1 text-sm">
          {label}
          <Input name={key} type="date" defaultValue={filters[key]} />
        </label>
      ))}
      {filters.cardId && (
        <input type="hidden" name="cardId" value={filters.cardId} />
      )}
      {filters.categoryId && (
        <input type="hidden" name="categoryId" value={filters.categoryId} />
      )}
      <Button type="submit" variant="secondary">
        Apply filters
      </Button>
      <Link href="/money/actions" className="action-link">
        Reset filters
      </Link>
      {(filters.cardId || filters.categoryId) && (
        <p className="basis-full text-xs text-muted-foreground">
          Scoped to the card or category from your source link. Reset filters to
          view all records.
        </p>
      )}
    </form>
  );
}
