import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";
import { remotiveLastPage, remotivePage } from "@/test/job-search-fixtures";

import { locationFilter, remotive } from "./remotive";
import { EMPTY_QUERY } from "./search";

const fetchPosting = vi.hoisted(() => vi.fn());
vi.mock("@/lib/posting-fetch", () => ({ fetchPosting }));

const query = { ...EMPTY_QUERY, keywords: "python engineer", country: "de", radiusKm: 25 as const, postedWithin: "month" as const };

afterEach(() => {
  vi.unstubAllGlobals();
  fetchPosting.mockReset();
});

/** The search proxy's request body, as the adapter sent it. */
function paramsOf(body: unknown): URLSearchParams {
  const request = (body as { requests: { indexName: string; params: string }[] }).requests[0];
  expect(request.indexName).toBe("remotive_unlimited");
  return new URLSearchParams(request.params);
}

describe("Remotive search", () => {
  it("asks its search proxy for the words, a page, and the country's own filter", async () => {
    const requests = stubFetch(() => json(remotivePage));
    await remotive.search(query, {}, null);
    const [{ url, method, body }] = requests;
    expect(`${url.origin}${url.pathname}`).toBe("https://remotive.com/api/v2/jobs/search/");
    expect(method).toBe("POST");
    const params = paramsOf(body);
    expect(params.get("query")).toBe("python engineer");
    expect(params.get("hitsPerPage")).toBe("20");
    expect(params.get("page")).toBe("0");
    expect(params.get("locationMode")).toBe("open");
    expect(JSON.parse(params.get("facetFilters")!)).toEqual([["location_filters:Germany"]]);
  });

  it("knows the countries its location filter lists, under its own names", () => {
    expect(locationFilter("de")).toBe("Germany");
    expect(locationFilter("us")).toBe("USA");
    expect(locationFilter("gb")).toBe("UK");
    expect(locationFilter("cz")).toBe("Czech Republic");
    expect(locationFilter("tr")).toBe("Turkey");
    expect(locationFilter("ps")).toBe("State of Palestine");
    expect(locationFilter("np")).toBeNull();
    expect(locationFilter("")).toBeNull();
  });

  it("maps results to the shared shape, with the link back to Remotive", async () => {
    stubFetch(() => json(remotivePage));
    const page = await remotive.search(query, {}, null);
    expect(page.next).toBe("page:1");
    expect(page.postings).toHaveLength(2);
    expect(page.postings[0]).toMatchObject({
      source: "REMOTIVE",
      externalId: "6648271",
      title: "Python Typescript Engineer",
      company: "Turing Enterprise Inc.",
      place: "Worldwide",
      remote: true,
      salary: "",
      postedAt: "2026-11-18T22:31:20.000Z",
      url: "https://remotive.com/remote/jobs/software-development/python-typescript-engineer-6648271",
      via: "",
      description: "",
      complete: false,
    });
    expect(page.postings[1]).toMatchObject({
      title: "Senior Product Designer",
      company: "Harbourlight",
      place: "Berlin · Germany",
      salary: "€75,000–90,000",
    });
  });

  it("leaves out a posting older than the window, and keeps it for any time", async () => {
    stubFetch(() => json(remotivePage));
    expect((await remotive.search({ ...query, postedWithin: "any" }, {}, null)).postings.map((posting) => posting.externalId)).toEqual([
      "6648271",
      "6648272",
      "6648273",
    ]);
    stubFetch(() => json(remotivePage));
    expect((await remotive.search({ ...query, postedWithin: "week" }, {}, null)).postings.map((posting) => posting.externalId)).toEqual(["6648271", "6648272"]);
  });

  it("keeps a place's postings when the search names one", async () => {
    stubFetch(() => json(remotivePage));
    const { postings } = await remotive.search({ ...query, place: "Berlin" }, {}, null);
    expect(postings.map((posting) => posting.externalId)).toEqual(["6648272"]);
  });

  it("keeps only postings open worldwide or to the country when it has no filter for it", async () => {
    const requests = stubFetch(() => json(remotivePage));
    const { postings } = await remotive.search({ ...query, country: "np", place: "" }, {}, null);
    expect(postings.map((posting) => posting.externalId)).toEqual(["6648271"]);
    expect(paramsOf(requests[0].body).has("facetFilters")).toBe(false);
  });

  it("stops at the last page", async () => {
    stubFetch(() => json(remotiveLastPage));
    expect((await remotive.search(query, {}, "page:1")).next).toBeNull();
    stubFetch(() => json({ ...remotiveLastPage, result: { results: [{ ...remotiveLastPage.result.results[0], page: 0, nbPages: 1 }] } }));
    expect((await remotive.search(query, {}, null)).next).toBeNull();
  });

  it("says the source changed when the answer has an unknown shape", async () => {
    stubFetch(() => json({ jobs: [] }));
    await expect(remotive.search(query, {}, null)).rejects.toMatchObject({ problem: "changed" });
  });

  it("says when Remotive isn't answering", async () => {
    stubFetch(() => json({}, { status: 503 }));
    await expect(remotive.search(query, {}, null)).rejects.toMatchObject({
      problem: "unavailable",
      message: "Remotive isn't answering right now. Try again in a minute.",
    });
    stubFetch(() => json({}, { status: 403 }));
    await expect(remotive.search(query, {}, null)).rejects.toMatchObject({ problem: "unavailable" });
  });
});

describe("Remotive details and test", () => {
  it("reads the posting's own page for its text", async () => {
    stubFetch(() => json(remotivePage));
    const [posting] = (await remotive.search(query, {}, null)).postings;
    fetchPosting.mockResolvedValueOnce({ ok: true, text: "The whole posting.", source: "page", url: posting.url });
    expect(await remotive.details(posting, {})).toBe("The whole posting.");
    expect(fetchPosting).toHaveBeenCalledWith(posting.url);
    fetchPosting.mockResolvedValueOnce({ ok: false, error: "unreadable" });
    expect(await remotive.details(posting, {})).toBeNull();
    expect(await remotive.details({ ...posting, url: "" }, {})).toBeNull();
    expect(fetchPosting).toHaveBeenCalledTimes(2);
  });

  it("tests with one small search", async () => {
    const requests = stubFetch(() => json(remotivePage));
    await remotive.test({});
    const params = paramsOf(requests[0].body);
    expect(params.get("query")).toBe("engineer");
    expect(JSON.parse(params.get("facetFilters")!)).toEqual([["location_filters:USA"]]);
  });
});
