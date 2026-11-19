"use server";

import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { clearOpportunity, saveOpportunityNotes, setOpportunityStatus } from "@/lib/opportunities/store";
import { STATUS_VALUES } from "@/lib/opportunities/types";

// The Fellowships screen's actions. Nothing here applies anywhere: the user
// keeps their own list, then applies on the programme's own site.

const opportunityId = z.string().min(1).max(100);
const GONE = "That opportunity is no longer in the catalogue. Refresh the page.";

/** Where an entry stands, or "" to take it off the watchlist. */
export const setOpportunityStatusAction = action(
  z.object({ id: opportunityId, status: z.union([z.enum(STATUS_VALUES), z.literal("")]) }),
  async ({ id, status }) => {
    const entry = status === "" ? await clearOpportunity(id) : await setOpportunityStatus(id, status);
    if (!entry) throw new ActionError(GONE);
    return entry;
  },
);

/** Notes on an entry, kept as typed. */
export const saveOpportunityNotesAction = action(z.object({ id: opportunityId, notes: z.string().max(5_000) }), async ({ id, notes }) => {
  const entry = await saveOpportunityNotes(id, notes);
  if (!entry) throw new ActionError(GONE);
  return entry;
});
