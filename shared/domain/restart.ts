export type Restart = { kind: "continue" | "today" | "refresh"; trackingGap: number | null; visitGap: number | null };
export function restartHelp(today: string, lastLog: string | null, lastVisit: string | null): Restart {
  const gap = (date: string | null) => date ? Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86400000)) : null;
  const trackingGap = gap(lastLog), visitGap = gap(lastVisit);
  const days = visitGap ?? trackingGap ?? 0;
  return { kind: days >= 21 ? "refresh" : days >= 5 ? "today" : "continue", trackingGap, visitGap };
}
