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
