// S49 · Permission explainer (pattern). Shown before the system prompt, on first use only (P16/P17).
// Variants so far: microphone, camera. Denied state offers "Open settings".
import { Linking, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Button, Text } from "@/core/ui";

export type PermissionKind = "microphone" | "camera";

const COPY: Record<PermissionKind, { icon: IconName; title: string; reasons: string[]; privacy: string }> = {
  microphone: {
    icon: "mic",
    title: "Talk to log your meals",
    reasons: ['Say what you ate, like "2 roti and a katori of dal".', "You check every item before anything is saved."],
    privacy: "Kimbo only listens while you hold the button. The voice note goes to an AI service to turn it into text.",
  },
  camera: {
    icon: "photo_camera",
    title: "Snap your plate",
    reasons: ["Take a photo and Kimbo suggests what's on the plate.", "You check every item before anything is saved."],
    privacy: "Your photo stays on your phone. A smaller copy goes to an AI service to read the food.",
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
        {denied ? `${kind === "microphone" ? "Microphone" : "Camera"} is off for Kimbo` : c.title}
      </Text>
      {denied ? (
        <Text variant="body" color="textSecondary" style={styles.center}>
          {`Turn it on in Settings to ${kind === "microphone" ? "log by voice" : "log with a photo"}. You can always type or search instead.`}
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
