// AB4 · What the bubble's card shows (docs/ASSISTANT_BAR_PLAN.md "Result sheet"), as plain JSON for the native card
// (modules/zorka-overlay OverlayCard.kt): "Heard: …", Zorka's reply, and one row per action with its buttons. A button
// id comes back to the headless task as `{ op: "action", messageId, index, action }` (overlayTask.ts).
import type { AskPatch } from "@/core/api/types";
import { canUndo } from "./thread";
import type { StoredItem, StoredTurn } from "./types";

export type OverlayButton = { id: string; label: string; primary?: boolean };
export type OverlayRow = { index: number; text: string; note: string | null; state: StoredItem["state"]; buttons: OverlayButton[] };
/** How the tiger reacts: a bounce when done, a lean when something needs the user, a shake when refused. */
export type OverlayMood = "idle" | "happy" | "tilt" | "shake" | "sleepy";

export type OverlayView =
  | { phase: "result"; messageId: string; heard: string | null; heardNote: string | null; reply: string; rows: OverlayRow[]; mood: OverlayMood; sticky: boolean }
  | { phase: "message"; text: string; mood: OverlayMood; openApp?: string };

const CONFIDENCE_NOTE = { high: null, medium: "Check I heard you right.", low: "I'm not sure I heard that right." } as const;

/** An Ask option's button id carries its index; the task looks the patch up again (never trusts the id's content). */
export const optionId = (i: number) => `option:${i}`;
export const sayId = (i: number) => `say:${i}`;

function buttons(turn: StoredTurn, item: StoredItem, today: string): OverlayButton[] {
  const out: OverlayButton[] = [];
  if (item.state === "pending") {
    out.push({ id: "ok", label: "OK", primary: true });
    if (item.action.kind === "log_meal" || item.action.kind === "set_day" || item.action.kind === "log_weight")
      out.push({ id: "change", label: "Change" });
    out.push({ id: "not_now", label: "Not now" });
  }
  if (item.state === "asking") {
    item.ask?.options.forEach((o, i) => out.push({ id: optionId(i), label: o.label }));
    if (item.action.kind === "clarify") item.action.options.forEach((o, i) => out.push({ id: sayId(i), label: o }));
  }
  if (canUndo(turn, item, today)) out.push({ id: "undo", label: "Undo" });
  return out;
}

function rowText(item: StoredItem): string {
  if (item.state === "undone") return `Undone: ${item.receipt}`;
  if (item.state === "dismissed") return `Skipped: ${item.receipt}`;
  if (item.resolved?.kind === "answer") return item.resolved.lines.slice(0, 3).join(" ");
  return item.receipt;
}

export function overlayView(messageId: string, turn: StoredTurn, today: string): OverlayView {
  const rows = turn.items.map((item, index) => ({
    index,
    text: rowText(item),
    note: item.state === "failed" ? null : (item.note ?? null),
    state: item.state,
    buttons: buttons(turn, item, today),
  }));
  const waiting = turn.items.some((i) => i.state === "pending" || i.state === "asking");
  const mood: OverlayMood = waiting
    ? "tilt"
    : turn.items.length && turn.items.every((i) => i.state === "refused")
      ? "shake"
      : turn.items.some((i) => i.state === "done")
        ? "happy"
        : "idle";
  // One answer on its own reads better as the reply itself than as a row under it.
  const lone = turn.items.length === 1 && turn.items[0]!.resolved?.kind === "answer" ? turn.items[0]! : null;
  return {
    phase: "result",
    messageId,
    heard: turn.heard.text || null,
    heardNote: turn.heard.source === "voice" ? CONFIDENCE_NOTE[turn.heard.confidence] : null,
    reply: turn.reply || (lone ? rowText(lone) : ""),
    rows: lone ? [] : rows,
    mood,
    // A card that waits on the user stays until they answer; otherwise it hides itself after the Undo window.
    sticky: waiting,
  };
}

/** The patch behind an option button, looked up from the stored turn. */
export function patchFor(item: StoredItem, id: string): AskPatch | null {
  const m = /^option:(\d+)$/.exec(id);
  return m ? (item.ask?.options[Number(m[1])]?.patch ?? null) : null;
}

/** The words behind a clarify option button. */
export function sayFor(item: StoredItem, id: string): string | null {
  const m = /^say:(\d+)$/.exec(id);
  return m && item.action.kind === "clarify" ? (item.action.options[Number(m[1])] ?? null) : null;
}
