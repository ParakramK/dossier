import { afterEach, describe, expect, it, vi } from "vitest";

import { stubFetch } from "@/lib/ai/test-http";

import { fetchWellfoundStartups, nextData, readWellfoundPage, startupFromWellfoundJob } from "./wellfound";

vi.mock("@/lib/env", () => ({ env: {} }));

afterEach(() => vi.unstubAllGlobals());

const startup = { id: "1", name: "Acme AI", slug: "acme-ai", highConcept: "Data pipelines for multilingual models", badges: [{ __ref: "Badge:COMPANY_STAGE-1" }], highlightedJobListings: [{ __ref: "JobListingSearchResult:9" }] };
const job = {
  id: 9,
  title: "Machine Learning Engineer",
  slug: "machine-learning-engineer",
  description: "<p>Build datasets and evaluation pipelines.</p><p>Apply: jobs@acme.ai</p>",
  remote: true,
  locationNames: ["Berlin"],
  acceptedRemoteLocationNames: ["Europe"],
  compensation: "€80k – €100k",
  liveStartAt: 1_790_000_000,
};
const data = {
  props: {
    pageProps: {
      apolloState: {
        data: {
          ROOT_QUERY: { talent: { 'seoLandingPageJobSearchResults({"page":1,"remote":true,"role":"software-engineer"})': { startups: [{ __ref: "StartupResult:1" }] } } },
          "StartupResult:1": startup,
          "Badge:COMPANY_STAGE-1": { id: "COMPANY_STAGE-1", name: "COMPANY_STAGE_BADGE", label: "Early Stage" },
          "JobListingSearchResult:9": job,
        },
      },
    },
  },
};

const html = (payload: unknown) => `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;

describe("Wellfound", () => {
  it("reads the __NEXT_DATA__ object", () => {
    expect(nextData(html(data))).toMatchObject({ props: {} });
    expect(nextData("<html></html>")).toBeNull();
    expect(nextData('<script id="__NEXT_DATA__">{not json}</script>')).toBeNull();
  });

  it("reads the search results with each startup's stage", () => {
    const lines = readWellfoundPage(data);
    expect(lines).toHaveLength(1);
    expect(lines[0].startup.name).toBe("Acme AI");
    expect(lines[0].job.title).toBe("Machine Learning Engineer");
    expect(lines[0].stage).toBe("Early Stage");
    expect(readWellfoundPage({ nope: true })).toEqual([]);
  });

  it("makes a startup from an AI job, with its links and address", () => {
    expect(startupFromWellfoundJob(startup, job, "Early Stage")).toMatchObject({
      source: "WELLFOUND",
      externalId: "9",
      company: "Acme AI",
      website: "https://wellfound.com/company/acme-ai",
      stage: "Early Stage",
      location: "Remote · Berlin · Europe",
      remote: true,
      roles: ["Machine Learning Engineer"],
      emails: [{ email: "jobs@acme.ai", label: "Hiring" }],
      links: [
        { label: "Job page", url: "https://wellfound.com/jobs/9-machine-learning-engineer" },
        { label: "Company on Wellfound", url: "https://wellfound.com/company/acme-ai" },
      ],
      postedAt: new Date(1_790_000_000_000).toISOString(),
    });
    expect(startupFromWellfoundJob({ ...startup, highConcept: "Accounting software" }, { ...job, title: "Accountant" }, "")).toBeNull();
  });

  it("reads each role page and keeps one copy of a job", async () => {
    stubFetch(() => new Response(html(data), { status: 200, headers: { "content-type": "text/html" } }));
    const found = await fetchWellfoundStartups();
    expect(found.map((startup) => startup.externalId)).toEqual(["9"]);
  });

  it("fails clearly when a page changes its shape", async () => {
    stubFetch(() => new Response("<html></html>", { status: 200 }));
    await expect(fetchWellfoundStartups()).rejects.toThrow("changed its format");
  });
});
