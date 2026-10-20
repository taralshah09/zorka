// LA2 · Day briefs on the phone ("day_brief", D73–D74, D78). One live brief per date: saving a date's brief again
// updates the same row, so last-write-wins keeps one per day across phones. Facts are validated before saving.
import { useMemo } from "react";

import { validateDayFacts, type DayFacts } from "@shared/domain/life";
import { localEntity, newId } from "./local";

export type BriefStatus = "draft" | "confirmed";
export type Brief = {
  id: string;
  localDate: string;
  rawText: string;
  facts: DayFacts;
  status: BriefStatus;
  source: "brief" | "calendar" | "inferred";
};

const parse = (raw: unknown): DayFacts => {
  try {
    return validateDayFacts(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return validateDayFacts({});
  }
};

const store = localEntity<Brief>({
  entity: "day_brief",
  table: "day_briefs",
  columns: ["local_date", "raw_text", "parsed", "status", "source"],
  toColumns: (b) => [b.localDate, b.rawText, JSON.stringify(b.facts), b.status, b.source],
  toPayload: (b) => ({ localDate: b.localDate, rawText: b.rawText, parsed: b.facts, status: b.status, source: b.source }),
  fromServer: (id, d) => ({
    id,
    localDate: String(d.localDate),
    rawText: String(d.rawText ?? ""),
    facts: parse(d.parsed),
    status: d.status === "draft" ? "draft" : "confirmed",
    source: d.source === "calendar" || d.source === "inferred" ? d.source : "brief",
  }),
  fromRow: (r) => ({
    id: String(r.id),
    localDate: String(r.local_date),
    rawText: String(r.raw_text),
    facts: parse(r.parsed),
    status: r.status === "draft" ? "draft" : "confirmed",
    source: r.source === "calendar" || r.source === "inferred" ? (r.source as Brief["source"]) : "brief",
  }),
});

export const useBriefsVersion = store.useVersion;

/** The live brief for a date (newest wins if two phones made one), or null. */
export function briefFor(userId: string, date: string): Brief | null {
  return store.rows(`user_id = ? AND local_date = ? AND deleted = 0 ORDER BY client_updated_at DESC LIMIT 1`, userId, date)[0] ?? null;
}

/** Confirmed briefs from `from` to `to` (inclusive), one per date. */
export function briefsBetween(userId: string, from: string, to: string): Map<string, Brief> {
  const out = new Map<string, Brief>();
  for (const b of store.rows(
    `user_id = ? AND local_date BETWEEN ? AND ? AND deleted = 0 AND status = 'confirmed' ORDER BY client_updated_at`,
    userId,
    from,
    to,
  ))
    out.set(b.localDate, b);
  return out;
}

/** Saves the date's brief, reusing its row. */
export function saveBrief(userId: string, date: string, rawText: string, facts: DayFacts, status: BriefStatus): Brief {
  const existing = briefFor(userId, date);
  const brief: Brief = { id: existing?.id ?? newId(), localDate: date, rawText: rawText.slice(0, 2000), facts: validateDayFacts(facts), status, source: "brief" };
  store.write(userId, brief);
  return brief;
}

export function deleteBrief(userId: string, brief: Brief) {
  store.remove(userId, brief);
}

export function useBrief(userId: string | null, date: string): Brief | null {
  const stamp = store.useStamp();
  return useMemo(() => {
    void stamp;
    return userId ? briefFor(userId, date) : null;
  }, [userId, date, stamp]);
}

export function useBriefsBetween(userId: string | null, from: string, to: string): Map<string, Brief> {
  const stamp = store.useStamp();
  return useMemo(() => {
    void stamp;
    return userId ? briefsBetween(userId, from, to) : new Map();
  }, [userId, from, to, stamp]);
}
