"use server";

import { z } from "zod";

import { StartupStatus } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import { getAiProvider } from "@/lib/ai";
import { isAiConfigured } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/errors";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { writeColdEmail } from "@/lib/ai/tasks";
import { loadProfile } from "@/lib/profile-data";
import { sendColdEmail } from "@/lib/cold-email";
import { researchStartup } from "@/lib/startups/research";
import { findUnfinishedJobs, startJob } from "@/lib/jobs/runner";
import { scoreProfilesSchema } from "@/lib/jobs/score-posting";
import { scoreStartupJob, startupScoreJobKey } from "@/lib/jobs/score-startup";
import { scoreLevelsProblem, type LevelsProblem } from "@/lib/profiles";
import { scoringProblem } from "@/lib/scoring";
import { loadScoringConfig } from "@/lib/scoring/config";
import { startStartupsRefresh } from "@/lib/startups/refresh";
import { getStartup, lookUpStartup, removeStartup, updateStartup } from "@/lib/startups/store";

// The Startups screen's actions (#222). Nothing here sends anything: the
// user writes to a startup from New application or their own mail.

const startupId = z.string().min(1).max(64);
const GONE = "That startup is no longer in the list. Refresh the page.";

/** "Draft cold email": read the company's own pages, then write a subject and message that make the profile's case. */
export const draftColdEmail = action(z.object({ id: startupId, email: z.string().max(200) }), async ({ id, email }) => {
  if (!(await isAiConfigured())) throw new ActionError("Choose an AI provider in Settings → AI provider first.");
  const [startup, profile, options] = await Promise.all([getStartup(id), loadProfile(), loadTaskOptions()]);
  if (!startup) throw new ActionError(GONE);
  if (!email.trim()) throw new ActionError("Choose an address to write to first.");
  const research = await researchStartup(startup.website);
  try {
    const { data } = await writeColdEmail(
      await getAiProvider(),
      {
        profile,
        company: {
          company: startup.company,
          summary: startup.summary,
          details: startup.details,
          website: startup.website,
          stage: startup.stage,
          location: startup.location,
          roles: startup.roles,
          research,
        },
        email: email.trim(),
      },
      options,
    );
    return data;
  } catch (error) {
    if (error instanceof AiError) throw new ActionError(error.message);
    throw error;
  }
});

/** "Send cold email": sends the reviewed text with the base resume attached. */
export const sendColdEmailNow = action(
  z.object({ id: startupId, to: z.string().max(200), subject: z.string().min(1).max(200), body: z.string().min(1).max(6_000) }),
  async ({ id, to, subject, body }) => {
    try {
      return await sendColdEmail({ startupId: id, to, subject, body });
    } catch (error) {
      throw new ActionError(error instanceof Error ? error.message : "The email couldn't be sent.");
    }
  },
);

/** "Refresh": asks both sources again, in the background; returns the job to follow. */
export const refreshStartupsNow = action(z.object({}), async () => ({ jobId: await startStartupsRefresh() }));

/**
 * "Score" (#524): how well a startup's post fits one profile, or all of
 * them, with the model Settings → Scoring chose, in the background, as
 * Positions scores a posting; a scoring under way is followed, not started
 * again. Its levels first (E24-3): the browser says where to choose them.
 */
export const startScoringStartup = action(
  z.object({ id: startupId, profiles: scoreProfilesSchema }),
  async ({ id, profiles }): Promise<{ jobId: string } | { setLevels: LevelsProblem }> => {
    const waiting = await scoreLevelsProblem(profiles);
    if (waiting) return { setLevels: waiting };
    const problem = await scoringProblem(await loadScoringConfig());
    if (problem) throw new ActionError(problem);
    const key = startupScoreJobKey(id);
    const [unfinished] = await findUnfinishedJobs(key);
    return { jobId: unfinished?.id ?? (await startJob(scoreStartupJob, { id, profiles }, { key })) };
  },
);

/** Save, Mark as contacted, Dismiss, and their Undo. */
export const setStartupStatus = action(z.object({ id: startupId, status: z.enum(StartupStatus) }), async ({ id, status }) => {
  const startup = await updateStartup(id, { status });
  if (!startup) throw new ActionError(GONE);
  return { status: startup.status };
});

/**
 * "Find addresses on their site", or with `people`, "Look for people's
 * addresses": reads the startup's own pages for the addresses it publishes.
 */
export const lookUpStartupAddresses = action(z.object({ id: startupId, people: z.boolean() }), async ({ id, people }) => {
  const startup = await lookUpStartup(id, { people });
  if (!startup) throw new ActionError(GONE);
  return startup;
});

/** Notes on a startup, kept as typed. */
export const saveStartupNotes = action(z.object({ id: startupId, notes: z.string().max(5_000) }), async ({ id, notes }) => {
  if (!(await updateStartup(id, { notes }))) throw new ActionError(GONE);
  return null;
});

/** "Remove and don't bring back": deletes it, and refreshes leave it out from now on. */
export const removeStartupForGood = action(z.object({ id: startupId }), async ({ id }, { toast }) => {
  if (!(await removeStartup(id))) throw new ActionError(GONE);
  toast("Removed. Refreshes won't bring it back.");
  return null;
});
