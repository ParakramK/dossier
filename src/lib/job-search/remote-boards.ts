import "server-only";

import { fetchPosting } from "@/lib/posting-fetch";
import { htmlToText } from "@/lib/startups/text";

import type { JobSourceAdapter, RequestContext } from "./adapter";
import { jobSearchError } from "./errors";
import { requestJson, requestText } from "./http";
import { POSTED_WITHIN, safeLink, type FoundPosting, type SearchPage, type SearchQuery } from "./search";

// Public remote-job boards found in pix-codes/applyhelp. None needs a key.
// Each answers a whole list, so Dossier pages through it locally instead of
// asking again; keywords and "posted within" are filtered here too. Every
// posting on these boards is remote, so a distance from the place means nothing.

type BoardSource = "ARBEITNOW" | "JOBICY" | "REMOTEOK" | "NODESK" | "REALWORK" | "WEWORKREMOTELY";

const PAGE_SIZE = 20;
const TIMEOUT_MS = 20_000;

const asText = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

function dateOf(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  const unix = /^\d{9,10}$/.test(raw) ? Number(raw) * 1000 : /^\d{13}$/.test(raw) ? Number(raw) : NaN;
  const parsed = Number.isFinite(unix) ? unix : Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function salaryOf(min: unknown, max: unknown, currency: unknown): string {
  const code = asText(currency) || "USD";
  const low = Number(min);
  const high = Number(max);
  if (!Number.isFinite(low) || low <= 0) return "";
  return Number.isFinite(high) && high > low ? `${code} ${low}–${high}` : `${code} ${low}+`;
}

function rssTag(block: string, name: string): string {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
  let value = (match?.[1] ?? "").trim();
  // XML feeds often wrap a description in CDATA so their HTML isn't escaped.
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(value);
  if (cdata) value = cdata[1].trim();
  return value;
}

function rssItems(xml: string): Record<string, unknown>[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => ({
    title: rssTag(match[1], "title"),
    link: rssTag(match[1], "link"),
    description: rssTag(match[1], "description"),
    pubDate: rssTag(match[1], "pubDate"),
    guid: rssTag(match[1], "guid"),
  }));
}

/** "Company - Role", "Role at Company" or "Company: Role", as the feeds write them. */
function titleAndCompany(raw: string, separator: "dash" | "at" | "colon"): { title: string; company: string } {
  const text = asText(raw).trim();
  if (separator === "at") {
    const parts = text.split(/\s+at\s+/i);
    return parts.length > 1 ? { title: parts[0].trim(), company: parts.slice(1).join(" at ").trim() } : { title: text, company: "Remote company" };
  }
  const parts = text.split(separator === "dash" ? /\s+[-–]\s+/ : /\s*:\s*/);
  if (separator === "dash" && parts.length > 1) return { company: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  if (separator === "colon" && parts.length > 1) return { company: parts[0].trim(), title: parts.slice(1).join(": ").trim() };
  return { title: text, company: "Remote company" };
}

type Board = {
  source: BoardSource;
  url: string;
  kind: "json" | "rss";
  items: (answer: unknown) => unknown[];
  posting: (item: Record<string, unknown>) => FoundPosting | null;
};

const boards: readonly Board[] = [
  {
    source: "ARBEITNOW",
    url: "https://www.arbeitnow.com/api/job-board-api",
    kind: "json",
    items: (answer) => ((answer as { data?: unknown[] })?.data ?? []),
    posting: (item) => ({
      source: "ARBEITNOW",
      externalId: asText(item.slug || item.url).slice(0, 500),
      title: asText(item.title).slice(0, 500),
      company: asText(item.company_name).slice(0, 300),
      place: asText(item.location) || (item.remote === true ? "Remote" : ""),
      remote: item.remote === true ? true : null,
      salary: "",
      postedAt: dateOf(item.created_at),
      url: safeLink(asText(item.url)),
      via: "",
      description: htmlToText(asText(item.description)),
      complete: true,
    }),
  },
  {
    source: "JOBICY",
    url: "https://jobicy.com/api/v2/remote-jobs?count=50&industry=engineering",
    kind: "json",
    items: (answer) => ((answer as { jobs?: unknown[] })?.jobs ?? []),
    posting: (item) => {
      return {
        source: "JOBICY",
        externalId: asText(item.id || item.url).slice(0, 500),
        title: asText(item.jobTitle).slice(0, 500),
        company: asText(item.companyName).slice(0, 300),
        place: asText(item.jobGeo) || "Remote",
        remote: true,
        salary: salaryOf(item.annualSalaryMin, item.annualSalaryMax, item.salaryCurrency).slice(0, 200),
        postedAt: dateOf(item.pubDate),
        url: safeLink(asText(item.url)),
        via: "",
        description: htmlToText(asText(item.jobDescription || item.jobExcerpt)),
        complete: true,
      };
    },
  },
  {
    source: "REMOTEOK",
    url: "https://remoteok.com/api",
    kind: "json",
    // Its first entry is a legal notice, not a job.
    items: (answer) => (Array.isArray(answer) ? answer.filter((item) => !item || typeof item !== "object" || !("legal" in item)) : []),
    posting: (item) => ({
      source: "REMOTEOK",
      externalId: asText(item.id || item.url).slice(0, 500),
      title: asText(item.position).slice(0, 500),
      company: asText(item.company).slice(0, 300),
      place: asText(item.location) || "Worldwide",
      remote: true,
      salary: salaryOf(item.salary_min, item.salary_max, "USD").slice(0, 200),
      postedAt: dateOf(item.epoch),
      url: safeLink(asText(item.url || item.apply_url)),
      via: "",
      description: htmlToText(asText(item.description)),
      complete: true,
    }),
  },
  {
    source: "NODESK",
    url: "https://nodesk.co/remote-jobs/index.xml",
    kind: "rss",
    items: (answer) => rssItems(asText(answer)),
    posting: (item) => {
      const { title, company } = titleAndCompany(asText(item.title), "dash");
      const { title: atTitle, company: atCompany } = titleAndCompany(asText(item.title), "at");
      const name = /\s+at\s+/i.test(asText(item.title)) ? atTitle : title;
      const employer = /\s+at\s+/i.test(asText(item.title)) ? atCompany : company;
      return {
        source: "NODESK",
        externalId: asText(item.guid || item.link).slice(0, 500),
        title: name.slice(0, 500),
        company: employer.slice(0, 300),
        place: "Worldwide",
        remote: true,
        salary: "",
        postedAt: dateOf(item.pubDate),
        url: safeLink(asText(item.link)),
        via: "",
        description: htmlToText(asText(item.description)),
        complete: false,
      };
    },
  },
  {
    source: "REALWORK",
    url: "https://www.realworkfromanywhere.com/rss.xml",
    kind: "rss",
    items: (answer) => rssItems(asText(answer)),
    posting: (item) => {
      const { title, company } = titleAndCompany(asText(item.title), "at");
      return {
        source: "REALWORK",
        externalId: asText(item.guid || item.link).slice(0, 500),
        title: title.slice(0, 500),
        company: company.slice(0, 300),
        place: "Worldwide",
        remote: true,
        salary: "",
        postedAt: dateOf(item.pubDate),
        url: safeLink(asText(item.link)),
        via: "",
        description: htmlToText(asText(item.description)),
        complete: false,
      };
    },
  },
  {
    source: "WEWORKREMOTELY",
    url: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    kind: "rss",
    items: (answer) => rssItems(asText(answer)),
    posting: (item) => {
      const { title, company } = titleAndCompany(asText(item.title), "colon");
      return {
        source: "WEWORKREMOTELY",
        externalId: asText(item.guid || item.link).slice(0, 500),
        title: title.slice(0, 500),
        company: company.slice(0, 300),
        place: "Worldwide",
        remote: true,
        salary: "",
        postedAt: dateOf(item.pubDate),
        url: safeLink(asText(item.link)),
        via: "",
        description: htmlToText(asText(item.description)),
        complete: false,
      };
    },
  },
];

const BY_SOURCE = new Map(boards.map((board) => [board.source, board]));

function matches(posting: FoundPosting, query: SearchQuery): boolean {
  const terms = query.keywords.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = `${posting.title} ${posting.company} ${posting.description}`.toLowerCase();
  return terms.every((term) => text.includes(term));
}

function offsetOf(next: string | null): number {
  return next?.startsWith("offset:") ? Math.max(0, Number(next.slice(7)) || 0) : 0;
}

async function searchPage(board: Board, query: SearchQuery, next: string | null, context: RequestContext): Promise<SearchPage> {
  const url = new URL(context.baseUrl ?? board.url);
  const answer = board.kind === "json"
    ? await requestJson(board.source, url, { signal: context.signal, timeoutMs: TIMEOUT_MS })
    : await requestText(board.source, url, { signal: context.signal, timeoutMs: TIMEOUT_MS });

  let items: unknown[];
  try {
    items = board.items(answer);
  } catch {
    throw jobSearchError("changed", board.source, { detail: `${url.pathname}: unexpected answer` });
  }

  const days = POSTED_WITHIN.find((option) => option.value === query.postedWithin)?.days ?? null;
  const since = days ? Date.now() - days * 86_400_000 : null;
  const seen = new Set<string>();
  const found: FoundPosting[] = [];
  for (const item of items) {
    const posting = board.posting((item ?? {}) as Record<string, unknown>);
    if (!posting || !posting.externalId || !posting.title || !posting.url || seen.has(posting.externalId)) continue;
    seen.add(posting.externalId);
    if (since !== null && posting.postedAt && Date.parse(posting.postedAt) < since) continue;
    if (matches(posting, query)) found.push(posting);
  }

  const place = query.place.trim().toLowerCase();
  if (place) found.sort((a, b) => Number(b.place.toLowerCase().includes(place)) - Number(a.place.toLowerCase().includes(place)));

  const offset = offsetOf(next);
  return {
    postings: found.slice(offset, offset + PAGE_SIZE),
    next: offset + PAGE_SIZE < found.length ? `offset:${offset + PAGE_SIZE}` : null,
  };
}

function adapterFor<S extends BoardSource>(source: S): JobSourceAdapter<S> {
  const board = BY_SOURCE.get(source);
  if (!board) throw new Error(`No remote board ${source}.`);
  return {
    source,
    search: (query: SearchQuery, _credentials: Record<string, never>, next: string | null, context: RequestContext = {}) => searchPage(board, query, next, context),
    details: async (posting: FoundPosting) => {
      if (posting.complete) return posting.description;
      const page = await fetchPosting(posting.url);
      return page.ok ? page.text : null;
    },
    test: async (_credentials: Record<string, never>, context: RequestContext = {}) => {
      await searchPage(board, { keywords: "engineer", place: "", country: "", radiusKm: 25, remoteOnly: false, postedWithin: "any" }, null, context);
    },
  };
}

export const arbeitnow = adapterFor("ARBEITNOW");
export const jobicy = adapterFor("JOBICY");
export const remoteok = adapterFor("REMOTEOK");
export const nodesk = adapterFor("NODESK");
export const realwork = adapterFor("REALWORK");
export const weworkremotely = adapterFor("WEWORKREMOTELY");
