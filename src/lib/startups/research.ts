import "server-only";

import { getSitePage } from "./http";
import { robotsAllowed } from "./robots";
import { htmlToText } from "./text";

// Public text from a company's own site, to write a cold email about what it
// actually does. Nothing is kept: one page at a time, robots.txt first, and a
// site that refuses is simply left out. The pages aren't stored.

const PATHS = ["", "/about", "/careers"];
const MAX_PER_PAGE = 4_000;
const MAX_TOTAL = 12_000;

/** What the company's own pages say, as plain text; "" when there's nothing to read. */
export async function researchStartup(website: string): Promise<string> {
  if (!/^https?:\/\//i.test(website)) return "";
  let origin: string;
  try {
    origin = new URL(website).origin;
  } catch {
    return "";
  }
  const parts: string[] = [];
  for (const path of PATHS) {
    const url = `${origin}${path || "/"}`;
    try {
      if (!(await robotsAllowed(url))) continue;
    } catch {
      continue;
    }
    try {
      const page = await getSitePage(url, { timeoutMs: 8_000 });
      if (!page.ok) continue;
      const text = htmlToText(page.html).replace(/\s+/g, " ").trim();
      if (text) parts.push(text.slice(0, MAX_PER_PAGE));
    } catch {
      continue;
    }
    if (parts.join("\n\n").length >= MAX_TOTAL) break;
  }
  return parts.join("\n\n").slice(0, MAX_TOTAL);
}
