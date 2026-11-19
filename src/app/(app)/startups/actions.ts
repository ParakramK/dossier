"use server";

import { z } from "zod";

import { StartupStatus } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import { getAiProvider } from "@/lib/ai";
import { isAiConfigured } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/errors";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { warmOutreach } from "@/lib/ai/tasks";
import { loadProfile } from "@/lib/profile-data";
import { startStartupsRefresh } from "@/lib/startups/refresh";
import { getStartup, lookUpStartup, removeStartup, saveStartupOutreach, updateStartup } from "@/lib/startups/store";

// The Startups screen's actions (#222). Nothing here sends anything: the
// user writes to a startup from New application or their own mail.

const startupId = z.string().min(1).max(64);
const GONE = "That startup is no longer in the list. Refresh the page.";

/** "Refresh": asks every source again, in the background; returns the job to follow. */
export const refreshStartupsNow = action(z.object({}), async () => ({ jobId: await startStartupsRefresh() }));

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

/**
 * "Warm introduction": writes four sentences the user can send to the
 * founder or head of AI, pointing at one of their projects. Dossier writes
 * the note and keeps it; it never sends anything.
 */
export const writeWarmOutreach = action(z.object({ id: startupId }), async ({ id }) => {
  if (!(await isAiConfigured())) throw new ActionError("That needs an AI provider. Choose one in Settings → AI provider.");
  const [startup, profile, options] = await Promise.all([getStartup(id), loadProfile(), loadTaskOptions()]);
  if (!startup) throw new ActionError(GONE);
  const projects = profile.projects
    .filter((project) => project.name.trim() && /^https?:\/\//i.test(project.link.trim()))
    .map((project) => ({
      name: project.name.trim(),
      link: project.link.trim(),
      bullets: project.bullets
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    }));
  if (projects.length === 0) {
    throw new ActionError("Add a project with a link to your profile first: the note needs something concrete to point to.");
  }
  try {
    const { data } = await warmOutreach(
      await getAiProvider(),
      {
        profile,
        startup: {
          company: startup.company,
          summary: startup.summary,
          details: startup.details,
          stage: startup.stage,
          location: startup.location,
          roles: startup.roles,
        },
        projects,
      },
      options,
    );
    return (await saveStartupOutreach(id, data.message)) ?? startup;
  } catch (error) {
    if (error instanceof AiError) throw new ActionError(error.message);
    throw error;
  }
});

/** "Remove and don't bring back": deletes it, and refreshes leave it out from now on. */
export const removeStartupForGood = action(z.object({ id: startupId }), async ({ id }, { toast }) => {
  if (!(await removeStartup(id))) throw new ActionError(GONE);
  toast("Removed. Refreshes won't bring it back.");
  return null;
});
