import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";

import { arbeitnow, jobicy, nodesk, realwork, remoteok, weworkremotely } from "./remote-boards";
import { EMPTY_QUERY } from "./search";

const fetchPosting = vi.hoisted(() => vi.fn());
vi.mock("@/lib/posting-fetch", () => ({ fetchPosting }));

const query = { ...EMPTY_QUERY, keywords: "python" };
const rss = (items: string) =>
  new Response(`<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`, { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  fetchPosting.mockReset();
});

describe("remote job boards", () => {
  it("maps Arbeitnow's API to postings, with the full text", async () => {
    const requests = stubFetch(() =>
      json({
        data: [
          {
            slug: "python-dev",
            title: "Python Developer",
            company_name: "Northstar",
            url: "https://northstar.example/jobs/1",
            location: "Berlin",
            remote: true,
            description: "<p>Write <b>Python</b> services.</p>",
            created_at: 1_763_500_800,
          },
          { slug: "sales", title: "Sales Lead", company_name: "Other", url: "https://other.example/jobs/2", description: "Sell things" },
        ],
      }),
    );
    const page = await arbeitnow.search(query, {}, null);
    expect(`${requests[0].url.origin}${requests[0].url.pathname}`).toBe("https://www.arbeitnow.com/api/job-board-api");
    expect(page.postings).toHaveLength(1);
    expect(page.postings[0]).toMatchObject({
      source: "ARBEITNOW",
      externalId: "python-dev",
      title: "Python Developer",
      company: "Northstar",
      place: "Berlin",
      remote: true,
      url: "https://northstar.example/jobs/1",
      description: "Write Python services.",
      complete: true,
      postedAt: "2025-11-18T21:20:00.000Z",
    });
    expect(page.next).toBeNull();
  });

  it("maps Jobicy and Remote OK, skipping Remote OK's legal notice", async () => {
    stubFetch(() =>
      json({
        jobs: [
          {
            id: 7,
            jobTitle: "Python Engineer",
            companyName: "Helio",
            url: "https://helio.example/job",
            jobGeo: "Worldwide",
            jobType: ["Full-time"],
            jobDescription: "<p>Python work</p>",
            annualSalaryMin: 60000,
            annualSalaryMax: 80000,
            salaryCurrency: "USD",
            pubDate: "2026-11-20",
          },
        ],
      }),
    );
    const jobicyPage = await jobicy.search(query, {}, null);
    expect(jobicyPage.postings[0]).toMatchObject({ source: "JOBICY", title: "Python Engineer", salary: "USD 60000–80000", remote: true });

    stubFetch(() =>
      json([
        { legal: "Not a job" },
        { id: 8, position: "Python Engineer", company: "Orbit", url: "https://orbit.example/job", location: "Remote", description: "Python", epoch: 1_763_500_800 },
      ]),
    );
    const okPage = await remoteok.search(query, {}, null);
    expect(okPage.postings).toHaveLength(1);
    expect(okPage.postings[0]).toMatchObject({ source: "REMOTEOK", externalId: "8", company: "Orbit", remote: true });
  });

  it("reads NoDesk, Real Work From Anywhere and We Work Remotely feeds", async () => {
    stubFetch(() =>
      rss(
        "<item><title>Helio - Python Engineer</title><link>https://helio.example/job</link>" +
          "<description><![CDATA[<p>Python work</p>]]></description><pubDate>Wed, 18 Nov 2026 09:00:00 GMT</pubDate></item>",
      ),
    );
    const nodeskPage = await nodesk.search(query, {}, null);
    expect(nodeskPage.postings[0]).toMatchObject({ source: "NODESK", title: "Python Engineer", company: "Helio", place: "Worldwide", complete: false });

    stubFetch(() =>
      rss(
        "<item><title>Python Engineer at Orbit</title><link>https://orbit.example/job</link>" +
          "<description>Python anywhere</description><pubDate>Wed, 18 Nov 2026 09:00:00 GMT</pubDate></item>",
      ),
    );
    const realworkPage = await realwork.search(query, {}, null);
    expect(realworkPage.postings[0]).toMatchObject({ source: "REALWORK", title: "Python Engineer", company: "Orbit" });

    stubFetch(() =>
      rss(
        "<item><title>Helio: Python Engineer</title><link>https://helio.example/job</link>" +
          "<description>Python work</description><pubDate>Wed, 18 Nov 2026 09:00:00 GMT</pubDate></item>",
      ),
    );
    const wwrPage = await weworkremotely.search(query, {}, null);
    expect(wwrPage.postings[0]).toMatchObject({ source: "WEWORKREMOTELY", title: "Python Engineer", company: "Helio" });
  });

  it("pages through a long answer locally, and reads a feed posting's page on open", async () => {
    stubFetch(() =>
      rss(
        Array.from({ length: 21 }, (_, index) =>
          `<item><title>Helio - Python Engineer ${index}</title><link>https://helio.example/job/${index}</link><description>Python</description></item>`,
        ).join(""),
      ),
    );
    const first = await nodesk.search({ ...EMPTY_QUERY }, {}, null);
    expect(first.postings).toHaveLength(20);
    expect(first.next).toBe("offset:20");
    stubFetch(() =>
      rss(
        Array.from({ length: 21 }, (_, index) =>
          `<item><title>Helio - Python Engineer ${index}</title><link>https://helio.example/job/${index}</link><description>Python</description></item>`,
        ).join(""),
      ),
    );
    const second = await nodesk.search({ ...EMPTY_QUERY }, {}, first.next);
    expect(second.postings).toHaveLength(1);
    expect(second.next).toBeNull();

    fetchPosting.mockResolvedValue({ ok: true, text: "The whole posting." });
    expect(await nodesk.details(first.postings[0], {})).toBe("The whole posting.");
    expect(fetchPosting).toHaveBeenCalledWith("https://helio.example/job/0");
  });
});
