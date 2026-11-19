import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { OPPORTUNITIES } from "./catalog";
import {
  clearOpportunity,
  listOpportunities,
  opportunityCounts,
  saveOpportunityNotes,
  setOpportunityStatus,
} from "./store";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});

beforeEach(async () => {
  await resetDatabase(db.client!);
});

const first = OPPORTUNITIES[0].id;

describe("the watchlist's store", () => {
  it("lists the whole catalogue with nothing marked at first", async () => {
    const entries = await listOpportunities();
    expect(entries).toHaveLength(OPPORTUNITIES.length);
    expect(entries.every((entry) => entry.status === null && entry.notes === "" && !entry.watching)).toBe(true);
    expect(await opportunityCounts()).toEqual({ watching: 0, applied: 0, preparing: 0 });
  });

  it("marks an entry, counts it, and takes it off again", async () => {
    expect(await setOpportunityStatus(first, "PREPARING")).toMatchObject({ id: first, status: "PREPARING", watching: true });
    expect(await opportunityCounts()).toEqual({ watching: 1, applied: 0, preparing: 1 });

    expect(await setOpportunityStatus(first, "APPLIED")).toMatchObject({ status: "APPLIED", watching: true });
    expect(await opportunityCounts()).toEqual({ watching: 1, applied: 1, preparing: 0 });

    expect(await clearOpportunity(first)).toMatchObject({ id: first, status: null, notes: "", watching: false });
    expect(await opportunityCounts()).toEqual({ watching: 0, applied: 0, preparing: 0 });
  });

  it("keeps notes and puts the entry on the watchlist", async () => {
    expect(await saveOpportunityNotes(first, "Ask about the visa route.")).toMatchObject({
      id: first,
      status: "INTERESTED",
      notes: "Ask about the visa route.",
      watching: true,
    });
    expect(await saveOpportunityNotes(first, "Ask about the visa route and the stipend.")).toMatchObject({
      status: "INTERESTED",
      notes: "Ask about the visa route and the stipend.",
    });
    // Clearing forgets the notes too.
    await clearOpportunity(first);
    expect((await listOpportunities()).find((entry) => entry.id === first)).toMatchObject({ notes: "", status: null });
  });

  it("refuses an id that isn't in the catalogue", async () => {
    expect(await setOpportunityStatus("not-a-programme", "APPLIED")).toBeNull();
    expect(await saveOpportunityNotes("not-a-programme", "hi")).toBeNull();
    expect(await clearOpportunity("not-a-programme")).toBeNull();
  });

  it("keeps a passed entry out of the watchlist count", async () => {
    expect(await setOpportunityStatus(first, "PASSED")).toMatchObject({ status: "PASSED", watching: false });
    expect(await opportunityCounts()).toEqual({ watching: 0, applied: 0, preparing: 0 });
  });
});
