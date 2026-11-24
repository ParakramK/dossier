import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";

import type { ChatCall } from "../provider";
import { MockProvider } from "../providers/mock";

import { COLD_EMAIL_VERSION, writeColdEmail } from "./write-cold-email";

const profile = demoProfile();
const options = { creativity: "BALANCED" as const, strict: true, language: null };
const company = {
  company: "Acme AI",
  summary: "Data pipelines for multilingual models",
  details: "Hiring an AI engineer to build evaluation datasets.",
  website: "https://acme.example",
  stage: "YC W24",
  location: "Remote",
  roles: ["AI Engineer"],
  research: "Acme builds evaluation sets for South Asian languages and publishes its dataset notes.",
};
const sent = (provider: MockProvider): ChatCall => provider.calls[0];

describe("writeColdEmail", () => {
  it("writes a subject and a fit-focused email from the profile and the company's site", async () => {
    const provider = new MockProvider({ reply: () => ({ subject: " Building evaluation data at Acme ", body: "  Hello Acme team,\n\nI built a toolkit for multilingual data. Resume attached.\n\nJane  " }) });
    const { data, promptVersion } = await writeColdEmail(provider, { profile, company, email: "jobs@acme.example", notes: "I spoke at a conference about Nepali speech data last year." }, options);

    expect(promptVersion).toBe(COLD_EMAIL_VERSION);
    expect(data.subject).toBe("Building evaluation data at Acme");
    expect(data.body).toBe("Hello Acme team,\n\nI built a toolkit for multilingual data. Resume attached.\n\nJane");

    const call = sent(provider);
    expect(call.json?.name).toBe("cold_email");
    expect(call.system).toMatch(/cold email/);
    expect(call.system).toMatch(/never invent/i);
    const text = [call.system, ...call.messages.map((message) => message.content)].join("\n");
    expect(text).toContain(company.research);
    expect(text).toContain("I spoke at a conference about Nepali speech data last year.");
    expect(text).toContain("jobs@acme.example");
    // Contact details stay out of what the model reads.
    expect(text).not.toContain(profile.basics.email);
    expect(text).not.toContain(profile.basics.phone);
  });

  it("bounds an unusually long answer", async () => {
    const provider = new MockProvider({ reply: () => ({ subject: "x".repeat(500), body: "y".repeat(9_000) }) });
    const { data } = await writeColdEmail(provider, { profile, company, email: "jobs@acme.example", notes: "" }, options);
    expect(data.subject).toHaveLength(150);
    expect(data.body).toHaveLength(6_000);
  });
});
