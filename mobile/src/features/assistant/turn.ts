// AB2/AB4/AB5 · One Assistant Bar turn on the phone (docs/ASSISTANT_BAR_PLAN.md "How a turn works", D94, D98). Runs
// the same in the app's thread and in the bubble's headless task (overlayTask.ts), so nothing here needs React:
//   1. snapshot (snapshot.ts): today's numbers, the week, trend, streak, plan and food ideas, the words that help
//      speech-to-text, and what the turn rules need (activity running, last weight, previous turn)
//   2. POST /assistant/turn (voice or text), or offline: answer a plain question from local data, else queue it
//   3. the phone checks every action again (checkPhoneTurn), saves the turn in the thread and runs the sure ones
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { useMemo } from "react";
import { create } from "zustand";

import { api, ApiError, describeError } from "@/core/api/client";
import type { AssistantTurnResult } from "@/core/api/types";
import { kv } from "@/core/storage/kv";
import { activeActivity } from "@/features/activity/store";
import { addMessage } from "@/features/coach/chat";
import { VOICE_MIME } from "@/features/log/parse";
import { listWeights } from "@/features/progress/weights";
import { useActiveUser } from "@/features/users/activeUser";
import { localAskTopic, OFFLINE_ANSWER_LINE, TURN_TEXT_MAX, type TurnContext } from "@shared/domain/assistant";
import { answerFacts, answerText, OFFLINE_TOPICS } from "@shared/domain/assistantFacts";
import { localDate } from "@shared/domain/food";
import { checkPhoneTurn, usualPortions } from "./executors";
import type { TurnSnapshot } from "./snapshot";
import { previousForServer, previousTurn, runSure, threadForServer } from "./thread";
import type { StoredTurn } from "./types";

export type { TurnSnapshot } from "./snapshot";


/** The turn rules' view of this phone (shared TurnContext). */
export function phoneContext(userId: string, today: string): TurnContext {
  const running = activeActivity();
  const prev = previousTurn(userId);
  const weights = listWeights(userId);
  const last = weights[weights.length - 1] ?? null;
  return {
    today,
    lastWeightKg: last?.kg ?? null,
    activityRunning: !!running && running.userId === userId,
    previousActions: prev && prev.turn.date === today ? prev.turn.items.length : 0,
  };
}

// ── Offline queue (D98) ──────────────────────────────────────────────────────────────────────────

export type QueuedTurn = { id: string; kind: "text" | "voice"; text: string | null; uri: string | null; at: string };

const queueKey = (userId: string) => `zorka.assistantQueue.${userId}`;
export const useAssistantQueue = create<{ v: number }>(() => ({ v: 0 }));

export function queuedTurns(userId: string): QueuedTurn[] {
  try {
    const list = JSON.parse(kv.get(queueKey(userId)) ?? "[]") as QueuedTurn[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, list: QueuedTurn[]) {
  if (list.length) kv.set(queueKey(userId), JSON.stringify(list));
  else kv.remove(queueKey(userId));
  useAssistantQueue.setState((s) => ({ v: s.v + 1 }));
}

function queueTurn(userId: string, input: { text?: string; uri?: string }): QueuedTurn {
  const id = randomUUID();
  let uri: string | null = null;
  if (input.uri) {
    const dir = new Directory(Paths.document, "assistant-queue");
    if (!dir.exists) dir.create({ idempotent: true });
    const kept = new File(dir, `${id}.m4a`);
    new File(input.uri).copySync(kept);
    uri = kept.uri;
  }
  const q: QueuedTurn = { id, kind: input.uri ? "voice" : "text", text: input.text ?? null, uri, at: new Date().toISOString() };
  writeQueue(userId, [...queuedTurns(userId), q]);
  return q;
}

function dropQueued(userId: string, q: QueuedTurn) {
  writeQueue(
    userId,
    queuedTurns(userId).filter((x) => x.id !== q.id),
  );
  try {
    if (q.uri) new File(q.uri).delete();
  } catch {
    // Already gone.
  }
}

export function useQueuedTurns(userId: string | null): QueuedTurn[] {
  const v = useAssistantQueue((s) => s.v);
  return useMemo(() => {
    void v;
    return userId ? queuedTurns(userId) : [];
  }, [userId, v]);
}

// ── Running a turn ───────────────────────────────────────────────────────────────────────────────

export type TurnOutcome =
  | { kind: "done"; messageId: string }
  | { kind: "no_speech" }
  | { kind: "queued" }
  | { kind: "error"; error: { title: string; body: string } };

function save(snapshot: TurnSnapshot, said: string, turn: StoredTurn): string {
  addMessage(snapshot.userId, "user", said || "(voice)", snapshot.coach);
  return addMessage(snapshot.userId, "coach", turn.reply, snapshot.coach, { turn });
}

/** D98 · Offline: a plain question about today, the streak, the plan or the week is answered from local data. */
function answerLocally(snapshot: TurnSnapshot, text: string): string | null {
  const topic = localAskTopic(text);
  if (!topic) return null;
  const facts = answerFacts(topic, snapshot.facts);
  const reply = OFFLINE_TOPICS.includes(topic) ? answerText(facts) : OFFLINE_ANSWER_LINE;
  const turn: StoredTurn = {
    v: 1,
    date: snapshot.today,
    at: new Date().toISOString(),
    heard: { text, source: "text", confidence: "high" },
    kind: "actions",
    items: [
      {
        action: { kind: "ask", topic },
        tier: "answer",
        resolved: { kind: "answer", topic, date: facts.date, known: facts.known, lines: facts.lines, numbers: facts.numbers, card: facts.card },
        ask: null,
        line: reply,
        state: "answered",
        receipt: reply,
        undo: null,
      },
    ],
    reply,
    replyKind: "offline",
  };
  return save(snapshot, text, turn);
}

/**
 * Runs one turn. Voice (`uri`) or typed text. Offline, or when the connection drops mid-way, the turn waits in the queue
 * and runs when the network is back (flushQueue).
 */
export async function runTurn(snapshot: TurnSnapshot, input: { text?: string; uri?: string }, online: boolean): Promise<TurnOutcome> {
  const text = input.text?.replace(/\s+/g, " ").trim().slice(0, TURN_TEXT_MAX);
  if (!online) {
    if (text) {
      const answered = answerLocally(snapshot, text);
      if (answered) return { kind: "done", messageId: answered };
    }
    queueTurn(snapshot.userId, { text, uri: input.uri });
    return { kind: "queued" };
  }
  const ctx = phoneContext(snapshot.userId, snapshot.today);
  let result: AssistantTurnResult;
  try {
    const audio = input.uri ? await new File(input.uri).base64() : null;
    result = await api<AssistantTurnResult>(`/users/${snapshot.userId}/assistant/turn`, {
      method: "POST",
      body: {
        ...(audio ? { audioBase64: audio, mimeType: VOICE_MIME } : { text }),
        coach: snapshot.coach,
        context: snapshot.context,
        facts: snapshot.facts,
        turn: { activityRunning: ctx.activityRunning, lastWeightKg: ctx.lastWeightKg, previous: ctx.previousActions ? previousForServer(snapshot.userId) : null },
        vocab: snapshot.vocab,
        thread: threadForServer(snapshot.userId),
      },
      timeoutMs: 60_000,
    });
  } catch (e) {
    if (e instanceof ApiError && (e.kind === "network" || e.kind === "timeout")) {
      queueTurn(snapshot.userId, { text, uri: input.uri });
      return { kind: "queued" };
    }
    return { kind: "error", error: describeError(e) };
  }
  if (result.kind === "no_speech") return { kind: "no_speech" };
  if (useActiveUser.getState().userId !== snapshot.userId) return { kind: "error", error: { title: "Profile changed", body: "Say it again on this profile." } };

  const items = result.kind === "support" ? [] : checkPhoneTurn(result, ctx, usualPortions(snapshot.userId));
  const turn: StoredTurn = {
    v: 1,
    date: snapshot.today,
    at: new Date().toISOString(),
    heard: result.heard,
    kind: result.kind,
    items,
    reply: result.reply,
    replyKind: result.replyKind,
  };
  const messageId = save(snapshot, result.heard.text, turn);
  await runSure(messageId);
  return { kind: "done", messageId };
}

/** Runs queued turns, oldest first, once the network is back. Stops at the first one that can't reach the server. */
export async function flushQueue(snapshot: TurnSnapshot): Promise<number> {
  let ran = 0;
  for (const q of queuedTurns(snapshot.userId)) {
    if (q.uri && !new File(q.uri).exists) {
      dropQueued(snapshot.userId, q);
      continue;
    }
    // The original stays queued until this run is done, so a drop mid-way doesn't lose it.
    writeQueue(
      snapshot.userId,
      queuedTurns(snapshot.userId).filter((x) => x.id !== q.id),
    );
    const outcome = await runTurn(snapshot, { text: q.text ?? undefined, uri: q.uri ?? undefined }, true);
    if (outcome.kind === "queued") {
      // runTurn queued a fresh copy; the old file can go.
      try {
        if (q.uri) new File(q.uri).delete();
      } catch {
        // Already gone.
      }
      break;
    }
    try {
      if (q.uri) new File(q.uri).delete();
    } catch {
      // Already gone.
    }
    ran++;
  }
  return ran;
}

/** Today's queued turn count, for the pill's offline badge. */
export const queuedToday = (list: readonly QueuedTurn[], today: string) => list.filter((q) => localDate(new Date(q.at)) === today).length;
