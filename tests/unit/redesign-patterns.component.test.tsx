import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Link from "next/link";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Metric } from "@/components/patterns/metric";
import { CommandStatus, ReviewSummary } from "@/components/patterns/review";
import {
  PageControls,
  cursorPage,
  offsetPage,
} from "@/components/patterns/list-controls";
import { RecordTable, CompactRecordList } from "@/components/patterns/records";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

describe("M1 contracts", () => {
  it("joins hint/error associations without replacing existing domain context or the input ref", async () => {
    const user = userEvent.setup();
    render(
      <>
        <p id="domain-context">Amount in PHP.</p>
        <FormField
          label="Purchase"
          htmlFor="purchase"
          description="Enter the actual amount."
          error="Amount is required."
          required
        >
          <Input id="purchase" aria-describedby="domain-context" />
        </FormField>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Purchase (required)" });
    expect(input).toHaveAccessibleDescription(
      "Amount in PHP. Enter the actual amount. Amount is required.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    await user.type(input, "250.00");
    expect(input).toHaveValue("250.00");
  });

  it("clears only its own error association when validation recovers", () => {
    const field = (error?: string) => (
      <FormField label="Account" htmlFor="account" error={error}>
        <Select id="account">
          <option>Wallet</option>
        </Select>
      </FormField>
    );
    const { rerender } = render(field("Choose an account."));
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-describedby",
      "account-error",
    );
    rerender(field());
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("combobox")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("names an icon-only action while hiding decorative content", () => {
    render(
      <IconButton label="Open filters">
        <svg>
          <title>Decoration</title>
        </svg>
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Open filters" })).toBeEnabled();
  });

  it("does not turn unknown financial coverage into zero", () => {
    render(
      <Metric
        label="Unclassified"
        value={null}
        context="Breakdown not provided"
      />,
    );
    expect(screen.getByText("Unknown")).toBeVisible();
    expect(screen.queryByText(/0\.00/)).not.toBeInTheDocument();
  });

  it("renders exact domain strings, signs, dates and source evidence unchanged", () => {
    render(
      <ReviewSummary
        title="Effects"
        rows={[
          { key: "cash", label: "Cash", value: "-PHP 999,999,999.99" },
          { key: "date", label: "Effective date", value: "2026-10-17" },
        ]}
      >
        <Link href="/money/actions/original">Original action</Link>
      </ReviewSummary>,
    );
    expect(screen.getByText("-PHP 999,999,999.99")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Original action" }),
    ).toHaveAttribute("href", "/money/actions/original");
  });

  it("keeps unknown outcomes persistent and caller-controlled without a success claim", () => {
    render(
      <CommandStatus
        state="unknown-outcome"
        action={<Button>Check original command</Button>}
      >
        Keep the original command and payload.
      </CommandStatus>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("We couldn't confirm whether this saved");
    expect(within(status).getByRole("button")).toHaveTextContent(
      "Check original command",
    );
    expect(
      screen.queryByText("Saved", { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("preserves opaque cursor parameters and never fabricates a page count or Previous", () => {
    const page = cursorPage(
      { nextCursor: "opaque+/=", count: 25 },
      (cursor) => `/history?account=owned&cursor=${encodeURIComponent(cursor)}`,
    );
    render(<PageControls page={page} />);
    expect(screen.getByRole("link", { name: "Next records" })).toHaveAttribute(
      "href",
      "/history?account=owned&cursor=opaque%2B%2F%3D",
    );
    expect(
      screen.queryByRole("link", { name: "Previous" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("25 records shown")).toBeVisible();
  });

  it("does not infer a next offset from a full page", () => {
    const page = offsetPage(
      { offset: 50, limit: 25, count: 25, hasMore: false },
      (offset) => `/source?offset=${offset}`,
    );
    render(<PageControls page={page} />);
    expect(screen.getByText("51–75")).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/source?offset=25",
    );
    expect(
      screen.queryByRole("link", { name: "Next records" }),
    ).not.toBeInTheDocument();
  });

  it("retains source ordering and selected-record context with no fake sorting control", () => {
    render(
      <RecordTable
        label="Exact activity"
        records={[
          { id: "b", value: "PHP 9.00" },
          { id: "a", value: "PHP 1.00" },
        ]}
        columns={[
          {
            key: "amount",
            label: "Amount",
            numeric: true,
            cell: (row) => row.value,
          },
        ]}
        rowKey={(row) => row.id}
        selectedKey="b"
        empty={<p>No matches.</p>}
      />,
    );
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["PHP 9.00", "PHP 1.00"],
    );
    expect(screen.getAllByRole("row")[1]).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps compact record essential metadata and detail action", () => {
    render(
      <CompactRecordList
        label="Activity"
        records={[
          {
            key: "one",
            title: "Groceries",
            value: "-PHP 1,245.30",
            metadata: "2026-10-17 · Wallet",
            status: "Corrected",
            action: <Link href="/money/actions/one">View record</Link>,
          },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Activity" })).toHaveTextContent(
      "2026-10-17 · Wallet",
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/money/actions/one",
    );
  });

  it("focuses the safe confirmation action and returns to the trigger after Escape", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationDialog
        trigger={<Button>Delete fixture</Button>}
        title="Delete draft?"
        description="This discards only this draft."
        action={<Button variant="danger">Delete draft</Button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete fixture" }));
    expect(
      screen.getByRole("alertdialog", { name: "Delete draft?" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete fixture" }),
    ).toHaveFocus();
  });
});
