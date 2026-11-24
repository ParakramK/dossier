import "server-only";

import { DocumentKind, EmailDirection, StartupStatus } from "@/generated/prisma/enums";
import { isEmailAddress } from "@/lib/application-email";
import { resolveFileName } from "@/lib/file-name";
import { loadGoogleAccount } from "@/lib/google/account";
import { sendMail } from "@/lib/google/gmail";
import { fromLine, type Attachment } from "@/lib/google/mime";
import { renderPdf } from "@/lib/pdf/render";
import { prisma } from "@/lib/prisma";
import { loadProfileName } from "@/lib/profile-data";
import { profileIdOr } from "@/lib/profiles";
import { loadSettings } from "@/lib/settings-data";

// Cold emails (the Startups screen): one mail, written and reviewed by the
// user, with the current profile's base resume attached. Nothing is sent
// without the user pressing Send.

export type ColdEmailResult = { threadId: string; attachment: string };

/** Sends the reviewed email with the base resume, and marks the startup contacted. */
export async function sendColdEmail({ startupId, to, subject, body }: { startupId: string; to: string; subject: string; body: string }): Promise<ColdEmailResult> {
  const account = await loadGoogleAccount();
  if (!account) throw new Error("Connect your Google account in Settings → Google first.");
  if (!isEmailAddress(to.trim())) throw new Error("Enter one email address to write to.");
  if (!subject.trim()) throw new Error("Write a subject first.");
  if (!body.trim()) throw new Error("Write the message first.");

  const startup = await prisma.startup.findUnique({ where: { id: startupId } });
  if (!startup) throw new Error("That startup is no longer in the list.");

  const [name, settings, profileId] = await Promise.all([loadProfileName(), loadSettings(), profileIdOr(null)]);
  const attachment: Attachment = {
    fileName: resolveFileName(settings.fileNamePattern, {
      name,
      company: startup.company,
      doc: DocumentKind.RESUME,
      date: new Date(),
    }),
    contentType: "application/pdf",
    data: await renderPdf(`/print/base?profile=${encodeURIComponent(profileId)}`),
  };

  const sent = await sendMail({ from: fromLine(name, account.email), to: to.trim(), subject: subject.trim(), body: body.trim(), attachments: [attachment] });

  await prisma.$transaction([
    prisma.startup.update({
      where: { id: startupId },
      data: { status: StartupStatus.CONTACTED, outreach: body.trim(), outreachAt: new Date() },
    }),
    prisma.emailMessage.upsert({
      where: { gmailId: sent.id },
      create: {
        gmailId: sent.id,
        threadId: sent.threadId,
        direction: EmailDirection.OUTGOING,
        fromName: name.trim(),
        fromAddress: account.email.toLowerCase(),
        toAddress: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        sentAt: new Date(),
        handledAt: new Date(),
      },
      update: {},
    }),
  ]);

  return { threadId: sent.threadId, attachment: attachment.fileName };
}
