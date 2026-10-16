import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PresetForm,
  TemplateBuilder,
  EntryForm,
} from "@/components/trackers/forms";
import { MigrationControls } from "@/components/trackers/migration";
import { presets } from "@/modules/trackers/domain/presets";
import type { MigrationRow } from "@/modules/trackers/repositories/trackers";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("private tracker workflows", () => {
  it("instantiates the selected preset with its name and no client ownership", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ trackerId: id }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<PresetForm />);
    fireEvent.change(screen.getByLabelText("Preset"), {
      target: { value: "books" },
    });
    expect(screen.getByLabelText("Tracker name")).toHaveValue("Books");
    fireEvent.click(
      screen.getByRole("button", { name: "Create private tracker" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      operation: "preset",
      preset: "books",
      name: "Books",
    });
    expect(body).not.toHaveProperty("workspaceId");
  });
  it("freezes and retries precisely the same entry command after a lost response", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entryId: id }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <EntryForm
        tracker={{
          id,
          template_id: id,
          template_version_id: id,
          name: "Books",
          archived_at: null,
          version: 1,
        }}
        definition={presets.books}
      />,
    );
    fireEvent.change(screen.getByLabelText("Title (required)"), {
      target: { value: "A book" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Title (required)")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same command" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
  });
  it("requires definition review before publishing and preserves stable renamed identifiers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ templateId: id }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <TemplateBuilder
        initial={presets.books}
        templateId={id}
        versionId={id}
      />,
    );
    const titleGroup = screen.getByRole("group", { name: "Field 1: Title" });
    fireEvent.change(within(titleGroup).getByLabelText("Label"), {
      target: { value: "Book title" },
    });
    expect(
      within(titleGroup).getByLabelText(
        "Field identifier (fixed after creation)",
      ),
    ).toHaveValue("title");
    fireEvent.change(screen.getByLabelText("Reason for publishing"), {
      target: { value: "Rename title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review version" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Review:");
    fireEvent.click(
      screen.getByRole("button", { name: "Publish reviewed version" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(
      JSON.parse(fetch.mock.calls[0]![1].body).definition.fields[0],
    ).toMatchObject({ key: "title", label: "Book title" });
  });
  it("binds migration confirmation to the reviewed hash and requires acknowledgement", async () => {
    const m: MigrationRow = {
      id,
      tracker_id: id,
      from_version_id: id,
      to_version_id: id,
      mapping_json: {},
      state: "preview",
      preview_counts_json: {
        total: 1,
        valid: 1,
        invalid: 0,
        issues: [],
        samples: [],
      },
      preview_hash: "a".repeat(64),
      migrated_count: 0,
      last_entry_id: null,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ migrationId: id, state: "confirmed" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<MigrationControls migration={m} />);
    const confirm = screen.getByRole("button", {
      name: "Confirm reviewed migration",
    });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      operation: "confirm",
      migrationId: id,
      previewHash: m.preview_hash,
    });
  });
  it("does not offer confirmation for a preview with unresolved entries", () => {
    const m: MigrationRow = {
      id,
      tracker_id: id,
      from_version_id: id,
      to_version_id: id,
      mapping_json: {},
      state: "preview",
      preview_counts_json: {
        total: 2,
        valid: 1,
        invalid: 1,
        issues: [],
        samples: [],
      },
      preview_hash: "b".repeat(64),
      migrated_count: 0,
      last_entry_id: null,
    };
    render(<MigrationControls migration={m} />);
    expect(
      screen.queryByRole("button", { name: "Confirm reviewed migration" }),
    ).not.toBeInTheDocument();
  });
});
