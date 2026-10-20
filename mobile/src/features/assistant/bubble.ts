// AB4 · Turning the Zorka bubble on and off (docs/ASSISTANT_BAR_PLAN.md, D89). The bubble needs three things from
// Android: the microphone, notifications (its service shows one while it's on) and "Display over other apps", which
// only the system's own settings page can grant. Turning it on asks for each in turn; when the user comes back from the
// overlay page with it granted, the bubble starts by itself. Android only: elsewhere `available` is false.
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import { Notifications } from "@/features/nudges/notifications";
import { ZorkaOverlay } from "../../../modules/zorka-overlay";

export type BubbleState = { available: boolean; enabled: boolean; running: boolean; canDraw: boolean; mic: boolean };

const OFF: BubbleState = { available: false, enabled: false, running: false, canDraw: false, mic: false };

async function read(): Promise<BubbleState> {
  const m = ZorkaOverlay;
  if (!m) return OFF;
  const mic = (await getRecordingPermissionsAsync().catch(() => null))?.granted ?? false;
  return { available: true, enabled: m.isEnabled(), running: m.isRunning(), canDraw: m.canDrawOverlays(), mic };
}

/** Starts the bubble at app launch (and after the overlay page) when the user turned it on and Android allows it. */
export function startBubbleIfEnabled() {
  const m = ZorkaOverlay;
  if (m?.isEnabled() && m.canDrawOverlays() && !m.isRunning()) m.start();
}

export type EnableResult = "on" | "needs_overlay" | "mic_denied" | "unavailable";

export async function enableBubble(): Promise<EnableResult> {
  const m = ZorkaOverlay;
  if (!m) return "unavailable";
  const mic = await requestRecordingPermissionsAsync().catch(() => null);
  if (!mic?.granted) return "mic_denied";
  // The bubble's own notification; it still runs if this is refused (Android just hides the notification).
  await Notifications?.requestPermissionsAsync().catch(() => null);
  m.setEnabled(true);
  if (!m.canDrawOverlays()) {
    m.openOverlaySettings();
    return "needs_overlay";
  }
  m.start();
  return "on";
}

export function disableBubble() {
  ZorkaOverlay?.setEnabled(false);
  ZorkaOverlay?.stop();
}

/** The bubble's state, re-read whenever Zorka comes back to the front (e.g. from Android's overlay page). */
export function useBubble(): BubbleState & { refresh: () => void } {
  const [state, setState] = useState<BubbleState>(OFF);
  const refresh = useCallback(() => {
    startBubbleIfEnabled();
    void read().then(setState);
  }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return { ...state, refresh };
}
