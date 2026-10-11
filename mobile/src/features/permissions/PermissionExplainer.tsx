// S49 · Permission explainer (pattern). Shown before the system prompt, on first use only (P16/P17).
// Variants: microphone, camera, gym (microphone for sets, P22), nearby (location, P34), notifications (P36).
// Denied state offers "Open settings".
import { Linking, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Button, Text } from "@/core/ui";

export type PermissionKind = "microphone" | "camera" | "gym" | "nearby" | "notifications";

type Copy = {
  icon: IconName;
  title: string;
  reasons: string[];
  privacy: string;
  deniedTitle: string;
  deniedBody: string;
};

const VOICE_DENIED = "Microphone is off for Kimbo";

const COPY: Record<PermissionKind, Copy> = {
  microphone: {
    icon: "mic",
    title: "Talk to log your meals",
    reasons: ['Say what you ate, like "2 roti and a katori of dal".', "You check every item before anything is saved."],
    privacy: "Kimbo only listens while you hold the button. The voice note goes to an AI service to turn it into text.",
    deniedTitle: VOICE_DENIED,
    deniedBody: "Turn it on in Settings to log by voice. You can always type or search instead.",
  },
  gym: {
    icon: "mic",
    title: "Say your sets",
    reasons: [
      'Between sets, say "bench 80 kilos, 8 reps".',
      "The set lands in your workout and the rest timer starts.",
    ],
    privacy: "Kimbo only listens while you hold the button. The voice note goes to an AI service to turn it into text.",
    deniedTitle: VOICE_DENIED,
    deniedBody: "Turn it on in Settings to log by voice. You can always type your sets instead.",
  },
  camera: {
    icon: "photo_camera",
    title: "Snap your plate",
    reasons: ["Take a photo and Kimbo suggests what's on the plate.", "You check every item before anything is saved."],
    privacy: "Your photo stays on your phone. A smaller copy goes to an AI service to read the food.",
    deniedTitle: "Camera is off for Kimbo",
    deniedBody: "Turn it on in Settings to log with a photo. You can always type or search instead.",
  },
  nearby: {
    icon: "location_on",
    title: "Find options near you",
    reasons: [
      "See high-protein dishes on Zomato and Blinkit around you.",
      "Kimbo only checks your area when you open this screen.",
    ],
    privacy:
      "Your exact location stays on your phone. Only your area's name is used to search. Kimbo never tracks you.",
    deniedTitle: "Location is off for Kimbo",
    deniedBody: "Turn it on in Settings, or enter your pincode instead.",
  },
  notifications: {
    icon: "notifications",
    title: "Let your coach nudge you",
    reasons: [
      "A morning plan, a protein reminder, and a heads-up before your streak slips.",
      "4 a day at most, never in your quiet hours.",
    ],
    privacy: "Nudges are planned on your phone. You choose which ones you get in Settings.",
    deniedTitle: "Notifications are off for Kimbo",
    deniedBody: "Turn them on in Settings to get nudges from your coach.",
  },
};

export function PermissionExplainer({
  kind,
  denied,
  onContinue,
  onNotNow,
}: {
  kind: PermissionKind;
  /** The system won't ask again: send the user to Settings instead. */
  denied: boolean;
  onContinue: () => void;
  onNotNow: () => void;
}) {
  const { colors, radius } = useTheme();
  const c = COPY[kind];
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: colors.secondary, borderRadius: radius.xl }]}>
        <Icon name={c.icon} size={28} color={colors.ink} filled />
      </View>
      <Text variant="headline-md" accessibilityRole="header" style={styles.center}>
        {denied ? c.deniedTitle : c.title}
      </Text>
      {denied ? (
        <Text variant="body" color="textSecondary" style={styles.center}>
          {c.deniedBody}
        </Text>
      ) : (
        <View style={styles.reasons}>
          {c.reasons.map((r) => (
            <View key={r} style={styles.reason}>
              <Icon name="check_circle" size={20} color={colors.primaryText} />
              <Text variant="body" style={styles.flex}>
                {r}
              </Text>
            </View>
          ))}
          <Text variant="caption" color="textSecondary">
            {c.privacy}
          </Text>
        </View>
      )}
      <View style={styles.actions}>
        {denied ? (
          <Button label="Open settings" onPress={() => Linking.openSettings()} fullWidth />
        ) : (
          <Button label="Continue" onPress={onContinue} fullWidth />
        )}
        <Button label="Not now" variant="ghost" onPress={onNotNow} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 16, paddingVertical: 24 },
  icon: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  reasons: { gap: 12, alignSelf: "stretch" },
  reason: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  flex: { flex: 1 },
  actions: { alignSelf: "stretch", gap: 8, marginTop: 8 },
});
