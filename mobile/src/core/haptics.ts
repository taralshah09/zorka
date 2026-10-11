// Haptics — brand §9: a light tap on save, a success pattern on a PR or milestone, none on navigation.
// Fire-and-forget: a phone without a vibrator (or an emulator) just stays quiet. expo-haptics is loaded lazily, like
// Health Connect, so a dev build made before it was added still runs (no haptics) instead of failing to start.
type HapticsModule = typeof import("expo-haptics");

let loaded: Promise<HapticsModule | null> | null = null;
const load = () => (loaded ??= import("expo-haptics").catch(() => null));

export const haptics = {
  tap() {
    void load().then((h) => h?.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {}));
  },
  success() {
    void load().then((h) => h?.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {}));
  },
};
