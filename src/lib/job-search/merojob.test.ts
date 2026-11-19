import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";
import { merojobLastPage, merojobPage } from "@/test/job-search-fixtures";

import { locationSlug, merojob } from "./merojob";
import { EMPTY_QUERY } from "./search";

const query = {
  ...EMPTY_QUERY,
  keywords: "full stack developer",
  place: "Kathmandu",
  country: "np",
  radiusKm: 25 as const,
  postedWithin: "week" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("merojob search", () => {
  it("asks for its longest word, the place's own slug and the window", async () => {
    const requests = stubFetch(() => json(merojobPage));
    await merojob.search(query, {}, null);
    const [{ url }] = requests;
    expect(`${url.origin}${url.pathname}`).toBe("https://api.merojob.com/api/v1/jobs/");
    expect(url.searchParams.get("q")).toBe("developer");
    expect(url.searchParams.get("location")).toBe("kathmandu");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(Date.parse(url.searchParams.get("created_at")!)).toBeLessThan(Date.now());
  });

  it("knows its own places, and searches the whole country for the rest", () => {
    expect(locationSlug("Kathmandu")).toBe("kathmandu");
    expect(locationSlug("Kathmandu Valley")).toBe("kathmandu");
    expect(locationSlug("Lalitpur District")).toBe("lalitpur");
    expect(locationSlug("Pokhara Metropolitan City")).toBe("pokhara");
    expect(locationSlug("Nepal")).toBeNull();
    expect(locationSlug("Dharan")).toBeNull();
    expect(locationSlug("")).toBeNull();
  });

  it("leaves the place and the date out when it doesn't know them", async () => {
    const requests = stubFetch(() => json(merojobPage));
    await merojob.search({ ...query, place: "Nepal", postedWithin: "any" }, {}, null);
    const [{ url }] = requests;
    expect(url.searchParams.has("location")).toBe(false);
    expect(url.searchParams.has("created_at")).toBe(false);
  });

  it("maps results to the shared shape, with salary and full text", async () => {
    stubFetch(() => json(merojobPage));
    const page = await merojob.search(query, {}, null);
    expect(page.next).toBe("offset:20");
    const [posting] = page.postings;
    expect(posting).toMatchObject({
      source: "MEROJOB",
      externalId: "204743",
      title: "Full-Stack Developer",
      company: "Himalayan Software",
      place: "Jawalakhel, Lalitpur",
      remote: null,
      salary: "NRs 90,000–120,000 a month",
      postedAt: "2026-11-16T04:26:29.127Z",
      url: "https://merojob.com/full-stack-developer-245/",
      via: "",
      complete: true,
    });
    expect(posting.description).toContain("We are hiring a Full-Stack Developer");
    expect(posting.description).toContain("React and Node");
    expect(posting.description).toContain("Bachelor's in Computer Science");
    // The second posting doesn't hold "full" or "stack": it is left out.
    expect(page.postings).toHaveLength(1);
  });

  it("keeps a hidden employer's name and salary to itself", async () => {
    stubFetch(() => json(merojobPage));
    const { postings } = await merojob.search({ ...query, keywords: "remote developer" }, {}, null);
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({ company: "", salary: "", remote: true, place: "Kathmandu" });
  });

  it("keeps only remote postings when asked", async () => {
    stubFetch(() => json(merojobPage));
    const { postings } = await merojob.search({ ...query, keywords: "", remoteOnly: true }, {}, null);
    expect(postings.map((posting) => posting.externalId)).toEqual(["204744"]);
  });

  it("stops at the last page", async () => {
    stubFetch(() => json(merojobLastPage));
    expect((await merojob.search(query, {}, "offset:40")).next).toBeNull();
    stubFetch(() => json({ count: 0, results: [] }));
    expect((await merojob.search(query, {}, null)).next).toBeNull();
  });

  it("says the source changed when the answer has an unknown shape", async () => {
    stubFetch(() => json({ jobs: [] }));
    await expect(merojob.search(query, {}, null)).rejects.toMatchObject({ problem: "changed" });
  });

  it("says when merojob isn't answering", async () => {
    stubFetch(() => json({ error: "down" }, { status: 503 }));
    await expect(merojob.search(query, {}, null)).rejects.toMatchObject({
      problem: "unavailable",
      message: "merojob isn't answering right now. Try again in a minute.",
    });
  });

  it("has every posting's text already, and tests with one small search", async () => {
    expect(await merojob.details({} as never, {})).toBeNull();
    const requests = stubFetch(() => json(merojobPage));
    await merojob.test({});
    expect(requests[0].url.searchParams.get("q")).toBe("developer");
  });
});
