import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";
import { ycLastPage, ycPage } from "@/test/job-search-fixtures";

import { EMPTY_QUERY } from "./search";
import { placeOf, yc } from "./yc";

const fetchPosting = vi.hoisted(() => vi.fn());
vi.mock("@/lib/posting-fetch", () => ({ fetchPosting }));

const query = { ...EMPTY_QUERY, keywords: "engineer", country: "us", radiusKm: 25 as const, postedWithin: "month" as const };

afterEach(() => {
  vi.unstubAllGlobals();
  fetchPosting.mockReset();
});

describe("Y Combinator search", () => {
  it("asks Hacker News' search for recent job stories", async () => {
    const requests = stubFetch(() => json(ycPage));
    await yc.search(query, {}, null);
    const [{ url }] = requests;
    expect(`${url.origin}${url.pathname}`).toBe("https://hn.algolia.com/api/v1/search_by_date");
    expect(url.searchParams.get("query")).toBe("engineer");
    expect(url.searchParams.get("tags")).toBe("job");
    expect(url.searchParams.get("hitsPerPage")).toBe("20");
    expect(url.searchParams.get("page")).toBe("0");
    expect(url.searchParams.get("numericFilters")).toMatch(/^created_at_i>\d+$/);
  });

  it("still stops at 90 days for any time, and leaves the query out when there are no words", async () => {
    const requests = stubFetch(() => json(ycPage));
    await yc.search({ ...query, keywords: "", postedWithin: "any" }, {}, null);
    const [{ url }] = requests;
    expect(url.searchParams.has("query")).toBe(false);
    const since = Number(/^created_at_i>(\d+)$/.exec(url.searchParams.get("numericFilters")!)![1]);
    expect(Date.now() / 1000 - since).toBeGreaterThan(89 * 86_400);
    expect(Date.now() / 1000 - since).toBeLessThan(91 * 86_400);
  });

  it("maps job stories to the shared shape: company, role, place and link", async () => {
    stubFetch(() => json(ycPage));
    const page = await yc.search(query, {}, null);
    expect(page.next).toBe("page:1");
    expect(page.postings).toHaveLength(4);
    expect(page.postings[0]).toMatchObject({
      source: "YC",
      externalId: "50452404",
      title: "applied AI security engineer in San Francisco",
      company: "Tinfoil",
      place: "San Francisco",
      remote: null,
      salary: "",
      postedAt: "2026-11-11T12:00:35.000Z",
      url: "https://news.ycombinator.com/item?id=50452404",
      via: "Hacker News",
      description: "",
      complete: true,
    });
    expect(page.postings[1]).toMatchObject({
      title: "Research and Robotic Engineers",
      company: "Mbodi AI",
      place: "",
      url: "https://www.ycombinator.com/companies/mbodi-ai/jobs",
      description: "",
      complete: false,
    });
    expect(page.postings[2]).toMatchObject({
      title: "Founding Engineer in NYC",
      place: "NYC",
      url: "https://news.ycombinator.com/item?id=50381512",
      description: "Build the future of escrow.",
      complete: true,
    });
    expect(page.postings[3]).toMatchObject({ title: "Remote Platform Engineer", remote: true });
  });

  it("keeps only the postings whose title holds every word asked for", async () => {
    stubFetch(() => json(ycPage));
    const { postings } = await yc.search({ ...query, keywords: "robotic engineer" }, {}, null);
    expect(postings.map((posting) => posting.company)).toEqual(["Mbodi AI"]);
  });

  it("keeps only remote postings when asked", async () => {
    stubFetch(() => json(ycPage));
    const { postings } = await yc.search({ ...query, keywords: "", remoteOnly: true }, {}, null);
    expect(postings.map((posting) => posting.title)).toEqual(["Remote Platform Engineer"]);
  });

  it("reads where a job is from its title", () => {
    expect(placeOf("is hiring a designer in Berlin")).toBe("Berlin");
    expect(placeOf("Is Hiring an Engineer (Remote, worldwide)")).toBe("Remote, worldwide");
    expect(placeOf("Is Hiring a Designer (Remote) in Berlin")).toBe("Berlin · Remote");
    expect(placeOf("Is Hiring an Engineer")).toBe("");
  });

  it("stops at the last page", async () => {
    stubFetch(() => json(ycLastPage));
    expect((await yc.search(query, {}, "page:1")).next).toBeNull();
    stubFetch(() => json({ ...ycPage, hits: [], nbPages: 1 }));
    expect((await yc.search(query, {}, null)).next).toBeNull();
  });

  it("says the source changed when the answer has an unknown shape", async () => {
    stubFetch(() => json({ items: [] }));
    await expect(yc.search(query, {}, null)).rejects.toMatchObject({ problem: "changed" });
  });

  it("says when Hacker News isn't answering", async () => {
    stubFetch(() => json({}, { status: 503 }));
    await expect(yc.search(query, {}, null)).rejects.toMatchObject({
      problem: "unavailable",
      message: "Y Combinator isn't answering right now. Try again in a minute.",
    });
  });
});

describe("Y Combinator details and test", () => {
  it("reads the page of a posting that came without its text", async () => {
    stubFetch(() => json(ycPage));
    const [, mbodi, sava] = (await yc.search(query, {}, null)).postings;
    fetchPosting.mockResolvedValueOnce({ ok: true, text: "The whole posting.", source: "page", url: mbodi.url });
    expect(await yc.details(mbodi, {})).toBe("The whole posting.");
    expect(fetchPosting).toHaveBeenCalledWith(mbodi.url);
    fetchPosting.mockResolvedValueOnce({ ok: false, error: "unreadable" });
    expect(await yc.details(mbodi, {})).toBeNull();
    // A Hacker News item is a discussion, not the posting: nothing to read.
    expect(await yc.details(sava, {})).toBeNull();
    expect(fetchPosting).toHaveBeenCalledTimes(2);
    expect(await yc.details({ ...mbodi, url: "" }, {})).toBeNull();
    expect(fetchPosting).toHaveBeenCalledTimes(2);
  });

  it("tests with one small search", async () => {
    const requests = stubFetch(() => json(ycPage));
    await yc.test({});
    expect(requests[0].url.searchParams.get("query")).toBe("engineer");
    expect(requests[0].url.searchParams.get("tags")).toBe("job");
  });
});
