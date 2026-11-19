import { z } from "zod";

import type { ProfileData } from "@/lib/profile";

import { CREATIVITY, NO_EM_DASHES, postingForPrompt, profileForPrompt, system, truthfulness, UNTRUSTED_POSTING, type Task } from "./prompt-parts";

export const WARM_OUTREACH_VERSION = "warm-outreach@1";

const answerSchema = z.object({
  message: z.string(),
});

/** A project the note can point to, with the link the user wants in it. */
export type OutreachProject = {
  name: string;
  link: string;
  /** The profile's bullets for it, as plain lines. */
  bullets: string;
};

export type WarmOutreachInput = {
  profile: ProfileData;
  startup: {
    company: string;
    summary: string;
    details: string;
    stage: string;
    location: string;
    roles: string[];
  };
  /** The projects with links; the model picks the closest one. */
  projects: OutreachProject[];
};

const INSTRUCTIONS = `You write a warm-introduction message a candidate will send, themselves, to the founder or head of AI at an early-stage startup. It is not a job application and not a cover letter.

Write exactly four sentences, in this order:
1. Say what the startup is building and name one concrete, specific data or model problem it will have at its stage. Make the problem about the work the posting describes, not a generic "AI is hard" statement. If the posting is too thin to infer one, name a problem that follows from the role, and say you are inferring it.
2. Point to one project from the candidate's profile that is relevant, using its exact name and its exact link, and say in one clause what it did that speaks to that problem.
3. Say what the candidate would like: a short conversation, or to send a short note with one idea. Never ask for a job outright.
4. Ask a single, easy question that gives the person a reason to reply.

Rules:
- No greeting, no sign-off, no name at the end: the candidate adds those.
- No flattery, no "I hope this finds you well", no adjectives about the company, no long list of skills, and no more than 110 words.
- Use only facts in the candidate's profile and the posting. Never invent a metric, employer, dataset, publication or result.
- The project's link must appear exactly as given. If no project fits, choose the closest and say why in one clause; never invent a project.
- Address the reader as "you". Do not assume their name.
- ${NO_EM_DASHES}`;

const clean = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^["“]|["”]$/g, "")
    .slice(0, 1_500);

/** "Warm outreach" on a startup: four sentences, one project link, ready to paste. */
export const warmOutreach: Task<WarmOutreachInput, { message: string }> = async (provider, { profile, startup, projects }, options) => {
  const answer = await provider.complete({
    task: "write-outreach",
    system: system(
      INSTRUCTIONS,
      truthfulness(options.strict),
      CREATIVITY[options.creativity],
      UNTRUSTED_POSTING,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(profile)}`,
          `Projects the candidate can point to, with the exact links to use:\n${JSON.stringify(projects, null, 2)}`,
          `The startup:\n${JSON.stringify(startup, null, 2)}`,
          `What the startup published:\n${postingForPrompt([startup.summary, startup.details].filter(Boolean).join("\n\n"))}`,
        ].join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "warm_outreach",
    // Written to be read by one person, not mass-produced.
    creativity: options.creativity,
    effort: "medium",
    signal: options.signal,
  });
  return { data: { message: clean(answer.message) }, promptVersion: WARM_OUTREACH_VERSION };
};
