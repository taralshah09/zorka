// Dialog — DESIGN.md §7.1: confirm, destructive. Destructive uses a ghost button with error text,
// never a filled red button (brand §8).
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Button } from "./Button";
import { Text } from "./Text";

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function Dialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  const { colors, radius, elevation } = useTheme();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel={cancelLabel} />
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceLow,
              borderRadius: radius.lg,
              borderColor: colors.outline,
              boxShadow: elevation.floating,
            },
          ]}
        >
          <Text variant="headline-sm" accessibilityRole="header">
            {title}
          </Text>
          {body ? (
            <Text variant="body" color="textSecondary">
              {body}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="ghost" size="sm" onPress={onCancel} />
            <Button
              label={confirmLabel}
              variant={destructive ? "destructive" : "primary"}
              size="sm"
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", padding: 24 },
  card: { padding: 20, gap: 12, borderWidth: 1 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
});
