// AB7 · Today's "done for you" line (docs/ASSISTANT_BAR_PLAN.md "Today 'done for you' line"): what Zorka did today, in
// one sentence at the top of Home. Fed by the thread's receipts (doneForYou.ts); tapping it opens the thread.
import { router } from "expo-router";
import { useMemo } from "react";
import { StyleSheet } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { PressableScale, Text } from "@/core/ui";
import { doneForYouLine } from "@/features/assistant/doneForYou";
import { turnsOn } from "@/features/assistant/thread";
import { useChatVersion } from "@/features/coach/chat";

export function DoneForYou({ userId, today }: { userId: string; today: string }) {
  const { colors, radius } = useTheme();
  const v = useChatVersion((s) => s.v);
  const line = useMemo(() => {
    void v;
    return doneForYouLine(turnsOn(userId, today), today);
  }, [userId, today, v]);
  if (!line) return null;
  return (
    <PressableScale
      onPress={() => router.navigate("/(tabs)/coach")}
      accessibilityRole="button"
      accessibilityLabel={`${line} Opens the Zorka thread.`}
      style={[styles.row, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}
    >
      <Icon name="auto_awesome" size={16} color={colors.secondaryText} />
      <Text variant="caption" color="textSecondary" style={styles.flex}>
        {line}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  flex: { flex: 1 },
});
