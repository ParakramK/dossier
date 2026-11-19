import "server-only";

import { z } from "zod";

import { getText, SourceError } from "../http";
import { decodeEntities } from "../text";
import type { FoundStartup } from "../types";

// Y Combinator's Work at a Startup, read from the public job pages. Each page
// carries its listings in the data-page attribute, including the startup's
// batch, one-liner, salary and visa note. Remote pages only: this list is
// for work the user can do from where they are.

const PAGES = ["https://www.ycombinator.com/jobs/role/software-engineer/remote", "https://www.ycombinator.com/jobs/role/science/remote"];

const postingSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().min(1),
  url: z.string().min(1),
  location: z.string().nullish(),
  type: z.string().nullish(),
  roleSpecificType: z.string().nullish(),
  salaryRange: z.string().nullish(),
  equityRange: z.string().nullish(),
  minExperience: z.string().nullish(),
  visa: z.string().nullish(),
  skills: z.array(z.string()).nullish(),
  companyUrl: z.string().nullish(),
  companyName: z.string().min(1),
  companyBatchName: z.string().nullish(),
  companyOneLiner: z.string().nullish(),
  createdAt: z.string().nullish(),
});
type Posting = z.output<typeof postingSchema>;

const pageSchema = z.object({ props: z.object({ jobPostings: z.array(postingSchema) }) });

const AI = /\b(ai|a\.i\.|ml|machine[- ]learning|deep[- ]learning|llm|llms|nlp|data scien\w*|computer vision|generative|applied scientist|research scientist|ai engineer|ml engineer|models?|inference|datasets?|data pipelines?|synthetic data)\b/i;

/** Whether a posting is about AI or data work, read from the role and the startup's one-liner. */
export function isAiPosting(posting: Pick<Posting, "title" | "companyOneLiner" | "roleSpecificType" | "skills">): boolean {
  return AI.test([posting.title, posting.companyOneLiner ?? "", posting.roleSpecificType ?? "", ...(posting.skills ?? [])].join(" "));
}

/** The data-page object a YC page carries, or null when it has none. */
export function pageData(html: string): unknown {
  const match = /data-page="([^"]*)"/.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(decodeEntities(match[1]));
  } catch {
    return null;
  }
}

/** A Work at a Startup posting as a startup. */
export function startupFromWaasPosting(posting: Posting): FoundStartup | null {
  if (!/^(https?:\/\/|\/)/i.test(posting.url) || !isAiPosting(posting)) return null;
  const url = new URL(posting.url, "https://www.ycombinator.com").toString();
  const companyPage = posting.companyUrl ? new URL(posting.companyUrl, "https://www.ycombinator.com").toString() : "";
  const batch = posting.companyBatchName?.trim() ?? "";
  const details = [
    posting.companyOneLiner,
    `Role: ${posting.title}`,
    posting.roleSpecificType && `Work: ${posting.roleSpecificType}`,
    posting.location && `Location: ${posting.location}`,
    posting.type && `Type: ${posting.type}`,
    posting.salaryRange && `Salary: ${posting.salaryRange}`,
    posting.equityRange && `Equity: ${posting.equityRange}`,
    posting.minExperience && `Experience: ${posting.minExperience}`,
    posting.visa && `Visa: ${posting.visa}`,
    posting.skills && posting.skills.length > 0 && `Skills: ${posting.skills.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    source: "WAAS",
    externalId: String(posting.id),
    company: posting.companyName.slice(0, 200),
    website: companyPage,
    summary: (posting.companyOneLiner ? `${posting.companyOneLiner} — ${posting.title}` : posting.title).slice(0, 1_000),
    details: details.slice(0, 20_000),
    location: (posting.location ?? "").slice(0, 300),
    // The pages read are their remote ones, though a few also name an office.
    remote: true,
    stage: batch ? `YC ${batch}`.slice(0, 200) : "",
    roles: [posting.title.slice(0, 160)],
    emails: [],
    links: [
      { label: "Job page", url },
      ...(companyPage ? [{ label: "Company", url: companyPage }] : []),
    ],
    // The page gives "6 months" rather than a date, which is too coarse to keep.
    postedAt: null,
  };
}

/** Remote engineering and science roles at YC startups. */
export async function fetchWaasStartups(signal?: AbortSignal): Promise<FoundStartup[]> {
  const pages = await Promise.all(PAGES.map((page) => getText(page, { signal })));
  const found: FoundStartup[] = [];
  for (const html of pages) {
    const parsed = pageSchema.safeParse(pageData(html));
    if (!parsed.success) throw new SourceError("changed its format");
    found.push(...parsed.data.props.jobPostings.flatMap((posting) => startupFromWaasPosting(posting) ?? []));
  }
  const seen = new Set<string>();
  return found.filter((startup) => (seen.has(startup.externalId) ? false : (seen.add(startup.externalId), true)));
}
