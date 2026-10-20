// AB4 · The bubble's headless task (docs/ASSISTANT_BAR_PLAN.md, D89, D94). The native bubble records or takes typed
// words, then starts this task ("ZorkaAssistant", registered in index.js); it runs with Zorka closed or open. A turn
// goes through the same code as the in-app thread (snapshot → runTurn → phone check → thread → executors), and a tap
// on the card (OK, Undo, an option) through the same thread operations. Every outcome is sent back to the bubble's
// card as JSON (overlayView.ts). Writes are local-first; a push is tried after each one.
import NetInfo from "@react-native-community/netinfo";
import { File } from "expo-file-system";
import { Linking } from "react-native";

import { getDb } from "@/core/storage/db";
import { flush } from "@/core/sync/engine";
import { useNetwork } from "@/core/network/network";
import { draftActions } from "@/features/log/draft";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";
import { ZorkaOverlay } from "../../../modules/zorka-overlay";
import { goTo } from "./navigate";
import { linkFor, patchFor, sayFor, overlayView, type OverlayView } from "./overlayView";
import { buildSnapshot } from "./snapshot";
import { answerAsk, approve, dismiss, getTurn, undo } from "./thread";
import { flushQueue, phoneContext, queuedTurns, runTurn, type TurnOutcome } from "./turn";
import type { StoredItem } from "./types";

export type OverlayTaskData =
  | { op: "turn"; audioPath?: string; text?: string }
  | { op: "action"; messageId: string; index: number; action: string };

const render = (view: OverlayView) => ZorkaOverlay?.render(JSON.stringify(view));
const message = (text: string, mood: OverlayView["mood"] = "idle", openApp?: string): OverlayView => ({ phase: "message", text, mood, openApp });

/** What the card shows for a finished turn. */
export function outcomeView(out: TurnOutcome, today: string): OverlayView {
  switch (out.kind) {
    case "done": {
      const found = getTurn(out.messageId);
      return found ? overlayView(out.messageId, found.turn, today) : message("Done.", "happy");
    }
    case "queued":
      return message("Saved. I'll do it when you're back online.", "sleepy");
    case "no_speech":
      return message("I didn't catch that. Tap me and try again, close to the phone.");
    case "error":
      return message(`${out.error.title}. ${out.error.body}`, "shake");
  }
}

const fileUri = (path: string) => (path.startsWith("file://") ? path : `file://${path}`);

/** Change on an approval: the full screen for it in Zorka (the meal's confirm sheet, the day's brief, the weight log). */
function change(userId: string, item: StoredItem, source: "voice" | "text") {
  const a = item.action;
  if (a.kind === "log_meal" && item.resolved?.kind === "meal") {
    draftActions.startFromParse(
      {
        source,
        transcript: null,
        items: item.resolved.items,
        followUp: null,
        timings: { sttMs: null, aiMs: 0, matchMs: 0, totalMs: 0 },
        ai: { slot: "assistant", model: "", attempts: 0 },
      },
      { mealType: item.resolved.mealType, userId },
    );
    goTo("/log/confirm");
  } else if (a.kind === "set_day") goTo({ pathname: "/plan/tomorrow", params: { date: a.date, text: a.note ?? "" } });
  else if (a.kind === "log_weight") goTo("/log-weight");
}

async function runAction(userId: string, data: Extract<OverlayTaskData, { op: "action" }>, online: boolean) {
  const today = localDate(new Date());
  const found = getTurn(data.messageId);
  const item = found?.turn.items[data.index];
  if (!found || !item) return render(message("That one's gone. Open Zorka to see your thread.", "idle", "zorka://coach"));
  const said = sayFor(item, data.action);
  if (said) return runWords(userId, { text: said }, online);
  const link = linkFor(item, data.action);
  if (link) {
    // The browser, not Zorka: a MuscleWiki page opens over whatever app the bubble is on. The card stays as it was.
    await Linking.openURL(link).catch(() => render(message("I couldn't open the browser. Try again from Zorka.", "shake")));
    return render(overlayView(data.messageId, found.turn, today));
  }
  const patch = patchFor(item, data.action);
  if (patch) await answerAsk(data.messageId, data.index, patch, phoneContext(userId, today));
  else if (data.action === "ok") await approve(data.messageId, data.index);
  else if (data.action === "not_now") await dismiss(data.messageId, data.index);
  else if (data.action === "undo") await undo(data.messageId, data.index);
  else if (data.action === "change") {
    change(userId, item, found.turn.heard.source);
    await dismiss(data.messageId, data.index);
  }
  render(overlayView(data.messageId, getTurn(data.messageId)!.turn, today));
}

async function runWords(userId: string, input: { text?: string; uri?: string }, online: boolean) {
  const snapshot = buildSnapshot(userId);
  if (!snapshot) return render(message("Finish setting up your plan in Zorka first.", "idle", "zorka://onboarding"));
  // Turns saved while offline go first, in order.
  if (online && queuedTurns(userId).length) await flushQueue(snapshot);
  const out = await runTurn(snapshot, input, online);
  render(outcomeView(out, snapshot.today));
}

export async function overlayTask(data: OverlayTaskData): Promise<void> {
  try {
    getDb();
    const userId = useActiveUser.getState().userId;
    if (!userId) return render(message("Open Zorka and pick your profile first.", "idle", "zorka://profiles"));
    const net = await NetInfo.fetch();
    const online = !!net.isConnected && net.isInternetReachable !== false;
    useNetwork.setState({ online });

    if (data.op === "turn") {
      const uri = data.audioPath ? fileUri(data.audioPath) : undefined;
      try {
        await runWords(userId, uri ? { uri } : { text: data.text }, online);
      } finally {
        // The bubble's recording: a queued turn kept its own copy.
        try {
          if (uri) new File(uri).delete();
        } catch {
          // Already gone.
        }
      }
    } else await runAction(userId, data, online);
    if (online) await flush().catch(() => {});
  } catch (e) {
    render(message(e instanceof Error ? `Something went wrong: ${e.message}` : "Something went wrong. Try again.", "shake"));
  }
}
