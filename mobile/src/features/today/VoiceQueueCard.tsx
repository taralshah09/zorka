// P16 · Voice notes recorded offline, shown on Today until they're read (S13 "saved, we'll process it").
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { Button, Card, Text } from "@/core/ui";
import { MEAL_LABEL } from "@/features/food/format";
import { removeVoice, type VoiceNote } from "@/features/log/voiceQueue";

export function VoiceQueueCard({ notes }: { notes: readonly VoiceNote[] }) {
  const { colors } = useTheme();
  const online = useNetwork((s) => s.online);
  const next = notes[0];
  if (!next) return null;
  const time = new Date(next.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return (
    <Card>
      <View style={styles.row}>
        <Icon name={online ? "mic" : "cloud_off"} color={colors.secondaryText} />
        <View style={styles.flex}>
          <Text variant="title">
            {notes.length === 1 ? `Voice note from ${time}` : `${notes.length} voice notes waiting`}
          </Text>
          <Text variant="caption" color="textSecondary">
            {online
              ? `${MEAL_LABEL[next.mealType]} · ready to read and check`
              : "We'll read it when you're back online."}
          </Text>
        </View>
      </View>
      {online ? (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button
              label="Read it now"
              size="sm"
              icon="auto_awesome"
              onPress={() => router.push({ pathname: "/log/voice", params: { queued: next.id } })}
              fullWidth
            />
          </View>
          <Button label="Discard" size="sm" variant="ghost" onPress={() => removeVoice(next)} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
});
