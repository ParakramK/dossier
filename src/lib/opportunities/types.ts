import { z } from "zod";

// Fellowships and scholarships: a curated catalogue of programmes worth
// watching, with the user's own state kept beside it. The catalogue is code,
// not a remote feed: these deadlines move, and several of the best
// programmes have no API at all. Opening the programme's own page is always
// the last word.

/** What kind of opportunity it is, in the order the screen lists them. */
export const OPPORTUNITY_KINDS = [
  { value: "FELLOWSHIP", label: "Fellowship", hint: "A cohort, a stipend and mentorship for a fixed time." },
  { value: "SCHOLARSHIP", label: "Scholarship", hint: "Money towards a degree." },
  { value: "RESIDENCY", label: "Residency", hint: "Time inside a lab or research group." },
  { value: "ROLE", label: "Research role", hint: "A paid job in research or engineering." },
  { value: "CONTRACT", label: "Contract work", hint: "Flexible evaluation, data and training work." },
  { value: "COURSE", label: "Course", hint: "A structured way into the field." },
  { value: "GRANT", label: "Grant", hint: "Funding for a project of your own." },
] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number]["value"];
const KIND_VALUES = OPPORTUNITY_KINDS.map((entry) => entry.value) as [OpportunityKind, ...OpportunityKind[]];

/** The subjects the catalogue is organised around. */
export const OPPORTUNITY_FOCUS = [
  { value: "AI_SAFETY", label: "AI safety" },
  { value: "AI_EVALUATION", label: "AI evaluation" },
  { value: "AI_RESEARCH", label: "AI research" },
  { value: "CS_MASTERS", label: "CS master's" },
] as const;
export type OpportunityFocus = (typeof OPPORTUNITY_FOCUS)[number]["value"];
const FOCUS_VALUES = OPPORTUNITY_FOCUS.map((entry) => entry.value) as [OpportunityFocus, ...OpportunityFocus[]];

/** Where it runs, or where the degree is taught. */
export const OPPORTUNITY_REGIONS = [
  { value: "GLOBAL", label: "Anywhere" },
  { value: "NEPAL", label: "Nepal" },
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
  { value: "CANADA", label: "Canada" },
  { value: "EUROPE", label: "Europe" },
  { value: "ASIA", label: "Asia" },
  { value: "AFRICA", label: "Africa" },
  { value: "OCEANIA", label: "Australia and New Zealand" },
  { value: "MIDDLE_EAST", label: "Middle East" },
] as const;
export type OpportunityRegion = (typeof OPPORTUNITY_REGIONS)[number]["value"];
const REGION_VALUES = OPPORTUNITY_REGIONS.map((entry) => entry.value) as [OpportunityRegion, ...OpportunityRegion[]];

/** Where the user stands with an entry. */
export const OPPORTUNITY_STATUSES = [
  { value: "INTERESTED", label: "Interested" },
  { value: "PREPARING", label: "Preparing" },
  { value: "APPLIED", label: "Applied" },
  { value: "AWARDED", label: "Awarded" },
  { value: "PASSED", label: "Passed" },
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number]["value"];
const STATUS_VALUES = OPPORTUNITY_STATUSES.map((entry) => entry.value) as [OpportunityStatus, ...OpportunityStatus[]];

/** One entry in the catalogue. */
export type Opportunity = {
  id: string;
  name: string;
  org: string;
  kind: OpportunityKind;
  focus: readonly OpportunityFocus[];
  regions: readonly OpportunityRegion[];
  /** One sentence on what it is. */
  summary: string;
  /** What it pays for, in a line. */
  funding: string;
  /** When it runs, or when applications usually open and close. */
  timing: string;
  /** Who it's for. */
  eligibility: string;
  url: string;
  /** The ones to look at first: AI safety, and Nepali and remote routes in. */
  priority?: boolean;
};

/** An entry as the screen sees it, with the user's state. */
export type OpportunityView = Opportunity & {
  /** Null when the user hasn't touched it. */
  status: OpportunityStatus | null;
  notes: string;
  /** Interested, preparing or applied: on the watchlist. */
  watching: boolean;
};

export const OPPORTUNITY_VIEWS = ["all", "watching", "applied"] as const;
export type OpportunityViewName = (typeof OPPORTUNITY_VIEWS)[number];

export const opportunityFilterSchema = z.object({
  q: z.string().trim().max(200).default(""),
  kind: z.enum([...KIND_VALUES, ""]).default(""),
  focus: z.enum([...FOCUS_VALUES, ""]).default(""),
  region: z.enum([...REGION_VALUES, ""]).default(""),
  view: z.enum(OPPORTUNITY_VIEWS).default("all"),
});
export type OpportunityFilter = z.output<typeof opportunityFilterSchema>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** The filter in the Fellowships screen's address. */
export function opportunityFilterFromParams(params: Record<string, string | string[] | undefined>): OpportunityFilter {
  const parsed = opportunityFilterSchema.safeParse({
    q: one(params.q),
    kind: one(params.kind).toUpperCase(),
    focus: one(params.focus).toUpperCase(),
    region: one(params.region).toUpperCase(),
    view: one(params.view),
  });
  return parsed.success ? parsed.data : opportunityFilterSchema.parse({});
}

/** The Fellowships screen's address for a filter, leaving out the defaults. */
export function opportunityFilterHref(filter: OpportunityFilter): string {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.kind) params.set("kind", filter.kind.toLowerCase());
  if (filter.focus) params.set("focus", filter.focus.toLowerCase());
  if (filter.region) params.set("region", filter.region.toLowerCase());
  if (filter.view !== "all") params.set("view", filter.view);
  const query = params.toString();
  return query ? `/fellowships?${query}` : "/fellowships";
}

/** An entry is watching when the user put it on the list and didn't pass. */
export const isWatching = (status: OpportunityStatus | null) => status === "INTERESTED" || status === "PREPARING" || status === "APPLIED";

/** A one-line description of where it is, e.g. "Anywhere · AI safety · AI research". */
export function describeOpportunity(entry: Pick<Opportunity, "regions" | "focus">): string {
  const region = OPPORTUNITY_REGIONS.filter((option) => entry.regions.includes(option.value)).map((option) => option.label);
  const focus = OPPORTUNITY_FOCUS.filter((option) => entry.focus.includes(option.value)).map((option) => option.label);
  return [...region, ...focus].join(" · ");
}

/** The catalogue filtered and ordered: the priority entries first, then by name. */
export function filterOpportunities(entries: readonly OpportunityView[], filter: OpportunityFilter): OpportunityView[] {
  const needle = filter.q.toLowerCase();
  return entries
    .filter((entry) => {
      if (filter.kind && entry.kind !== filter.kind) return false;
      if (filter.focus && !entry.focus.includes(filter.focus)) return false;
      if (filter.region && !entry.regions.includes(filter.region)) return false;
      if (filter.view === "watching" && !entry.watching) return false;
      if (filter.view === "applied" && entry.status !== "APPLIED" && entry.status !== "AWARDED") return false;
      if (!needle) return true;
      return [entry.name, entry.org, entry.summary, entry.funding, entry.eligibility, ...entry.focus].join(" ").toLowerCase().includes(needle);
    })
    .sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || a.name.localeCompare(b.name));
}

export { STATUS_VALUES, KIND_VALUES, FOCUS_VALUES, REGION_VALUES };
