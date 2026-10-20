// P35 · Coach chat on the phone (D58/D60). History is phone only: the last 50 messages per profile in SQLite. The
// server gets the last 20 messages and today's numbers; it answers in the persona's voice or with a fixed safety reply.
// AB7 (D89): this is now the Zorka thread. Assistant Bar turns are written here too, a reply carrying its turn (what
// ran, its receipts and Undo); old coach messages stay as they were.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import { api } from "@/core/api/client";
import type { CoachAction, CoachChatResult, CoachDayContext, CoachId, Profile } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import type { StoredTurn } from "@/features/assistant/types";
import type { DayGap } from "@/features/gap/gap";
import type { Streak } from "@shared/domain/streak";

export const KEEP_MESSAGES = 50;
export const SEND_MESSAGES = 20;

export type ChatMessage = {
  id: string;
  role: "user" | "coach";
  text: string;
  coach: CoachId;
  createdAt: string;
  /** UX N1 · Buttons under a coach reply. */
  actions: CoachAction[];
  /** AB4 · The Assistant Bar turn this reply answered (null for coach chat). */
  turn: StoredTurn | null;
};

export const useChatVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useChatVersion.setState((s) => ({ v: s.v + 1 }));

type Row = {
  id: string;
  role: "user" | "coach";
  text: string;
  coach: CoachId;
  created_at: string;
  actions: string | null;
  turn: string | null;
};

function parseTurn(raw: string | null): StoredTurn | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as StoredTurn;
    return t?.v === 1 ? t : null;
  } catch {
    return null;
  }
}

function parseActions(raw: string | null): CoachAction[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? (list as CoachAction[]) : [];
  } catch {
    return [];
  }
}

export function chatMessages(userId: string): ChatMessage[] {
  return getDb()
    .getAllSync<Row>(
      // Row order breaks ties: an Assistant Bar turn saves its two messages within the same millisecond.
      `SELECT * FROM (SELECT *, rowid AS seq FROM coach_messages WHERE user_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?)
        ORDER BY created_at, seq`,
      userId,
      KEEP_MESSAGES,
    )
    .map((r) => ({
      id: r.id,
      role: r.role,
      text: r.text,
      coach: r.coach,
      createdAt: r.created_at,
      actions: parseActions(r.actions),
      turn: parseTurn(r.turn),
    }));
}

/** Adds a message (and trims the thread to KEEP_MESSAGES). Returns its id. */
export function addMessage(
  userId: string,
  role: ChatMessage["role"],
  text: string,
  coach: CoachId,
  extra: { actions?: CoachAction[]; turn?: StoredTurn | null } = {},
): string {
  const db = getDb();
  const id = randomUUID();
  const actions = extra.actions ?? [];
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO coach_messages (id, user_id, role, text, coach, created_at, actions, turn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      role,
      text,
      coach,
      new Date().toISOString(),
      actions.length ? JSON.stringify(actions) : null,
      extra.turn ? JSON.stringify(extra.turn) : null,
    );
    db.runSync(
      `DELETE FROM coach_messages WHERE user_id = ? AND id NOT IN
         (SELECT id FROM coach_messages WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
      userId,
      userId,
      KEEP_MESSAGES,
    );
  });
  bump();
  return id;
}

/** AB4 · Saves a turn's new state (an approval ran, an item was undone, a chip was changed). */
export function updateTurn(messageId: string, turn: StoredTurn) {
  getDb().runSync(`UPDATE coach_messages SET turn = ? WHERE id = ?`, JSON.stringify(turn), messageId);
  bump();
}

export function clearChat(userId: string) {
  getDb().runSync(`DELETE FROM coach_messages WHERE user_id = ?`, userId);
  bump();
}

export function useChat(userId: string | null): ChatMessage[] {
  const v = useChatVersion((s) => s.v);
  return useMemo(() => {
    void v;
    return userId ? chatMessages(userId) : [];
  }, [userId, v]);
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** What the coach knows about today. Every number it may quote comes from here (D60). */
export function dayContext(
  dg: DayGap,
  profile: Profile | null | undefined,
  streak: Streak | null,
  now = new Date(),
): CoachDayContext {
  const g = dg.gap;
  return {
    name: profile?.displayName ?? null,
    goal: profile?.goal ?? null,
    diet: profile?.diet ?? null,
    localTime: hhmm(now),
    state: dg.coverage === "complete" ? g.state : "on_track",
    targetKcal: dg.targets.kcal,
    floorKcal: dg.targets.floorKcal,
    kcalLeft: g.remaining.kcal,
    proteinLeftG: g.remaining.proteinG,
    carbsLeftG: g.remaining.carbsG,
    fatLeftG: g.remaining.fatG,
    eatenKcal: g.eaten.kcal,
    eatenProteinG: g.eaten.proteinG,
    burnedKcal: dg.burnedKcal,
    steps: dg.steps,
    stepGoal: dg.targets.steps,
    streakDays: streak?.current ?? 0,
    workoutToday: dg.workoutToday,
    mealsToday: [`Record coverage: ${dg.coverage}; weight freshness: ${dg.weightFreshness}. Totals are recorded estimates.`, ...dg.mealNames].slice(0, 12).map((m) => m.slice(0, 120)),
  };
}

/**
 * Sends the user's message (saved first, so it's never lost) and saves the coach's reply. Throws ApiError when the
 * coach can't answer; the message stays and `retry` asks again without adding it twice.
 */
export async function sendToCoach(
  userId: string,
  coach: CoachId,
  text: string,
  context: CoachDayContext,
  opts: { retry?: boolean } = {},
): Promise<CoachChatResult> {
  if (!opts.retry) addMessage(userId, "user", text.trim(), coach);
  const history = chatMessages(userId)
    .slice(-SEND_MESSAGES)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
  // The server wants the user's message last.
  while (history.length && history[history.length - 1]!.role !== "user") history.pop();
  const result = await api<CoachChatResult>(`/users/${userId}/coach/chat`, {
    method: "POST",
    body: { coach, messages: history, context },
    timeoutMs: 30_000,
  });
  addMessage(userId, "coach", result.reply, coach, { actions: result.actions ?? [] });
  return result;
}
