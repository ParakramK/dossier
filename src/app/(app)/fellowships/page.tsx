import type { Metadata } from "next";

import { listOpportunities, opportunityCounts } from "@/lib/opportunities/store";
import { filterOpportunities, opportunityFilterFromParams } from "@/lib/opportunities/types";

import { FellowshipsScreen } from "./fellowships-screen";

export const metadata: Metadata = { title: "Fellowships" };

/**
 * Fellowships and scholarships worth watching, with an emphasis on AI safety
 * and funded CS master's degrees. The catalogue is curated in code and links
 * to each programme's own page; the user keeps their own list and notes.
 */
export default async function FellowshipsPage({ searchParams }: PageProps<"/fellowships">) {
  const filter = opportunityFilterFromParams(await searchParams);
  const [entries, counts] = await Promise.all([listOpportunities(), opportunityCounts()]);
  return <FellowshipsScreen filter={filter} entries={filterOpportunities(entries, filter)} counts={counts} />;
}
