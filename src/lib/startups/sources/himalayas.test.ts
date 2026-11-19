import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";

import { fetchHimalayasStartups, isAiJob, startupFromHimalayasJob } from "./himalayas";

vi.mock("@/lib/env", () => ({ env: {} }));

afterEach(() => vi.unstubAllGlobals());

const job = (overrides: Record<string, unknown> = {}) => ({
  title: "Senior Machine Learning Engineer",
  excerpt: "Build the evaluation pipeline for a multilingual model.",
  companyName: "Acme AI",
  companySlug: "acme-ai",
  locationRestrictions: ["Anywhere"],
  timezoneRestrictions: [],
  categories: ["Machine-Learning-Engineer"],
  parentCategories: ["Data Science"],
  description: "<p>Build the evaluation pipeline for a multilingual model. Apply: jobs@acme.ai</p>",
  pubDate: 1_790_000_000,
  applicationLink: "https://himalayas.app/companies/acme-ai/jobs/senior-ml-engineer",
  guid: "https://himalayas.app/companies/acme-ai/jobs/senior-ml-engineer",
  ...overrides,
});

describe("Himalayas", () => {
  it("recognises AI work by what the job calls itself", () => {
    expect(isAiJob({ title: "Machine Learning Engineer", categories: [], parentCategories: [] })).toBe(true);
    expect(isAiJob({ title: "Data Scientist", categories: [], parentCategories: [] })).toBe(true);
    expect(isAiJob({ title: "Clinical Research Associate", categories: [], parentCategories: [] })).toBe(false);
  });

  it("makes a startup from an AI job, with its page and address", () => {
    expect(startupFromHimalayasJob(job())).toMatchObject({
      source: "HIMALAYAS",
      externalId: "https://himalayas.app/companies/acme-ai/jobs/senior-ml-engineer",
      company: "Acme AI",
      website: "https://himalayas.app/companies/acme-ai",
      location: "Remote · anywhere",
      remote: true,
      roles: ["Senior Machine Learning Engineer"],
      emails: [{ email: "jobs@acme.ai", label: "Hiring" }],
      postedAt: new Date(1_790_000_000_000).toISOString(),
    });
    expect(startupFromHimalayasJob(job({ title: "Staff Accountant", categories: [], parentCategories: [] }))).toBeNull();
  });

  it("reads a page and pages with the cursor", async () => {
    const requests: string[] = [];
    stubFetch(({ url }) => {
      requests.push(url.toString());
      if (!url.searchParams.get("cursor")) {
        return json({ jobs: [job({ guid: "a" })], nextCursor: "next" });
      }
      return json({ jobs: [job({ guid: "b", title: "AI Research Engineer", companyName: "Beta" })], nextCursor: null });
    });
    const found = await fetchHimalayasStartups();
    expect(found.map((startup) => startup.company)).toEqual(["Acme AI", "Beta"]);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("cursor=next");
  });

  it("fails clearly when the feed changes its shape", async () => {
    stubFetch(() => json({ jobs: "nope" }));
    await expect(fetchHimalayasStartups()).rejects.toThrow("changed its format");
  });
});
