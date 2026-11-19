"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { PageHeader } from "@/components/page-header";
import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { controlBaseClassName } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectControl } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import {
  OPPORTUNITY_FOCUS,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_REGIONS,
  OPPORTUNITY_STATUSES,
  opportunityFilterHref,
  type OpportunityFilter,
  type OpportunityStatus,
  type OpportunityView,
} from "@/lib/opportunities/types";

import { saveOpportunityNotesAction, setOpportunityStatusAction } from "./actions";

export type FellowshipsScreenProps = {
  filter: OpportunityFilter;
  entries: OpportunityView[];
  counts: { watching: number; applied: number; preparing: number };
};

const VIEWS = [
  { value: "all", label: "Everything" },
  { value: "watching", label: "Watching" },
  { value: "applied", label: "Applied" },
] as const;

/**
 * Fellowships and scholarships: a curated list of AI safety routes and
 * funded CS master's degrees, filtered in the address so a view can be
 * shared or kept. The user marks what they're interested in and keeps notes;
 * applications happen on each programme's own page.
 */
export function FellowshipsScreen({ filter, entries, counts }: FellowshipsScreenProps) {
  const router = useRouter();
  const [starting, startTransition] = useTransition();
  const go = (change: Partial<OpportunityFilter>) => startTransition(() => router.replace(opportunityFilterHref({ ...filter, ...change }), { scroll: false }));

  return (
    <>
      <PageHeader
        title="Fellowships"
        description="Fellowships, research roles and funded CS master's degrees worth watching, with an emphasis on AI safety and on routes open from Nepal or remotely. Keep your own shortlist and notes here; every entry links to the programme's own page, which is the last word on dates and eligibility."
      />
      <div className="flex flex-col gap-6 px-10 pb-20">
        <p role="note" className="rounded-panel border border-line-card bg-card px-6 py-4 text-sm text-pretty text-muted">
          Dates move from year to year, and a few programmes run rolling cohorts. Treat the timing here as the usual cycle, then confirm it on the
          programme&apos;s page before you plan around it.
        </p>

        <ViewTabs filter={filter} counts={counts} />
        <Filters filter={filter} onChange={go} busy={starting} />

        {entries.length === 0 ? (
          <p className="rounded-panel border border-dashed border-line-strong px-7 py-10 text-center text-sm text-muted">
            Nothing matches these filters. Try fewer.
          </p>
        ) : (
          <>
            <p className="text-meta text-muted">
              {entries.length} {entries.length === 1 ? "opportunity" : "opportunities"}
              {filter.view === "watching" ? " on your watchlist" : filter.view === "applied" ? " applied to" : ""}.
            </p>
            <ul className="flex flex-col gap-3">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <OpportunityCard entry={entry} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function ViewTabs({ filter, counts }: { filter: OpportunityFilter; counts: FellowshipsScreenProps["counts"] }) {
  const number = (value: (typeof VIEWS)[number]["value"]) =>
    value === "watching" ? counts.watching : value === "applied" ? counts.applied : undefined;
  return (
    <nav aria-label="Fellowships views" className="flex flex-wrap gap-1.5">
      {VIEWS.map((view) => {
        const count = number(view.value);
        return (
          <Link
            key={view.value}
            href={opportunityFilterHref({ ...filter, view: view.value })}
            aria-current={view.value === filter.view ? "page" : undefined}
            className={cn(
              "flex items-baseline gap-1.5 rounded-control border px-3 py-2 text-control",
              view.value === filter.view
                ? "border-primary bg-selected font-medium text-primary-text hover:text-primary-text"
                : "border-line-field bg-card text-ink hover:border-line-strong hover:bg-hover hover:text-ink",
            )}
          >
            {view.label}
            {count !== undefined && <span className="text-xs opacity-65">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function Filters({ filter, onChange, busy }: { filter: OpportunityFilter; onChange: (change: Partial<OpportunityFilter>) => void; busy: boolean }) {
  const [q, setQ] = useState(filter.q);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange({ q: q.trim() });
  };
  return (
    <form
      role="search"
      aria-label="Filter fellowships and scholarships"
      onSubmit={submit}
      aria-busy={busy || undefined}
      className="grid grid-cols-1 items-end gap-4 rounded-panel border border-line-card bg-card p-6 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Input label="Search" value={q} placeholder="e.g. MATS, Nepal, evaluation" onChange={(event) => setQ(event.target.value)} onBlur={() => q.trim() !== filter.q && onChange({ q: q.trim() })} />
      <Select label="Kind" value={filter.kind} onChange={(event) => onChange({ kind: event.target.value as OpportunityFilter["kind"] })}>
        <option value="">Any kind</option>
        {OPPORTUNITY_KINDS.map((kind) => (
          <option key={kind.value} value={kind.value}>
            {kind.label}
          </option>
        ))}
      </Select>
      <Select label="Focus" value={filter.focus} onChange={(event) => onChange({ focus: event.target.value as OpportunityFilter["focus"] })}>
        <option value="">Any focus</option>
        {OPPORTUNITY_FOCUS.map((focus) => (
          <option key={focus.value} value={focus.value}>
            {focus.label}
          </option>
        ))}
      </Select>
      <Select label="Where" value={filter.region} onChange={(event) => onChange({ region: event.target.value as OpportunityFilter["region"] })}>
        <option value="">Anywhere</option>
        {OPPORTUNITY_REGIONS.map((region) => (
          <option key={region.value} value={region.value}>
            {region.label}
          </option>
        ))}
      </Select>
    </form>
  );
}

function OpportunityCard({ entry }: { entry: OpportunityView }) {
  const router = useRouter();
  const [status, setStatus] = useState<OpportunityStatus | "">(entry.status ?? "");
  const [notes, setNotes] = useState(entry.notes);
  const [saved, setSaved] = useState(entry.notes);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const kinds = OPPORTUNITY_KINDS.filter((kind) => entry.kind === kind.value);
  const focus = OPPORTUNITY_FOCUS.filter((option) => entry.focus.includes(option.value));
  const regions = OPPORTUNITY_REGIONS.filter((option) => entry.regions.includes(option.value));

  const change = async (value: OpportunityStatus | "") => {
    if (busy) return;
    const before = status;
    setStatus(value);
    setBusy(true);
    const result = toastResult(await setOpportunityStatusAction({ id: entry.id, status: value }));
    setBusy(false);
    if (!result.ok) {
      setStatus(before);
      return;
    }
    if (value === "") toast(`Removed ${entry.name} from your list.`);
    else if (value === "APPLIED") toast(`Marked ${entry.name} as applied.`);
    else if (value === "PREPARING") toast(`Marked ${entry.name} as preparing.`);
    router.refresh();
  };

  const saveNotes = async () => {
    if (notes === saved) return;
    const result = toastResult(await saveOpportunityNotesAction({ id: entry.id, notes }));
    if (result.ok) {
      setSaved(notes);
      if (!status) setStatus("INTERESTED");
      router.refresh();
    }
  };

  return (
    <article aria-label={entry.name} className="flex flex-col gap-4 rounded-panel border border-line-card bg-card px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-serif text-section">{entry.name}</h2>
            <span className="text-meta text-muted">{entry.org}</span>
            {entry.priority && (
              <span className="rounded-full border border-primary/40 bg-selected px-2 py-0.5 text-xs font-medium text-primary-text">Look first</span>
            )}
          </div>
          <p className="text-meta text-muted">
            {[kinds[0]?.label, ...focus.map((option) => option.label), regions.map((option) => option.label).join(", ")].filter(Boolean).join(" · ")}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-meta text-muted">
          <span className="sr-only">Where {entry.name} stands</span>
          <SelectControl
            compact
            aria-label={`Where ${entry.name} stands`}
            value={status}
            disabled={busy}
            onChange={(event) => void change(event.target.value as OpportunityStatus | "")}
            className={cn(controlBaseClassName, "h-8 py-0 text-xs")}
          >
            <option value="">Not watching</option>
            {OPPORTUNITY_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </label>
      </div>

      <p className="text-sm text-pretty">{entry.summary}</p>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-meta text-muted">Funding</dt>
          <dd className="text-pretty">{entry.funding}</dd>
        </div>
        <div>
          <dt className="text-meta text-muted">When</dt>
          <dd className="text-pretty">{entry.timing}</dd>
        </div>
      </dl>

      {open && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-meta text-muted">Who it&apos;s for</p>
            <p className="text-sm text-pretty">{entry.eligibility}</p>
          </div>
          <Textarea label="Your notes" rows={3} value={notes} maxLength={5_000} placeholder="Requirements to check, a contact, what to prepare…" onChange={(event) => setNotes(event.target.value)} onBlur={() => void saveNotes()} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-meta">
        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
          The programme&apos;s page ↗
        </a>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-muted underline underline-offset-2 hover:text-ink">
          {open ? "Hide eligibility and notes" : "Eligibility and notes"}
        </button>
        {status === "INTERESTED" && (
          <Button size="sm" variant="secondary" className="ml-auto" aria-disabled={busy || undefined} onClick={() => void change("PREPARING")}>
            I&apos;m preparing
          </Button>
        )}
        {status === "PREPARING" && (
          <Button size="sm" variant="secondary" className="ml-auto" aria-disabled={busy || undefined} onClick={() => void change("APPLIED")}>
            Mark as applied
          </Button>
        )}
      </div>
    </article>
  );
}
