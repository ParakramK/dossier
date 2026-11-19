import { describe, expect, it } from "vitest";

import { OPPORTUNITIES } from "./catalog";
import {
  describeOpportunity,
  filterOpportunities,
  isWatching,
  opportunityFilterFromParams,
  opportunityFilterHref,
  OPPORTUNITY_FOCUS,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_REGIONS,
  type OpportunityView,
} from "./types";

const entries: OpportunityView[] = OPPORTUNITIES.map((entry) => ({ ...entry, status: null, notes: "", watching: false }));

describe("the opportunities catalogue", () => {
  it("has unique ids and names", () => {
    expect(new Set(OPPORTUNITIES.map((entry) => entry.id)).size).toBe(OPPORTUNITIES.length);
    expect(new Set(OPPORTUNITIES.map((entry) => entry.name)).size).toBe(OPPORTUNITIES.length);
  });

  it("only uses kinds, focuses and regions the screen knows", () => {
    const kinds = new Set(OPPORTUNITY_KINDS.map((entry) => entry.value));
    const focuses = new Set(OPPORTUNITY_FOCUS.map((entry) => entry.value));
    const regions = new Set(OPPORTUNITY_REGIONS.map((entry) => entry.value));
    for (const entry of OPPORTUNITIES) {
      expect(kinds.has(entry.kind), entry.id).toBe(true);
      expect(entry.focus.length, entry.id).toBeGreaterThan(0);
      expect(entry.regions.length, entry.id).toBeGreaterThan(0);
      for (const focus of entry.focus) expect(focuses.has(focus), `${entry.id} ${focus}`).toBe(true);
      for (const region of entry.regions) expect(regions.has(region), `${entry.id} ${region}`).toBe(true);
    }
  });

  it("links every entry to a web page, with the fields a card needs", () => {
    for (const entry of OPPORTUNITIES) {
      expect(() => new URL(entry.url), entry.id).not.toThrow();
      expect(entry.url, entry.id).toMatch(/^https:\/\//);
      expect(entry.summary.length, entry.id).toBeGreaterThan(20);
      expect(entry.funding.trim(), entry.id).not.toBe("");
      expect(entry.timing.trim(), entry.id).not.toBe("");
      expect(entry.eligibility.trim(), entry.id).not.toBe("");
    }
  });

  it("puts AI safety and the Nepal route first", () => {
    const first = OPPORTUNITIES.filter((entry) => entry.priority);
    expect(first.map((entry) => entry.id)).toContain("mats");
    expect(first.map((entry) => entry.id)).toContain("epoch-zero");
    expect(first.map((entry) => entry.id)).toContain("anthropic-fellows");
  });

  it("keeps every scholarship about a CS master's", () => {
    for (const entry of OPPORTUNITIES.filter((option) => option.kind === "SCHOLARSHIP")) {
      expect(entry.focus, entry.id).toContain("CS_MASTERS");
    }
  });
});

describe("filterOpportunities", () => {
  const base = opportunityFilterFromParams({});

  it("puts priority entries first, then sorts by name", () => {
    const listed = filterOpportunities(entries, base);
    const firstPlain = listed.findIndex((entry) => !entry.priority);
    expect(listed.slice(0, firstPlain).every((entry) => entry.priority)).toBe(true);
    expect(listed.slice(firstPlain).map((entry) => entry.name)).toEqual([...listed.slice(firstPlain).map((entry) => entry.name)].sort((a, b) => a.localeCompare(b)));
  });

  it("filters by kind, focus, region and words", () => {
    const scholarship = filterOpportunities(entries, { ...base, kind: "SCHOLARSHIP" });
    expect(scholarship.length).toBeGreaterThan(10);
    expect(scholarship.every((entry) => entry.kind === "SCHOLARSHIP")).toBe(true);

    const nepal = filterOpportunities(entries, { ...base, region: "NEPAL" });
    expect(nepal.map((entry) => entry.id)).toContain("epoch-zero");

    const safety = filterOpportunities(entries, { ...base, focus: "AI_SAFETY" });
    expect(safety.every((entry) => entry.focus.includes("AI_SAFETY"))).toBe(true);

    const matching = filterOpportunities(entries, { ...base, q: "evaluation" });
    expect(matching.some((entry) => entry.name === "METR")).toBe(true);
    expect(filterOpportunities(entries, { ...base, q: "zzzznothing" })).toEqual([]);
  });

  it("keeps only the watchlist in the watching view", () => {
    const watched = entries.map((entry) => ({ ...entry, status: entry.id === "mats" ? ("PREPARING" as const) : null, watching: isWatching(entry.id === "mats" ? "PREPARING" : null) }));
    expect(filterOpportunities(watched, { ...base, view: "watching" }).map((entry) => entry.id)).toEqual(["mats"]);
  });

  it("keeps applied and awarded entries in the applied view", () => {
    const states = entries.map((entry) =>
      entry.id === "chevening" ? { ...entry, status: "APPLIED" as const, watching: true } : entry.id === "daad" ? { ...entry, status: "AWARDED" as const, watching: false } : entry,
    );
    expect(filterOpportunities(states, { ...base, view: "applied" }).map((entry) => entry.id).sort()).toEqual(["chevening", "daad"]);
  });
});

describe("the filter in the address", () => {
  it("round-trips", () => {
    const filter = opportunityFilterFromParams({ q: "nepal", kind: "fellowship", focus: "ai_safety", region: "global", view: "watching" });
    expect(opportunityFilterFromParams(Object.fromEntries(new URL(`https://x${opportunityFilterHref(filter)}`).searchParams))).toEqual(filter);
  });

  it("leaves the defaults out", () => {
    expect(opportunityFilterHref(opportunityFilterFromParams({}))).toBe("/fellowships");
  });
});

describe("describeOpportunity", () => {
  it("names the region and focus", () => {
    expect(describeOpportunity({ regions: ["NEPAL"], focus: ["AI_SAFETY"] })).toBe("Nepal · AI safety");
  });
});
