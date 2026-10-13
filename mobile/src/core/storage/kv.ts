// Small on-device preferences (theme, active user). Backed by expo-sqlite's key-value store,
// so reads at startup are synchronous and there's no theme flash.
import Storage from "expo-sqlite/kv-store";

export const kv = {
  get(key: string): string | null {
    try {
      return Storage.getItemSync(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    Storage.setItemSync(key, value);
  },
  remove(key: string): void {
    Storage.removeItemSync(key);
  },
};

export const KV_KEYS = {
  theme: "zorka.theme",
  activeUserId: "zorka.activeUserId",
  /** Per profile: `${key}.${userId}`. */
  pincode: "zorka.pincode",
  nudgeSettings: "zorka.nudges",
  nudgeLog: "zorka.nudgeLog",
  welcomeBackSeen: "zorka.welcomeBackSeen",
  pendingOrder: "zorka.pendingOrder",
  usualMeals: "zorka.usualMeals",
  /** UX O4: onboarding answers so far, so an app kill doesn't lose them. */
  onboardingDraft: "zorka.onboardingDraft",
  /** UX O4: a profile save made offline, keyed by user id, sent when the network is back. Not per-profile suffixed. */
  pendingProfile: "zorka.pendingProfile",
  /** UX T1: "Start without it" was picked on the screen-off ask. Per phone (the permission is too). */
  screenOffDeclined: "zorka.screenOffDeclined",
} as const;
