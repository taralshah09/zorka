// Change coach (S12 Settings and the S44 chat header). The coach is part of the server-owned profile (D23), so the
// change needs the network; on failure a toast says so and nothing changes.
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import type { CoachId } from "@/core/api/types";
import { useTheme } from "@/core/theme";
import { Avatar, BottomSheet, PressableScale, Text, useToast } from "@/core/ui";
import { useActiveUser } from "@/features/users/activeUser";
import { useUpdateProfile } from "@/features/users/api";
import { PERSONA_ORDER, PERSONAS } from "./personas";

export function CoachPickerSheet({
  visible,
  onClose,
  current,
}: {
  visible: boolean;
  onClose: () => void;
  current: CoachId | null;
}) {
  const { colors, radius } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  const update = useUpdateProfile(userId);
  const toast = useToast();
  const pick = (coach: CoachId) => {
    if (coach === current) return onClose();
    update.mutate(
      { coach },
      {
        onSuccess: () => {
          toast({ kind: "success", message: `${PERSONAS[coach].name} is your coach now` });
          onClose();
        },
        onError: (e) => toast({ kind: "error", message: describeError(e).title }),
      },
    );
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Pick your coach" size="medium">
      <View style={styles.list}>
        {PERSONA_ORDER.map((id) => {
          const p = PERSONAS[id];
          const selected = id === current;
          return (
            <PressableScale
              key={id}
              onPress={() => pick(id)}
              disabled={update.isPending}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${p.name}, ${p.vibe}`}
              style={[
                styles.row,
                {
                  borderRadius: radius.lg,
                  borderColor: selected ? colors.primary : colors.outline,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <Avatar name={p.name} accent={p.accent} kind="coach" size={44} />
              <View style={styles.flex}>
                <Text variant="title">{p.name}</Text>
                <Text variant="caption" color="textSecondary" numberOfLines={2}>
                  {`${p.vibe} · "${p.sample}"`}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1.5 },
  flex: { flex: 1 },
});
