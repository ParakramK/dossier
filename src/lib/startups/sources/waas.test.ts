import { afterEach, describe, expect, it, vi } from "vitest";

import { stubFetch } from "@/lib/ai/test-http";

import { fetchWaasStartups, isAiPosting, pageData, startupFromWaasPosting } from "./waas";

vi.mock("@/lib/env", () => ({ env: {} }));

afterEach(() => vi.unstubAllGlobals());

const posting = {
  id: 7,
  title: "Senior AI Engineer",
  url: "/companies/acme/jobs/7-senior-ai-engineer",
  location: "Remote",
  type: "Full-time",
  roleSpecificType: "AI engineer",
  salaryRange: "$150K - $200K",
  equityRange: "0.05% - 0.15%",
  minExperience: "5+ years",
  visa: "US citizenship/visa not required",
  skills: ["Python", "PyTorch"],
  companyUrl: "/companies/acme",
  companyName: "Acme",
  companyBatchName: "W24",
  companyOneLiner: "Data pipelines for multilingual models",
  createdAt: "about 1 month",
};

const page = (postings: unknown[]) => `<html><body><div data-page="${JSON.stringify({ component: "WaasJobListingsPage", props: { jobPostings: postings } }).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></div></body></html>`;

describe("Work at a Startup", () => {
  it("keeps AI and data roles, and drops the rest", () => {
    expect(isAiPosting(posting)).toBe(true);
    expect(isAiPosting({ ...posting, title: "Account Executive", companyOneLiner: "Payments for shops", roleSpecificType: "Sales", skills: [] })).toBe(false);
  });

  it("reads the data-page object", () => {
    expect(pageData(page([posting]))).toMatchObject({ component: "WaasJobListingsPage" });
    expect(pageData("<html></html>")).toBeNull();
    expect(pageData('<div data-page="{not json}"></div>')).toBeNull();
  });

  it("makes a startup from a posting, with its batch, salary and links", () => {
    expect(startupFromWaasPosting(posting)).toMatchObject({
      source: "WAAS",
      externalId: "7",
      company: "Acme",
      website: "https://www.ycombinator.com/companies/acme",
      location: "Remote",
      remote: true,
      stage: "YC W24",
      roles: ["Senior AI Engineer"],
      links: [
        { label: "Job page", url: "https://www.ycombinator.com/companies/acme/jobs/7-senior-ai-engineer" },
        { label: "Company", url: "https://www.ycombinator.com/companies/acme" },
      ],
      postedAt: null,
    });
    expect(startupFromWaasPosting({ ...posting, url: "javascript:alert(1)" })).toBeNull();
  });

  it("reads both remote pages, once each", async () => {
    stubFetch(({ url }) => {
      const postings = url.pathname.endsWith("/science/remote") ? [{ ...posting, id: 8, title: "Research Scientist" }] : [posting];
      return new Response(page(postings), { status: 200, headers: { "content-type": "text/html" } });
    });
    const found = await fetchWaasStartups();
    expect(found.map((startup) => startup.externalId).sort()).toEqual(["7", "8"]);
  });

  it("fails clearly when a page changes its shape", async () => {
    stubFetch(() => new Response("<html></html>", { status: 200 }));
    await expect(fetchWaasStartups()).rejects.toThrow("changed its format");
  });
});
