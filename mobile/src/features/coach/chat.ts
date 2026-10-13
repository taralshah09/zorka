// P35 · Coach chat on the phone (D58/D60). History is phone only: the last 50 messages per profile in SQLite. The
// server gets the last 20 messages and today's numbers; it answers in the persona's voice or with a fixed safety reply.
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { create } from "zustand";

import { api } from "@/core/api/client";
import type { CoachAction, CoachChatResult, CoachDayContext, CoachId, Profile } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
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
};

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
      `SELECT * FROM (SELECT * FROM coach_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at`,
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
    }));
}

function add(userId: string, role: ChatMessage["role"], text: string, coach: CoachId, actions: CoachAction[] = []) {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO coach_messages (id, user_id, role, text, coach, created_at, actions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      userId,
      role,
      text,
      coach,
      new Date().toISOString(),
      actions.length ? JSON.stringify(actions) : null,
    );
    db.runSync(
      `DELETE FROM coach_messages WHERE user_id = ? AND id NOT IN
         (SELECT id FROM coach_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)`,
      userId,
      userId,
      KEEP_MESSAGES,
    );
  });
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
    state: g.state,
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
    mealsToday: dg.mealNames.slice(0, 12).map((m) => m.slice(0, 120)),
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
  if (!opts.retry) add(userId, "user", text.trim(), coach);
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
  add(userId, "coach", result.reply, coach, result.actions ?? []);
  return result;
}
