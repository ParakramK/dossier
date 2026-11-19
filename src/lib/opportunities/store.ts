import "server-only";

import type { OpportunityStatus as PrismaOpportunityStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { OPPORTUNITIES } from "./catalog";
import { isWatching, type OpportunityStatus, type OpportunityView } from "./types";

// The user's side of the catalogue: which fellowships and scholarships they
// are interested in, where each one stands, and their notes. The catalogue
// itself is code, so an update to it never wipes this.

const catalogIds = new Set(OPPORTUNITIES.map((entry) => entry.id));

/** The catalogue with the user's state, ready for the screen. */
export async function listOpportunities(): Promise<OpportunityView[]> {
  const rows = await prisma.opportunityWatch.findMany();
  const states = new Map(rows.map((row) => [row.catalogId, row]));
  return OPPORTUNITIES.map((entry) => {
    const row = states.get(entry.id);
    const status = (row?.status ?? null) as OpportunityStatus | null;
    return {
      ...entry,
      status,
      notes: row?.notes ?? "",
      watching: isWatching(status),
    };
  });
}

/** "Interested" through "Passed": upserts the entry's state. Returns null when it isn't in the catalogue. */
export async function setOpportunityStatus(catalogId: string, status: OpportunityStatus): Promise<OpportunityView | null> {
  if (!catalogIds.has(catalogId)) return null;
  await prisma.opportunityWatch.upsert({
    where: { catalogId },
    create: { catalogId, status: status as PrismaOpportunityStatus },
    update: { status: status as PrismaOpportunityStatus },
  });
  return (await listOpportunities()).find((entry) => entry.id === catalogId) ?? null;
}

/** Takes an entry off the watchlist and forgets its status and notes. */
export async function clearOpportunity(catalogId: string): Promise<OpportunityView | null> {
  if (!catalogIds.has(catalogId)) return null;
  await prisma.opportunityWatch.deleteMany({ where: { catalogId } });
  return (await listOpportunities()).find((entry) => entry.id === catalogId) ?? null;
}

/** Notes on an entry, kept as typed; adding notes puts it on the watchlist. */
export async function saveOpportunityNotes(catalogId: string, notes: string): Promise<OpportunityView | null> {
  if (!catalogIds.has(catalogId)) return null;
  await prisma.opportunityWatch.upsert({
    where: { catalogId },
    create: { catalogId, notes },
    update: { notes },
  });
  return (await listOpportunities()).find((entry) => entry.id === catalogId) ?? null;
}

/** How many entries are on the watchlist and how many went out, for the screen's tabs. */
export async function opportunityCounts(): Promise<{ watching: number; applied: number; preparing: number }> {
  // An imported watchlist may name a programme later removed from the catalogue; it isn't shown, so it isn't counted.
  const rows = (await prisma.opportunityWatch.findMany({ select: { catalogId: true, status: true } })).filter((row) => catalogIds.has(row.catalogId));
  return {
    watching: rows.filter((row) => isWatching(row.status as OpportunityStatus)).length,
    applied: rows.filter((row) => row.status === "APPLIED" || row.status === "AWARDED").length,
    preparing: rows.filter((row) => row.status === "PREPARING").length,
  };
}
