import "server-only";

import { z } from "zod";

import { fetchPosting } from "@/lib/posting-fetch";
import { htmlToText } from "@/lib/startups/text";

import type { JobSourceAdapter, RequestContext } from "./adapter";
import { countryName } from "./countries";
import { jobSearchError } from "./errors";
import { requestJson } from "./http";
import { POSTED_WITHIN, safeLink, type FoundPosting, type SearchPage, type SearchQuery } from "./search";

// Remotive (https://remotive.com), a remote-only job board. Its documented
// public API (https://remotive.com/api/remote-jobs) answers a fixed sample
// of recent postings and ignores its filters, so the search asks the same
// endpoint its own search page uses (/api/v2/jobs/search/). A posting's page
// is read for its text when it's opened. Its terms ask for a link back to
// Remotive and its name beside the results.

const ORIGIN = "https://remotive.com";
const SEARCH_PATH = "/api/v2/jobs/search/";
const PAGE_SIZE = 20;
const TIMEOUT_MS = 20_000;

/**
 * The places its location filter knows, as its search lists them. A country
 * outside the list is searched without the filter, and its postings are kept
 * only when they're open worldwide or name the country.
 */
const FILTER_LOCATIONS = new Set(
  `Albania
Argentina
Armenia
Australia
Austria
Azerbaijan
Bahrain
Belarus
Belgium
Bolivia
Bosnia and Herzegovina
Brazil
Bulgaria
Canada
Central America
Chile
China
Colombia
Costa Rica
Croatia
Cyprus
Czech Republic
Denmark
Dominican Republic
Eastern Europe
Ecuador
Egypt
El Salvador
Estonia
Europe
Finland
France
French Guiana
Georgia
Germany
Greece
Guatemala
Guyana
Honduras
Hungary
Iceland
India
Iraq
Ireland
Israel
Italy
Japan
Jordan
Kuwait
Latin America (LATAM)
Latvia
Lebanon
Lithuania
Luxembourg
Malta
Mexico
Moldova
Monaco
Montenegro
Netherlands
Nicaragua
North Macedonia
Northern America
Northern Europe
Norway
Oman
Pakistan
Panama
Paraguay
Peru
Philippines
Poland
Portugal
Puerto Rico
Qatar
Romania
Saudi Arabia
Serbia
Singapore
Slovakia
Slovenia
South Africa
South America
Southern Europe
Spain
State of Palestine
Suriname
Sweden
Switzerland
Turkey
UK
USA
Ukraine
United Arab Emirates
Uruguay
Venezuela
Vietnam
Western Asia (Middle East)
Western Europe
Yemen`.split("\n"),
);

/** Country names that differ from the ones the search form uses. */
const COUNTRY_ALIASES: Record<string, string> = {
  us: "USA",
  gb: "UK",
  cz: "Czech Republic",
  tr: "Turkey",
  ps: "State of Palestine",
};

const maybeText = z.string().nullish().catch(null);
const maybeNumber = z.number().nullish().catch(null);

const hitSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: maybeText,
  company_name: maybeText,
  locations: z.array(z.string()).nullish().catch(null),
  url: maybeText,
  remotive_com_url: maybeText,
  salary: maybeText,
  category: maybeText,
  job_type: maybeText,
  discovered_on: maybeText,
});
type Hit = z.output<typeof hitSchema>;

const resultSchema = z.object({
  hits: z.array(z.unknown()),
  nbPages: maybeNumber,
});

const responseSchema = z.object({
  result: z.object({ results: z.array(resultSchema) }),
});

/** The location filter for a country, or null when Remotive doesn't list it. */
export function locationFilter(country: string): string | null {
  if (!/^[a-z]{2}$/i.test(country)) return null;
  const code = country.toLowerCase();
  const name = COUNTRY_ALIASES[code] ?? countryName(code);
  return FILTER_LOCATIONS.has(name) ? name : null;
}

function postedAtOf(value: string | null | undefined): string | null {
  if (!value) return null;
  // "2026-11-18 22:31:20": UTC, as its site reads it.
  const withZone = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const parsed = Date.parse(withZone);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function salaryOf(value: string | null | undefined): string {
  const salary = (value ?? "").trim();
  return /^unspecified$/i.test(salary) ? "" : salary;
}

export function postingFromHit(hit: Hit): FoundPosting {
  // It highlights the searched words with <em>; the title is the plain text.
  const title = htmlToText(hit.title ?? "").trim();
  const places = (hit.locations ?? []).map((place) => place.trim()).filter(Boolean);
  return {
    source: "REMOTIVE",
    externalId: String(hit.id).slice(0, 500),
    title: title.slice(0, 500),
    company: htmlToText(hit.company_name ?? "")
      .trim()
      .slice(0, 300),
    place: (places.join(" · ") || "Remote").slice(0, 300),
    // Every posting on the board is remote.
    remote: true,
    salary: salaryOf(hit.salary).slice(0, 200),
    postedAt: postedAtOf(hit.discovered_on),
    // Its own page, which its terms ask Dossier to link to.
    url: safeLink(hit.remotive_com_url ?? "") || safeLink(hit.url ?? ""),
    via: "",
    // The search answer doesn't carry the text; opening the posting reads its page.
    description: "",
    complete: false,
  };
}

/** Whether a posting says it's open where the user is, when Remotive has no filter for the country. */
function openToCountry(posting: FoundPosting, country: string): boolean {
  const name = (COUNTRY_ALIASES[country] ?? countryName(country)).toLowerCase();
  return /\bworldwide\b/i.test(posting.place) || posting.place.toLowerCase().includes(name);
}

/** The place the search asks for, when it names one: a posting's own locations must hold it. */
function openToPlace(posting: FoundPosting, place: string): boolean {
  return posting.place.toLowerCase().includes(place.trim().toLowerCase());
}

function searchUrl(baseUrl?: string): URL {
  return new URL(`${(baseUrl ?? ORIGIN).replace(/\/+$/, "")}${SEARCH_PATH}`);
}

function pageNumber(next: string | null): number {
  if (!next?.startsWith("page:")) return 0;
  return Math.max(0, Number(next.slice("page:".length)) || 0);
}

function requestBody(query: SearchQuery, page: number): unknown {
  const params = new URLSearchParams();
  const keywords = query.keywords.trim();
  if (keywords) params.set("query", keywords);
  params.set("hitsPerPage", String(PAGE_SIZE));
  params.set("page", String(page));
  // What its own search page sends.
  params.set("skillsOperator", "or");
  params.set("locationMode", "open");
  const location = locationFilter(query.country);
  if (location) params.set("facetFilters", JSON.stringify([[`location_filters:${location}`]]));
  return { requests: [{ indexName: "remotive_unlimited", params: params.toString() }] };
}

async function searchPage(query: SearchQuery, _credentials: Record<string, never>, next: string | null, context: RequestContext = {}): Promise<SearchPage> {
  const page = pageNumber(next);
  const url = searchUrl(context.baseUrl);
  const answer = responseSchema.safeParse(
    await requestJson("REMOTIVE", url, { body: requestBody(query, page), forbidden: "unavailable", signal: context.signal, timeoutMs: TIMEOUT_MS }),
  );
  if (!answer.success) throw jobSearchError("changed", "REMOTIVE", { detail: `${url.pathname}: unexpected answer` });

  const result = answer.data.result.results[0];
  if (!result) throw jobSearchError("changed", "REMOTIVE", { detail: `${url.pathname}: no results` });

  // An older search asks for "any time"; Remotive's own default is all active postings.
  const days = POSTED_WITHIN.find((option) => option.value === query.postedWithin)?.days ?? null;
  const since = days ? Date.now() - days * 86_400_000 : null;
  const location = locationFilter(query.country);
  const place = query.place.trim();

  const seen = new Set<string>();
  const postings: FoundPosting[] = [];
  for (const item of result.hits) {
    const hit = hitSchema.safeParse(item);
    if (!hit.success || seen.has(String(hit.data.id))) continue;
    seen.add(String(hit.data.id));
    const posting = postingFromHit(hit.data);
    if (!posting.title || !posting.url) continue;
    if (since !== null && (posting.postedAt === null || Date.parse(posting.postedAt) < since)) continue;
    if (query.country && !location && !openToCountry(posting, query.country)) continue;
    if (place && !openToPlace(posting, place)) continue;
    postings.push(posting);
  }

  const pages = result.nbPages ?? null;
  const more = pages != null ? page + 1 < pages : result.hits.length >= PAGE_SIZE;
  return { postings, next: more ? `page:${page + 1}` : null };
}

export const remotive: JobSourceAdapter<"REMOTIVE"> = {
  source: "REMOTIVE",
  search: searchPage,
  // The search answer is a title, a company and where it's open; the posting's page has its text.
  details: async (posting) => {
    if (!posting.url || !safeLink(posting.url)) return null;
    const page = await fetchPosting(posting.url);
    return page.ok ? page.text : null;
  },
  test: async (_credentials, context) => {
    await searchPage({ keywords: "engineer", place: "", country: "us", radiusKm: 25, remoteOnly: false, postedWithin: "any" }, {}, null, context);
  },
};
