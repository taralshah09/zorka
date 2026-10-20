// AB4/AB7 · The Zorka thread's turns (docs/ASSISTANT_BAR_PLAN.md "Thread"). Each Assistant Bar turn is two messages in
// coach_messages: what the user said, and Zorka's reply carrying the turn (StoredTurn). Everything that changes a turn
// later (OK on an approval, a chip, Undo from the thread) goes through here, so the sheet and the thread agree.
import type { AskPatch, AssistantParsedItem } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import { chatMessages, updateTurn, type ChatMessage } from "@/features/coach/chat";
import type { TurnContext } from "@shared/domain/assistant";
import { applyPatch, runItem, setPortion, swapFood, undoItem, type RunContext } from "./executors";
import type { StoredItem, StoredTurn } from "./types";

type Row = { id: string; turn: string | null; created_at: string; user_id: string };

const parse = (raw: string | null): StoredTurn | null => {
  try {
    const t = raw ? (JSON.parse(raw) as StoredTurn) : null;
    return t?.v === 1 ? t : null;
  } catch {
    return null;
  }
};

export function getTurn(messageId: string): { id: string; userId: string; createdAt: string; turn: StoredTurn } | null {
  const r = getDb().getFirstSync<Row>(`SELECT id, user_id, turn, created_at FROM coach_messages WHERE id = ?`, messageId);
  const turn = r ? parse(r.turn) : null;
  return r && turn ? { id: r.id, userId: r.user_id, createdAt: r.created_at, turn } : null;
}

/**
 * The latest turn saved before message `beforeId`, or the latest one. Row order, not the timestamp: two turns can be
 * saved within the same millisecond (a queue flushed after a reconnect).
 */
export function previousTurn(userId: string, beforeId?: string): { id: string; turn: StoredTurn } | null {
  const r = getDb().getFirstSync<Row>(
    `SELECT id, user_id, turn, created_at FROM coach_messages
      WHERE user_id = ? AND turn IS NOT NULL ${beforeId ? "AND rowid < (SELECT rowid FROM coach_messages WHERE id = ?)" : ""}
      ORDER BY rowid DESC LIMIT 1`,
    ...(beforeId ? [userId, beforeId] : [userId]),
  );
  const turn = r ? parse(r.turn) : null;
  return r && turn ? { id: r.id, turn } : null;
}

/** Today's turns, oldest first (Today's "done for you" line). */
export function turnsOn(userId: string, date: string): StoredTurn[] {
  return getDb()
    .getAllSync<Row>(`SELECT id, user_id, turn, created_at FROM coach_messages WHERE user_id = ? AND turn IS NOT NULL ORDER BY created_at`, userId)
    .map((r) => parse(r.turn))
    .filter((t): t is StoredTurn => !!t && t.date === date);
}

/** What the router needs about the previous turn, for "no, I said dal", "undo" and "and yesterday?". */
export function previousForServer(userId: string) {
  const prev = previousTurn(userId);
  if (!prev) return null;
  const clarify = prev.turn.items.find((i) => i.action.kind === "clarify" && i.state === "asking");
  return {
    actions: prev.turn.items.slice(0, 5).map((i) => {
      const a = i.action;
      return {
        kind: a.kind,
        ...("span" in a ? { span: a.span.slice(0, 300) } : {}),
        ...(a.kind === "ask" ? { topic: a.topic } : {}),
        ...("date" in a && a.date ? { date: a.date } : {}),
      };
    }),
    clarify: clarify?.action.kind === "clarify" ? { question: clarify.action.question, options: clarify.action.options } : null,
  };
}

/** The thread for the router: the last 10 messages, oldest first (same window as coach chat). */
export function threadForServer(userId: string): { role: "user" | "coach"; text: string }[] {
  return chatMessages(userId)
    .slice(-10)
    .map((m: ChatMessage) => ({ role: m.role, text: m.text.slice(0, 1000) }))
    .filter((m) => m.text.trim().length > 0);
}

// ── Changing a stored turn ───────────────────────────────────────────────────────────────────────

function runContextFor(messageId: string, userId: string, turn: StoredTurn): RunContext {
  const prev = previousTurn(userId, messageId);
  return {
    userId,
    today: turn.date,
    heard: turn.heard.text,
    source: turn.heard.source,
    previous: prev ? { turn: prev.turn, save: (t) => updateTurn(prev.id, t) } : null,
  };
}

async function change(messageId: string, index: number, fn: (item: StoredItem, ctx: RunContext) => Promise<StoredItem> | StoredItem) {
  const found = getTurn(messageId);
  const item = found?.turn.items[index];
  if (!found || !item) return;
  const next = await fn(item, runContextFor(messageId, found.userId, found.turn));
  // Re-read: running an item may have saved another turn (correct, undo), never this one.
  const fresh = getTurn(messageId)!;
  updateTurn(messageId, { ...fresh.turn, items: fresh.turn.items.map((it, i) => (i === index ? next : it)) });
}

/** OK on an Approve row. */
export const approve = (messageId: string, index: number) =>
  change(messageId, index, (item, ctx) => (item.state === "pending" ? runItem(item, ctx) : item));

/** "Not now" on an Approve or Ask row. */
export const dismiss = (messageId: string, index: number) =>
  change(messageId, index, (item) => (item.state === "pending" || item.state === "asking" ? { ...item, state: "dismissed" } : item));

/** Undo on a receipt. Today's turns only (D92: "from the thread forever, same day"). */
export const undo = (messageId: string, index: number) => change(messageId, index, (item, ctx) => undoItem(ctx.userId, item));

/** An option chip on an Ask row: patches the action, then runs it when it no longer needs an OK. */
export const answerAsk = (messageId: string, index: number, patch: AskPatch, turnCtx: TurnContext) =>
  change(messageId, index, async (item, ctx) => {
    const next = applyPatch(item, patch, turnCtx);
    return next.tier === "do" ? runItem(next, ctx) : next;
  });

/** AB6 · A food chip changed to one of its alternatives. */
export const swap = (messageId: string, index: number, itemIndex: number, food: AssistantParsedItem["alternatives"][number]) =>
  change(messageId, index, (item, ctx) => swapFood(ctx.userId, item, itemIndex, food));

/** AB6 · A food chip's portion stepper. */
export const portion = (messageId: string, index: number, itemIndex: number, quantity: number) =>
  change(messageId, index, (item) => setPortion(item, itemIndex, quantity));

/** Runs the turn's sure actions in order, right after it's saved. */
export async function runSure(messageId: string) {
  const found = getTurn(messageId);
  if (!found) return;
  for (let i = 0; i < found.turn.items.length; i++) {
    const item = getTurn(messageId)!.turn.items[i]!;
    if (item.tier === "do" && item.state === "pending") await change(messageId, i, (it, ctx) => runItem(it, ctx));
  }
}

/** Undo is offered for a receipt while it's done, undoable and from today. */
export const canUndo = (turn: StoredTurn, item: StoredItem, today: string) => item.state === "done" && !!item.undo && turn.date === today;
