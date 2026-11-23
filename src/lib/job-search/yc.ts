import "server-only";

import { z } from "zod";

import { fetchPosting } from "@/lib/posting-fetch";
import { hnItemLink, readJobTitle } from "@/lib/startups/sources/yc";
import { htmlToText } from "@/lib/startups/text";

import type { PortalFields } from "@/lib/portals/engine";

import type { JobSourceAdapter, RequestContext } from "./adapter";
import { jobSearchError } from "./errors";
import { requestJson } from "./http";
import { POSTED_WITHIN, safeLink, type FoundPosting, type SearchPage, type SearchQuery } from "./search";

// Y Combinator startups' job posts, found through Hacker News' public search
// API (https://hn.algolia.com, no key), which indexes the job stories YC
// companies post ("Acme (YC W24) Is Hiring a Founding Engineer"). Only YC
// startups may post jobs on Hacker News. The search covers the last 90 days
// at most: older job posts are stale. Each story is a title and a link, so a
// posting's own page is read for its text when it's opened.

const HITS_PER_PAGE = 20;
/** Job posts older than this aren't worth showing, so "any time" still stops here. */
const MAX_AGE_DAYS = 90;
const TIMEOUT_MS = 15_000;

const maybeText = z.string().nullish().catch(null);
const maybeNumber = z.number().nullish().catch(null);

const hitSchema = z.object({
  objectID: z.union([z.string(), z.number()]),
  title: maybeText,
  url: maybeText,
  story_text: maybeText,
  created_at: maybeText,
  created_at_i: z.union([z.number(), z.string()]).nullish().catch(null),
});
type Hit = z.output<typeof hitSchema>;

const responseSchema = z.object({
  hits: z.array(z.unknown()),
  nbPages: maybeNumber,
  page: maybeNumber,
});

/** A place written in the title: "(Remote, worldwide)", "[Berlin]", "in Austin, TX". */
export function placeOf(text: string): string {
  const bracketed = [...text.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)].map((match) => (match[1] ?? match[2]).trim());
  const withoutBrackets = text.replace(/\s*[([][^)\]]*[)\]]/g, " ").replace(/\s+/g, " ").trim();
  const afterIn = /\bin\s+([A-Z][^()[\]]*)$/.exec(withoutBrackets)?.[1]?.trim();
  return [afterIn, ...bracketed].filter(Boolean).join(" · ").slice(0, 300);
}

function postedAtOf(hit: Hit): string | null {
  if (hit.created_at) {
    const parsed = Date.parse(hit.created_at);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  const seconds = Number(hit.created_at_i);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

export function postingFromHit(hit: Hit): FoundPosting | null {
  const full = (hit.title ?? "").trim();
  if (!full) return null;
  // "Acme (YC W24) Is Hiring a Founding Engineer in SF" → company, role, place.
  const { company, rest } = readJobTitle(full);
  const role = rest
    .replace(/^(?:is|are)\s+hiring\b[\s:–—-]*/i, "")
    .replace(/^(?:an?|for)\s+/i, "")
    .trim();
  const story = htmlToText(hit.story_text ?? "").slice(0, 100_000);
  const external = safeLink(hit.url);
  return {
    source: "YC",
    externalId: String(hit.objectID).slice(0, 500),
    title: (role || full).slice(0, 500),
    company: company.slice(0, 300),
    place: placeOf(rest),
    remote: /\bremote\b/i.test(full) ? true : null,
    salary: "",
    postedAt: postedAtOf(hit),
    url: (external || hnItemLink(hit.objectID)).slice(0, 2000),
    via: "Hacker News",
    description: story,
    // Without a page of its own, the story's text is all there is.
    complete: story.length > 0 || !external,
  };
}

/** It searched for its own text; keep the postings whose title holds every word asked for. */
function matchesKeywords(posting: FoundPosting, keywords: string): boolean {
  const terms = keywords.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length < 2) return true;
  const text = posting.title.toLowerCase();
  return terms.every((term) => text.includes(term));
}

function searchUrl(query: SearchQuery, page: number, baseUrl?: string): URL {
  const url = new URL(`${(baseUrl ?? "https://hn.algolia.com").replace(/\/+$/, "")}/api/v1/search_by_date`);
  const keywords = query.keywords.trim();
  if (keywords) url.searchParams.set("query", keywords);
  url.searchParams.set("tags", "job");
  url.searchParams.set("hitsPerPage", String(HITS_PER_PAGE));
  url.searchParams.set("page", String(page));
  // Always bounded: without a window, its answers reach back to 2015.
  const days = POSTED_WITHIN.find((option) => option.value === query.postedWithin)?.days ?? MAX_AGE_DAYS;
  const since = Math.floor((Date.now() - Math.min(days, MAX_AGE_DAYS) * 86_400_000) / 1000);
  url.searchParams.set("numericFilters", `created_at_i>${since}`);
  return url;
}

function pageNumber(next: string | null): number {
  if (!next?.startsWith("page:")) return 0;
  return Math.max(0, Number(next.slice("page:".length)) || 0);
}

async function searchPage(query: SearchQuery, _credentials: PortalFields, next: string | null, context: RequestContext = {}): Promise<SearchPage> {
  const page = pageNumber(next);
  const url = searchUrl(query, page, context.baseUrl);
  const answer = responseSchema.safeParse(await requestJson("YC", url, { signal: context.signal, timeoutMs: TIMEOUT_MS }));
  if (!answer.success) throw jobSearchError("changed", "YC", { detail: `${url.pathname}: unexpected answer` });

  const seen = new Set<string>();
  const postings: FoundPosting[] = [];
  for (const item of answer.data.hits) {
    const hit = hitSchema.safeParse(item);
    if (!hit.success) continue;
    const posting = postingFromHit(hit.data);
    if (!posting || seen.has(posting.externalId)) continue;
    seen.add(posting.externalId);
    if (!matchesKeywords(posting, query.keywords)) continue;
    if (query.remoteOnly && posting.remote !== true) continue;
    postings.push(posting);
  }

  const pages = answer.data.nbPages ?? null;
  const more = pages != null ? page + 1 < pages : answer.data.hits.length >= HITS_PER_PAGE;
  return { postings, next: more ? `page:${page + 1}` : null };
}

export const yc: JobSourceAdapter<"YC"> = {
  source: "YC",
  search: searchPage,
  // A job story is a title and a link: read the page it leads to for its text.
  details: async (posting) => {
    // A Hacker News item is a discussion, not the posting.
    if (!posting.url || !safeLink(posting.url) || new URL(posting.url).hostname === "news.ycombinator.com") return null;
    const page = await fetchPosting(posting.url);
    return page.ok ? page.text : null;
  },
  test: async (_credentials, context) => {
    await searchPage({ keywords: "engineer", place: "", country: "us", radiusKm: 25, remoteOnly: false, postedWithin: "month" }, {}, null, context);
  },
};
