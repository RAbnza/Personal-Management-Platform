// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { CommandForm } from "@/components/sharing/forms";
import { AdoptionPanel } from "@/components/sharing/adoption-panel";
import type { AdoptionPreview } from "@/modules/finance/services/adopt-group-expense";
import {
  SharedBillForm,
  SharedExpenseEntry,
} from "@/components/sharing/bill-form";
import type { GroupDetail } from "@/modules/sharing/services/read-groups";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  c = "33333333-3333-4333-8333-333333333333";
const data: GroupDetail = {
  group: {
    id: a,
    name: "Dinner group",
    version: 1,
    archived: false,
    active: true,
    owner: true,
    participantId: a,
  },
  participants: [a, b, c].map((id, i) => ({
    id,
    displayName: ["You", "Friend", "Manual person"][i]!,
    identityKind: i === 2 ? "manual" : "registered",
    active: i < 2,
    role: i === 0 ? "owner" : "member",
    paidMinor: "0",
    shareMinor: "0",
    netMinor: "0",
  })),
  bills: [],
  invitations: [],
  nextCursor: null,
};
const setup = {
  financialRevision: "1",
  accounts: [{ id: a, name: "Private wallet" }],
  cards: [{ id: b, name: "Private Visa" }],
  categories: [],
  purchases: [],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("sharing forms", () => {
  it("keeps retained funding independent of active funding choices and submits one reviewed private category", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const preview: AdoptionPreview = {
      groupId: a,
      expenseId: b,
      revisionId: c,
      description: "Dinner",
      expenseDate: "2026-10-15",
      paidMinor: "2000",
      shareMinor: "1000",
      sourceHash: "ab".repeat(32),
      financialRevision: "1",
      receivableMinor: "1000",
      payableMinor: "0",
      link: {
        id: a,
        actionId: b,
        acceptedSourceRevisionId: a,
        acceptedSourceHash: "cd".repeat(32),
        actionRevisionId: a,
        currentActionRevisionId: a,
        linkRevisionId: b,
      },
      review: null,
      retainedAmounts: {
        fundingMinor: "-2000",
        spendingMinor: "500",
        groupMinor: "1500",
        clearingMinor: "0",
      },
      needsPrivateCorrection: true,
    };
    const privateSetup = {
      ...setup,
      accounts: [],
      cards: [],
      categories: [{ id: c, name: "Reviewed category" }],
    };
    const { rerender } = render(
      <AdoptionPanel preview={preview} setup={privateSetup} />,
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Your private spending category"), {
      target: { value: c },
    });
    const fundingConsent = screen.getByLabelText(
      /I approve correcting the original actual funding/,
    );
    fireEvent.click(fundingConsent);
    expect(
      screen.getByLabelText("Private funding or existing purchase"),
    ).toBeRequired();
    const changedPreview = { ...preview, sourceHash: "ef".repeat(32) };
    rerender(<AdoptionPanel preview={changedPreview} setup={privateSetup} />);
    expect(
      screen.getByLabelText(/I approve correcting the original actual funding/),
    ).not.toBeChecked();
    expect(
      screen.queryByLabelText("Private funding or existing purchase"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    fireEvent.click(
      screen.getByLabelText(
        /I approve this exact correction to my private ledger/,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Approve reviewed private correction",
      }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      funding: { kind: "keep" },
      categoryId: c,
      expectedSourceHash: changedPreview.sourceHash,
      acknowledgeFundingCorrection: false,
      approved: true,
    });
  });
  it("creates a group inside Add Expense and retains the original private funding and amount", async () => {
    const fetch = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes("?groupId=")
                ? data
                : { groupId: a, version: 1, subjectId: a },
            ),
            { status: 200 },
          ),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <SharedExpenseEntry
        groups={[]}
        setup={setup}
        defaults={{
          amount: "100",
          description: "Original dinner",
          date: "2026-10-15",
          funding: `card:${b}`,
        }}
      />,
    );
    fireEvent.click(screen.getByText("Create a new group here"));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Dinner group" },
    });
    fireEvent.change(screen.getByLabelText("Your name in this group"), {
      target: { value: "You" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Total bill (PHP)")).toHaveValue("100"),
    );
    expect(screen.getByLabelText("Description")).toHaveValue("Original dinner");
    expect(
      screen.getByLabelText("Private funding or existing purchase"),
    ).toHaveValue(`card:${b}`);
    expect(
      screen.getByLabelText("Also record my allocation privately"),
    ).toBeChecked();
    expect(
      fetch.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toHaveLength(1);
  });
  it("freezes uncertain commands and retries identical intent after response loss", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ groupId: a }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <CommandForm
        build={(f) => ({
          clientCommandId: crypto.randomUUID(),
          name: f.get("name"),
        })}
      >
        <label>
          Name
          <input name="name" defaultValue="Dinner" />
        </label>
      </CommandForm>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Retry same command" });
    expect(screen.getByLabelText("Name")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same command" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1]![1].body).toBe(fetch.mock.calls[0]![1].body);
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeEnabled());
  });
  it("exposes exact equal shares and funding consent without posting a preview", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<SharedBillForm data={data} setup={setup} />);
    fireEvent.change(screen.getByLabelText("Total bill (PHP)"), {
      target: { value: "100" },
    });
    const preview = screen.getByRole("region", { name: "Bill preview" });
    expect(preview).toHaveTextContent("PHP 33.34");
    expect(preview).toHaveTextContent("extra centavo");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByLabelText("Also record my allocation privately"),
    );
    expect(
      screen.getByLabelText("Private funding or existing purchase"),
    ).toBeInTheDocument();
  });
  it("uses accessible independent multiple payer and exact share controls", () => {
    render(<SharedBillForm data={data} setup={setup} />);
    fireEvent.change(screen.getByLabelText("Total bill (PHP)"), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByLabelText("Multiple payers"));
    fireEvent.change(screen.getByLabelText("You paid (PHP)"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("Friend paid (PHP)"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText("Split method"), {
      target: { value: "exact" },
    });
    for (const name of ["You", "Friend", "Manual person"])
      fireEvent.change(screen.getByLabelText(`${name} share (PHP)`), {
        target: { value: name === "You" ? "20" : "10" },
      });
    expect(
      within(screen.getByRole("region", { name: "Bill preview" })).getByText(
        /Total paid/,
      ),
    ).toHaveTextContent("PHP 40.00");
    expect(
      screen.getByRole("button", { name: "Save reviewed expense" }),
    ).toBeEnabled();
  });
});
