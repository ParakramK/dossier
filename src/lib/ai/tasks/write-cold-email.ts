import { z } from "zod";

import type { ProfileData } from "@/lib/profile";

import { CREATIVITY, NO_EM_DASHES, postingForPrompt, profileForPrompt, system, truthfulness, type Task } from "./prompt-parts";

export const COLD_EMAIL_VERSION = "write-cold-email@1";

const answerSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export type ColdEmailInput = {
  profile: ProfileData;
  company: {
    company: string;
    summary: string;
    details: string;
    website: string;
    stage: string;
    location: string;
    roles: string[];
    /** Public text read from the company's own site, or "". */
    research: string;
  };
  /** The address the email will be sent to. */
  email: string;
};

const INSTRUCTIONS = `You write one short cold email from a candidate to a company that is hiring. The candidate sends it themselves; Dossier never sends it. A current resume is attached, so the email doesn't repeat it.

Write JSON with a subject and a body:
- subject: one clear line naming the company and the kind of work, no clickbait, at most 80 characters.
- body: 120–180 words. Open by naming what the company does and one concrete thing you learned from what it published or its site; if the sources don't say, say you're inferring it. Then make the case for the fit: refer to the candidate's own work by its exact name and say what it did that speaks to that thing. Only use facts in the profile, the post and the site text; never invent a metric, employer, project, dataset or result, and never claim a referral. Say the resume is attached and ask for a short conversation, ending with one easy question that gives the person a reason to reply. Add a greeting, a sign-off and the candidate's name from the profile.
- Address the reader as "you", or the team when no person is named. No flattery, no "I hope this finds you well", no long skill lists, and no more than 180 words.
- ${NO_EM_DASHES}`;

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 150);
const clean = (value: string) => value.trim().slice(0, 6_000);

/** A cold email: a subject and a body that make the case for the profile's fit. */
export const writeColdEmail: Task<ColdEmailInput, { subject: string; body: string }> = async (provider, { profile, company, email }, options) => {
  const answer = await provider.complete({
    task: "write-cold-email",
    system: system(INSTRUCTIONS, truthfulness(options.strict), CREATIVITY[options.creativity]),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(profile)}`,
          `The company and the role it posted:\n${JSON.stringify(company, null, 2)}`,
          `What the company published:\n${postingForPrompt([company.summary, company.details].filter(Boolean).join("\n\n"))}`,
          `Public text from the company's own site:\n${postingForPrompt(company.research)}`,
          `The email goes to: ${email}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "cold_email",
    creativity: options.creativity,
    signal: options.signal,
  });
  return { data: { subject: oneLine(answer.subject), body: clean(answer.body) }, promptVersion: COLD_EMAIL_VERSION };
};
