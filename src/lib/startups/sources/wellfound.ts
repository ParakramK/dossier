import "server-only";

import { z } from "zod";

import { getText, SourceError } from "../http";
import { emailLabel, findEmails, firstLine, htmlToText } from "../text";
import type { FoundStartup } from "../types";

// Wellfound (formerly AngelList Talent) role pages. Its search results are
// rendered into the page's __NEXT_DATA__, including each startup's stage
// badge and the jobs it highlights, so a page or two gives recent remote
// roles without an account. Only AI-related roles are kept.

const PAGES = [
  "https://wellfound.com/role/r/software-engineer",
  "https://wellfound.com/role/r/machine-learning-engineer",
  "https://wellfound.com/role/r/data-scientist",
];
/** Enough for a daily list without reading every page wellfound has. */
const MAX_JOBS = 80;

const refSchema = z.object({ __ref: z.string() });
const badgeSchema = refSchema;
const startupSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  slug: z.string().min(1),
  highConcept: z.string().nullish(),
  badges: z.array(badgeSchema).nullish(),
  highlightedJobListings: z.array(refSchema).nullish(),
});
const jobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().min(1),
  slug: z.string().nullish(),
  description: z.string().nullish(),
  remote: z.boolean().nullish(),
  locationNames: z.array(z.string()).nullish(),
  acceptedRemoteLocationNames: z.array(z.string()).nullish(),
  compensation: z.string().nullish(),
  liveStartAt: z.number().nullish(),
});
const badgeEntitySchema = z.object({ id: z.string(), label: z.string().nullish(), name: z.string().nullish() });
const pageSchema = z.object({
  props: z.object({
    pageProps: z.object({
      apolloState: z.object({ data: z.record(z.string(), z.unknown()) }),
    }),
  }),
});

type Job = z.output<typeof jobSchema>;
type Startup = z.output<typeof startupSchema>;

const AI = /\b(ai|a\.i\.|ml|machine[- ]learning|deep[- ]learning|llm|llms|nlp|data scien\w*|computer vision|generative|applied scientist|research engineer)\b/i;
const STAGE = "COMPANY_STAGE_BADGE";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** The __NEXT_DATA__ object a page carries, or null when it has none. */
export function nextData(html: string): unknown {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** The search results on a Wellfound role page, as [startup, job, stage] lines. */
export function readWellfoundPage(data: unknown): { startup: Startup; job: Job; stage: string }[] {
  const parsed = pageSchema.safeParse(data);
  if (!parsed.success) return [];
  const entities = parsed.data.props.pageProps.apolloState.data;
  const root = asRecord(entities.ROOT_QUERY);
  const talent = asRecord(root?.talent);
  if (!talent) return [];
  const key = Object.keys(talent).find((name) => name.startsWith("seoLandingPageJobSearchResults"));
  const results = asRecord(key ? talent[key] : null);
  const refs = Array.isArray(results?.startups) ? results.startups : [];
  const lines: { startup: Startup; job: Job; stage: string }[] = [];
  for (const ref of refs) {
    const refId = refSchema.safeParse(ref);
    if (!refId.success) continue;
    const startup = startupSchema.safeParse(entities[refId.data.__ref]);
    if (!startup.success) continue;
    const stage = (startup.data.badges ?? [])
      .map((badge) => badgeEntitySchema.safeParse(entities[badge.__ref]))
      .find((badge) => badge.success && badge.data.name === STAGE);
    for (const listing of startup.data.highlightedJobListings ?? []) {
      const job = jobSchema.safeParse(entities[listing.__ref]);
      if (job.success) lines.push({ startup: startup.data, job: job.data, stage: stage?.success ? (stage.data.label ?? "") : "" });
    }
  }
  return lines;
}

/** A Wellfound job as a startup, or null when it isn't AI work. */
export function startupFromWellfoundJob(startup: Startup, job: Job, stage: string): FoundStartup | null {
  if (!AI.test([job.title, startup.highConcept ?? ""].join(" "))) return null;
  const text = htmlToText(job.description ?? "");
  const places = [...(job.locationNames ?? []), ...(job.acceptedRemoteLocationNames ?? [])].map((place) => place.trim()).filter(Boolean);
  const jobUrl = `https://wellfound.com/jobs/${job.id}-${job.slug ?? "role"}`;
  const companyUrl = `https://wellfound.com/company/${startup.slug}`;
  const postedAt = job.liveStartAt ? new Date(job.liveStartAt * 1000).toISOString() : null;
  return {
    source: "WELLFOUND",
    externalId: String(job.id),
    company: startup.name.slice(0, 200),
    website: companyUrl,
    summary: firstLine(startup.highConcept || text) || job.title.slice(0, 220),
    details: [startup.highConcept, job.title, job.compensation, text].filter(Boolean).join("\n\n").slice(0, 20_000),
    location: [job.remote ? "Remote" : "", ...places].filter(Boolean).join(" · ").slice(0, 300),
    remote: job.remote ?? null,
    stage: stage.slice(0, 200),
    roles: [job.title.slice(0, 160)],
    emails: findEmails(text)
      .slice(0, 4)
      .map((email) => ({ email, label: emailLabel(email), from: jobUrl, onRequest: false, foundAt: postedAt ?? "" })),
    links: [
      { label: "Job page", url: jobUrl },
      { label: "Company on Wellfound", url: companyUrl },
    ],
    postedAt,
  };
}

/** Recent AI-related roles from Wellfound's role pages. */
export async function fetchWellfoundStartups(signal?: AbortSignal): Promise<FoundStartup[]> {
  const found: FoundStartup[] = [];
  for (const page of PAGES) {
    signal?.throwIfAborted();
    const data = nextData(await getText(page, { signal }));
    if (!data) throw new SourceError("changed its format");
    found.push(...readWellfoundPage(data).flatMap((line) => startupFromWellfoundJob(line.startup, line.job, line.stage) ?? []));
    if (found.length >= MAX_JOBS) break;
  }
  // The same job can be highlighted on more than one role page.
  const seen = new Set<string>();
  return found.filter((startup) => (seen.has(startup.externalId) ? false : (seen.add(startup.externalId), true))).slice(0, MAX_JOBS);
}
