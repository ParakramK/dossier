import "server-only";

import { z } from "zod";

import { getJson, SourceError } from "../http";
import { companySite, emailLabel, findEmails, firstLine, htmlToText } from "../text";
import type { FoundStartup } from "../types";

// Himalayas' public job feed (https://himalayas.app/jobs/api), a remote-first
// board with each posting's text. It answers twenty at a time and pages with
// a cursor; a handful of pages covers the newest roles. Only AI-related roles
// are kept, since that's the work this list is for.

const API = "https://himalayas.app/jobs/api";
/** Twenty a page whatever we ask, so this is how many pages a refresh reads. */
const PAGES = 8;

const jobSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string().nullish(),
  companyName: z.string().min(1),
  companySlug: z.string().nullish(),
  locationRestrictions: z.array(z.string()).nullish(),
  timezoneRestrictions: z.array(z.number()).nullish(),
  categories: z.array(z.string()).nullish(),
  parentCategories: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  pubDate: z.number().nullish(),
  expiryDate: z.number().nullish(),
  applicationLink: z.string().nullish(),
  guid: z.string().nullish(),
});
type Job = z.output<typeof jobSchema>;

const pageSchema = z.object({ jobs: z.array(jobSchema), nextCursor: z.string().nullish() });

const AI = /\b(ai|a\.i\.|ml|machine[- ]learning|deep[- ]learning|llm|llms|nlp|data scien\w*|computer vision|generative|applied scientist|research engineer|mlops|prompt engineer)\b/i;
const ANYWHERE = /^(anywhere|worldwide|global)$/i;

/** Whether a job is about AI or data work, read from what it calls itself. */
export function isAiJob(job: Pick<Job, "title" | "categories" | "parentCategories">): boolean {
  return AI.test([job.title, ...(job.categories ?? []), ...(job.parentCategories ?? [])].join(" "));
}

/** A Himalayas job as a startup, or null when it isn't AI work or has no page. */
export function startupFromHimalayasJob(job: Job): FoundStartup | null {
  if (!isAiJob(job)) return null;
  const text = htmlToText(job.description ?? job.excerpt ?? "");
  const places = (job.locationRestrictions ?? []).map((place) => place.trim()).filter(Boolean);
  const anywhere = places.length === 0 || places.some((place) => ANYWHERE.test(place));
  const companyPage = job.companySlug ? `https://himalayas.app/companies/${job.companySlug}` : "";
  const jobUrl = [job.applicationLink, job.guid].find((url) => url && /^https?:\/\//i.test(url)) ?? "";
  if (!jobUrl) return null;
  const externalId = job.guid || job.applicationLink || `${job.companyName}:${job.title}`;
  return {
    source: "HIMALAYAS",
    externalId,
    company: job.companyName.slice(0, 200),
    website: companyPage || companySite(jobUrl),
    summary: firstLine(job.excerpt ? htmlToText(job.excerpt) : text) || job.title.slice(0, 220),
    details: [job.title, text].filter(Boolean).join("\n\n").slice(0, 20_000),
    location: anywhere ? "Remote · anywhere" : `Remote · ${places.join(", ")}`.slice(0, 300),
    remote: true,
    stage: "",
    roles: [job.title.slice(0, 160)],
    emails: findEmails(text)
      .slice(0, 4)
      .map((email) => ({ email, label: emailLabel(email), from: jobUrl, onRequest: false, foundAt: job.pubDate ? new Date(job.pubDate * 1000).toISOString() : "" })),
    links: [
      { label: "Job page", url: jobUrl },
      ...(companyPage ? [{ label: "Company on Himalayas", url: companyPage }] : []),
    ],
    postedAt: job.pubDate ? new Date(job.pubDate * 1000).toISOString() : null,
  };
}

/** AI-related remote roles from the newest pages of Himalayas' feed. */
export async function fetchHimalayasStartups(signal?: AbortSignal): Promise<FoundStartup[]> {
  const found: FoundStartup[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PAGES; page += 1) {
    signal?.throwIfAborted();
    const answer = pageSchema.safeParse(await getJson(`${API}?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }));
    if (!answer.success) throw new SourceError("changed its format");
    found.push(...answer.data.jobs.flatMap((job) => startupFromHimalayasJob(job) ?? []));
    cursor = answer.data.nextCursor ?? null;
    if (!cursor || answer.data.jobs.length === 0) break;
  }
  return found;
}
