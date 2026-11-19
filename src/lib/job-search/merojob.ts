import "server-only";

import { z } from "zod";

import { htmlToText } from "@/lib/startups/text";

import type { JobSourceAdapter, RequestContext } from "./adapter";
import { jobSearchError } from "./errors";
import { requestJson } from "./http";
import { POSTED_WITHIN, safeLink, type FoundPosting, type SearchPage, type SearchQuery } from "./search";

// merojob (https://merojob.com), Nepal's job board, over the public JSON API
// its own site uses (https://api.merojob.com, no key). Its `q` is a substring
// search over one field, so two words ("software engineer") find nothing: the
// search sends the longest word and keeps the postings that hold all of them.
// `location` takes one of the board's own place slugs; a place outside that
// list (or "Nepal") searches the whole country.

const ORIGIN = "https://api.merojob.com";
const SITE = "https://merojob.com";
const SEARCH_PATH = "/api/v1/jobs/";
const PAGE_SIZE = 20;
/** Its answers carry each posting's whole text, so a page runs to about a megabyte. */
const TIMEOUT_MS = 20_000;

/**
 * The places its `location` filter knows (its own geographic choices, from
 * the search page's filters), as slugs. Its list covers only part of Nepal;
 * anywhere else is searched country-wide.
 */
const LOCATION_SLUGS = new Set([
  "banepa",
  "bara",
  "bhaktapur",
  "biratnagar",
  "birgunj",
  "chitwan",
  "dang",
  "dhading",
  "dhangadhi",
  "jhapa",
  "kathmandu",
  "kavre",
  "lalitpur",
  "nepalgunj",
  "okhaldhunga",
  "pokhara",
  "rautahat",
  "rolpa",
  "saptari",
  "siraha",
  "solukhumbu",
  "surkhet",
]);

const maybeText = z.string().nullish().catch(null);
const maybeNumber = z.number().nullish().catch(null);

const locationSchema = z
  .object({ name: maybeText, address: maybeText, district: maybeText, country: maybeText })
  .nullish()
  .catch(null);

const salarySchema = z
  .object({ currency: maybeText, minimum: maybeNumber, maximum: maybeNumber, unit: maybeText })
  .nullish()
  .catch(null);

const jobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: maybeText,
  slug: maybeText,
  absolute_url: maybeText,
  description: maybeText,
  specification: maybeText,
  job_summary: maybeText,
  hide_org_name: z.boolean().nullish().catch(null),
  hide_salary: z.boolean().nullish().catch(null),
  posted_at: maybeText,
  client: z.object({ client_name: maybeText }).nullish().catch(null),
  offered_salary: salarySchema,
  job_locations: z.array(locationSchema).nullish().catch(null),
});
type Job = z.output<typeof jobSchema>;

const responseSchema = z.object({
  count: maybeNumber,
  next: maybeText,
  results: z.array(z.unknown()),
});

const PERIODS: Record<string, string> = { monthly: "a month", yearly: "a year", weekly: "a week", daily: "a day", hourly: "an hour" };

const REMOTE = /\b(remote|work from home|work-from-home|wfh|anywhere)\b/i;

function salaryOf(job: Job): string {
  if (job.hide_salary) return "";
  const salary = job.offered_salary;
  if (!salary) return "";
  const { minimum: min, maximum: max } = salary;
  if (min == null && max == null) return "";
  const amount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const range = min != null && max != null && min !== max ? `${amount(min)}–${amount(max)}` : amount((min ?? max)!);
  const period = PERIODS[(salary.unit ?? "").toLowerCase()];
  return [salary.currency, range, period].filter(Boolean).join(" ");
}

function placesOf(job: Job): string[] {
  const parts: string[] = [];
  for (const location of job.job_locations ?? []) {
    if (!location) continue;
    for (const value of [location.address, location.name, location.district, location.country]) {
      const text = value?.trim();
      if (text && !parts.includes(text)) parts.push(text);
    }
  }
  return parts;
}

function remoteOf(job: Job, places: string[]): boolean | null {
  return REMOTE.test([job.title, job.job_summary, ...places].filter(Boolean).join(" ")) ? true : null;
}

function postedAtOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function postingFromJob(job: Job): FoundPosting {
  const places = placesOf(job);
  const description = [htmlToText(job.description ?? ""), htmlToText(job.specification ?? "")]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 100_000);
  const page = job.absolute_url?.trim() || (job.slug ? `/${job.slug}/` : "");
  return {
    source: "MEROJOB",
    externalId: String(job.id).slice(0, 500),
    title: (job.title ?? "").trim().slice(0, 500),
    company: (job.hide_org_name ? "" : (job.client?.client_name ?? "")).trim().slice(0, 300),
    place: (places.join(" · ") || "Nepal").slice(0, 300),
    remote: remoteOf(job, places),
    salary: salaryOf(job).slice(0, 200),
    postedAt: postedAtOf(job.posted_at),
    url: (page.startsWith("/") ? safeLink(`${SITE}${page}`) : safeLink(page)).slice(0, 2000),
    via: "",
    description,
    complete: true,
  };
}

/** The word its `q` searches for: the longest, which is usually the one that narrows the most. */
function searchTerm(keywords: string): string {
  const words = keywords.trim().split(/\s+/).filter(Boolean);
  return [...words].sort((a, b) => b.length - a.length)[0] ?? "";
}

/** The place as one of its own slugs; null for anywhere it doesn't know, or for the whole country. */
export function locationSlug(place: string): string | null {
  const words = place
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return null;
  // "Kathmandu Valley", "Lalitpur District": the first word is the place.
  if (LOCATION_SLUGS.has(words[0])) return words[0];
  const joined = words.join("-");
  return LOCATION_SLUGS.has(joined) ? joined : null;
}

function searchUrl(query: SearchQuery, offset: number, baseUrl?: string): URL {
  const url = new URL(`${(baseUrl ?? ORIGIN).replace(/\/+$/, "")}${SEARCH_PATH}`);
  const term = searchTerm(query.keywords);
  if (term) url.searchParams.set("q", term);
  const location = locationSlug(query.place);
  if (location) url.searchParams.set("location", location);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  // Its created_at filter takes an ISO date or datetime.
  const days = POSTED_WITHIN.find((option) => option.value === query.postedWithin)?.days;
  if (days) url.searchParams.set("created_at", new Date(Date.now() - days * 86_400_000).toISOString());
  return url;
}

function pageOffset(next: string | null): number {
  if (!next?.startsWith("offset:")) return 0;
  return Math.max(0, Number(next.slice("offset:".length)) || 0);
}

/** It searched for one of the words; keep the postings that hold all of them. */
function matchesKeywords(posting: FoundPosting, keywords: string): boolean {
  const terms = keywords.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length < 2) return true;
  const text = `${posting.title} ${posting.company} ${posting.place} ${posting.description}`.toLowerCase();
  return terms.every((term) => text.includes(term));
}

async function searchPage(query: SearchQuery, _credentials: Record<string, never>, next: string | null, context: RequestContext = {}): Promise<SearchPage> {
  const offset = pageOffset(next);
  const url = searchUrl(query, offset, context.baseUrl);
  const answer = responseSchema.safeParse(await requestJson("MEROJOB", url, { signal: context.signal, timeoutMs: TIMEOUT_MS }));
  if (!answer.success) throw jobSearchError("changed", "MEROJOB", { detail: `${url.pathname}: unexpected answer` });

  const seen = new Set<string>();
  const postings: FoundPosting[] = [];
  for (const item of answer.data.results) {
    const job = jobSchema.safeParse(item);
    if (!job.success || seen.has(String(job.data.id))) continue;
    seen.add(String(job.data.id));
    const posting = postingFromJob(job.data);
    if (!matchesKeywords(posting, query.keywords)) continue;
    if (query.remoteOnly && posting.remote !== true) continue;
    postings.push(posting);
  }

  const total = answer.data.count ?? null;
  const nextOffset = offset + PAGE_SIZE;
  const more = total != null ? nextOffset < total : answer.data.results.length >= PAGE_SIZE;
  return { postings, next: more ? `offset:${nextOffset}` : null };
}

export const merojob: JobSourceAdapter<"MEROJOB"> = {
  source: "MEROJOB",
  search: searchPage,
  // Every posting comes with its whole text.
  details: async () => null,
  test: async (_credentials, context) => {
    await searchPage({ keywords: "developer", place: "", country: "np", radiusKm: 25, remoteOnly: false, postedWithin: "any" }, {}, null, context);
  },
};
