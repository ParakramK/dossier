import "server-only";

import type { PortalFields } from "@/lib/portals/engine";

import type { FoundPosting, SearchPage, SearchQuery } from "./search";

// What the job search hands a source (E14-1). Every built-in source runs on
// the portal engine since E22-2 (src/lib/portals); its credentials are its
// config's field values, by field name.

/**
 * The older hand-written adapters (merojob, Remotive, YC and the remote
 * boards) still use this shape; their portals are registered in built-in.ts
 * and their adapters are picked in portals/adapters.ts.
 */
export type JobSourceAdapter<S extends string = string> = {
  source: S;
  search: (query: SearchQuery, credentials: PortalFields, next: string | null, context?: RequestContext) => Promise<SearchPage>;
  details: (posting: FoundPosting, credentials: PortalFields, context?: RequestContext) => Promise<string | null>;
  test: (credentials: PortalFields, context?: RequestContext) => Promise<void>;
};

export type RequestContext = {
  /** Replaces the source's own address; for the end-to-end tests' fake source, or a self-hosted FreeHire. */
  baseUrl?: string;
  signal?: AbortSignal;
};
