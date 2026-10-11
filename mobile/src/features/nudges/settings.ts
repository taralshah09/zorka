// P36 · Nudge settings and permission (D61). Settings are per profile on the phone (kv), never synced.
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { create } from "zustand";

import { kv, KV_KEYS } from "@/core/storage/kv";
import { DEFAULT_NUDGE_SETTINGS, type NudgeSettings } from "@shared/domain/nudges";
import { Notifications } from "./notifications";

export const NUDGE_CHANNEL = "nudges";

export type StoredNudgeSettings = NudgeSettings & {
  /** Home's "Turn on nudges" card was dismissed. */ promptDismissed: boolean;
};

const key = (userId: string) => `${KV_KEYS.nudgeSettings}.${userId}`;

export function nudgeSettings(userId: string | null): StoredNudgeSettings {
  const base = { ...DEFAULT_NUDGE_SETTINGS, promptDismissed: false };
  if (!userId) return base;
  try {
    const raw = kv.get(key(userId));
    if (!raw) return base;
    const s = JSON.parse(raw) as Partial<StoredNudgeSettings>;
    return { ...base, ...s, kinds: { ...base.kinds, ...s.kinds } };
  } catch {
    return base;
  }
}

export const useNudgeSettingsVersion = create<{ v: number }>(() => ({ v: 0 }));
/** Asks the planner to re-plan (settings saved, permission just granted). */
export const bumpNudges = () => useNudgeSettingsVersion.setState((x) => ({ v: x.v + 1 }));

export function saveNudgeSettings(userId: string, s: StoredNudgeSettings) {
  kv.set(key(userId), JSON.stringify(s));
  bumpNudges();
}

export function useNudgeSettings(userId: string | null) {
  useNudgeSettingsVersion((s) => s.v);
  return nudgeSettings(userId);
}

// ── Permission ───────────────────────────────────────────────────────────────────────────────────

export type NotifAccess = "granted" | "ask" | "denied" | "unsupported";

/** Android 13+ only shows the permission prompt once a channel exists, so the channel is made first. */
export async function ensureChannel() {
  if (Platform.OS !== "android" || !Notifications) return;
  await Notifications.setNotificationChannelAsync(NUDGE_CHANNEL, {
    name: "Coach nudges",
    description: "Morning plan, protein reminder, workout reminder and streak check from your coach.",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function notifAccess(): Promise<NotifAccess> {
  // No native module (web, or a dev client built before P36): treated like a device without notifications.
  if (!Notifications) return "unsupported";
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "ask" : "denied";
  } catch {
    return "unsupported";
  }
}

export async function requestNotifAccess(): Promise<NotifAccess> {
  if (!Notifications) return "unsupported";
  try {
    await ensureChannel();
    const p = await Notifications.requestPermissionsAsync();
    if (p.granted) bumpNudges();
    return p.granted ? "granted" : p.canAskAgain ? "ask" : "denied";
  } catch {
    return "unsupported";
  }
}

/** The current permission, re-checked whenever the app comes back (the user may have changed it in Settings). */
export function useNotifAccess() {
  const [access, setAccess] = useState<NotifAccess | null>(null);
  const refresh = useCallback(async () => setAccess(await notifAccess()), []);
  useEffect(() => {
    void notifAccess().then(setAccess);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void notifAccess().then(setAccess);
    });
    return () => sub.remove();
  }, []);
  return { access, setAccess, refresh };
}
