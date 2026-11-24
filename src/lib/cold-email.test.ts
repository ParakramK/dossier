import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startup: {
    findUnique: vi.fn(async () => ({ id: "s1", company: "Acme AI" })),
    update: vi.fn(async (args: unknown) => args),
  },
  emailMessage: { upsert: vi.fn(async (args: unknown) => args) },
  transaction: vi.fn(async (steps: unknown[]) => steps),
  sendMail: vi.fn(async (mail: unknown) => ({ id: "gmail-1", threadId: "thread-1", to: (mail as { to: string }).to })),
  renderPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { startup: mocks.startup, emailMessage: mocks.emailMessage, $transaction: mocks.transaction },
}));
vi.mock("@/lib/google/account", () => ({ loadGoogleAccount: async () => ({ email: "jane@gmail.com" }) }));
vi.mock("@/lib/google/gmail", () => ({ sendMail: mocks.sendMail }));
vi.mock("@/lib/pdf/render", () => ({ renderPdf: mocks.renderPdf }));
vi.mock("@/lib/profile-data", () => ({ loadProfileName: async () => "Jane Doe" }));
vi.mock("@/lib/profiles", () => ({ profileIdOr: async () => "p1" }));
vi.mock("@/lib/settings-data", () => ({ loadSettings: async () => ({ fileNamePattern: "{name} - {doc}" }) }));

import { sendColdEmail } from "./cold-email";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendColdEmail", () => {
  it("sends the reviewed email with the base resume and marks the startup contacted", async () => {
    const result = await sendColdEmail({ startupId: "s1", to: "jobs@acme.example", subject: "Evaluation data at Acme", body: "Hello team, I built a toolkit for this. Resume attached." });

    expect(result).toEqual({ threadId: "thread-1", attachment: "Jane Doe - Resume.pdf" });
    expect(mocks.renderPdf).toHaveBeenCalledWith("/print/base?profile=p1");
    const mail = mocks.sendMail.mock.calls[0][0] as { from: string; to: string; subject: string; body: string; attachments: { fileName: string; data: Uint8Array }[] };
    expect(mail.from).toContain("jane@gmail.com");
    expect(mail.to).toBe("jobs@acme.example");
    expect(mail.subject).toBe("Evaluation data at Acme");
    expect(mail.attachments).toEqual([{ fileName: "Jane Doe - Resume.pdf", contentType: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) }]);
    expect(mocks.startup.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "CONTACTED" }) }));
    expect(mocks.emailMessage.upsert).toHaveBeenCalled();
  });

  it("refuses a bad address before sending anything", async () => {
    await expect(sendColdEmail({ startupId: "s1", to: "not-an-address", subject: "Hi", body: "Hello" })).rejects.toThrow(/email address/);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
