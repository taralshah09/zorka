// SyncStatusPill (DESIGN.md §7.2, P07) — sits in the header. Hidden when everything is synced.
// Offline: cloud_off + pending count. Syncing: sync + count. Failed: error icon (system failure).
import { Pressable, StyleSheet } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { Text } from "@/core/ui";
import { retryFailedNow, useSyncStatus } from "./engine";

export function SyncStatusPill() {
  const { colors, radius } = useTheme();
  const online = useNetwork((s) => s.online);
  const pending = useSyncStatus((s) => s.pending);
  const failed = useSyncStatus((s) => s.failed);

  // Nothing waiting: hidden. (Offline with nothing pending is covered by the offline banner.)
  if (!pending && !failed) return null;

  const state = failed ? "failed" : !online ? "offline" : "syncing";
  const label =
    state === "failed" ? `${failed} not synced` : state === "offline" ? `${pending} waiting` : `Syncing ${pending}`;
  const a11y =
    state === "failed"
      ? `${failed} items couldn't sync. Tap to retry.`
      : state === "offline"
        ? `Offline. ${pending} items will sync when you're back online.`
        : `Syncing ${pending} items`;

  return (
    <Pressable
      onPress={state === "failed" ? retryFailedNow : undefined}
      disabled={state !== "failed"}
      accessibilityRole={state === "failed" ? "button" : "text"}
      accessibilityLabel={a11y}
      hitSlop={8}
      style={[
        styles.pill,
        { backgroundColor: state === "failed" ? colors.errorContainer : colors.surfaceHigh, borderRadius: radius.full },
      ]}
    >
      <Icon
        name={state === "failed" ? "error" : state === "offline" ? "cloud_off" : "sync"}
        size={16}
        color={state === "failed" ? colors.error : colors.textSecondary}
        filled={state === "failed"}
      />
      <Text variant="label" color={state === "failed" ? "error" : "textSecondary"} tabular>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10 },
});
