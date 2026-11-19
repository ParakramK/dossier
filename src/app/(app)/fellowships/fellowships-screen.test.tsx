import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";
import { opportunityFilterFromParams, type OpportunityView } from "@/lib/opportunities/types";

import { saveOpportunityNotesAction, setOpportunityStatusAction } from "./actions";
import { FellowshipsScreen } from "./fellowships-screen";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/fellowships" }));
vi.mock("next/link", () => ({ default: ({ href, ...props }: ComponentProps<"a">) => <a href={href} {...props} /> }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));
vi.mock("./actions", () => ({ setOpportunityStatusAction: vi.fn(), saveOpportunityNotesAction: vi.fn() }));

const entry = (id: string, extra: Partial<OpportunityView> = {}): OpportunityView => ({
  id,
  name: id === "mats" ? "MATS" : "Chevening",
  org: id === "mats" ? "MATS Research" : "UK government",
  kind: id === "mats" ? "FELLOWSHIP" : "SCHOLARSHIP",
  focus: id === "mats" ? ["AI_SAFETY"] : ["CS_MASTERS"],
  regions: id === "mats" ? ["GLOBAL"] : ["UK"],
  summary: "A programme worth watching, described in one sentence.",
  funding: "A stipend",
  timing: "Applications in the autumn",
  eligibility: "Open to graduates",
  url: `https://example.org/${id}`,
  priority: id === "mats",
  status: null,
  notes: "",
  watching: false,
  ...extra,
});

const props: ComponentProps<typeof FellowshipsScreen> = {
  filter: opportunityFilterFromParams({}),
  entries: [entry("mats"), entry("chevening")],
  counts: { watching: 0, applied: 0, preparing: 0 },
};

beforeEach(() => vi.clearAllMocks());

describe("FellowshipsScreen", () => {
  it("lists the opportunities and says where to confirm the dates", () => {
    render(<FellowshipsScreen {...props} />);
    expect(screen.getByRole("heading", { level: 1, name: "Fellowships" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "MATS" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Chevening" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("confirm it on the programme's page");
    expect(within(screen.getByRole("article", { name: "MATS" })).getByRole("link", { name: "The programme's page ↗" })).toHaveAttribute("href", "https://example.org/mats");
    expect(screen.getByText("2 opportunities.")).toBeInTheDocument();
  });

  it("puts the view, kind, focus and place in the address", async () => {
    render(<FellowshipsScreen {...props} />);
    expect(screen.getByRole("link", { name: /Watching/ })).toHaveAttribute("href", "/fellowships?view=watching");

    await userEvent.selectOptions(screen.getByLabelText("Kind"), "SCHOLARSHIP");
    expect(router.replace).toHaveBeenLastCalledWith("/fellowships?kind=scholarship", { scroll: false });

    await userEvent.selectOptions(screen.getByLabelText("Focus"), "AI_SAFETY");
    expect(router.replace).toHaveBeenLastCalledWith("/fellowships?focus=ai_safety", { scroll: false });

    await userEvent.selectOptions(screen.getByLabelText("Where"), "NEPAL");
    expect(router.replace).toHaveBeenLastCalledWith("/fellowships?region=nepal", { scroll: false });

    await userEvent.type(screen.getByLabelText("Search"), "nepal{Enter}");
    expect(router.replace).toHaveBeenLastCalledWith("/fellowships?q=nepal", { scroll: false });
  });

  it("marks where an entry stands and keeps its notes", async () => {
    vi.mocked(setOpportunityStatusAction).mockResolvedValue({ ok: true, data: entry("mats", { status: "PREPARING", watching: true }) });
    vi.mocked(saveOpportunityNotesAction).mockResolvedValue({ ok: true, data: entry("mats", { status: "INTERESTED", notes: "Check the visa route.", watching: true }) });

    render(<FellowshipsScreen {...props} />);
    const mats = screen.getByRole("article", { name: "MATS" });

    await userEvent.selectOptions(within(mats).getByLabelText("Where MATS stands"), "PREPARING");
    expect(setOpportunityStatusAction).toHaveBeenCalledWith({ id: "mats", status: "PREPARING" });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Marked MATS as preparing."));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());

    await userEvent.click(within(mats).getByRole("button", { name: "Eligibility and notes" }));
    const notes = within(mats).getByLabelText("Your notes");
    await userEvent.type(notes, "Check the visa route.");
    await userEvent.tab();
    expect(saveOpportunityNotesAction).toHaveBeenCalledWith({ id: "mats", notes: "Check the visa route." });
  });

  it("takes an entry off the watchlist", async () => {
    vi.mocked(setOpportunityStatusAction).mockResolvedValue({ ok: true, data: entry("mats") });
    render(<FellowshipsScreen {...props} entries={[entry("mats", { status: "APPLIED", watching: true })]} />);
    await userEvent.selectOptions(screen.getByLabelText("Where MATS stands"), "");
    expect(setOpportunityStatusAction).toHaveBeenCalledWith({ id: "mats", status: "" });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Removed MATS from your list."));
  });

  it("says plainly when nothing matches", () => {
    render(<FellowshipsScreen {...props} entries={[]} />);
    expect(screen.getByText("Nothing matches these filters. Try fewer.")).toBeInTheDocument();
  });
});
