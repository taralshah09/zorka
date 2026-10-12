// State patterns — brand §8, DESIGN.md §7.1 / S50: EmptyState, ErrorState, OfflineBanner.
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Button } from "./Button";
import { Mascot } from "./mascot/Mascot";
import { OrbitRings } from "./OrbitRings";
import { Text } from "./Text";

/** Orbit motif + the tiger with the state's icon as a badge, headline-sm + body, one lime CTA. */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <View
      style={[
        styles.empty,
        {
          backgroundColor: colors.surfaceLow,
          borderRadius: radius.lg,
          borderColor: colors.outline,
          padding: layout.heroPadding,
        },
      ]}
    >
      <OrbitRings color={colors.secondary} opacity={0.12} />
      <View>
        <Mascot size={104} />
        <View
          style={[styles.tile, styles.badge, { backgroundColor: colors.secondary, borderColor: colors.surfaceLow }]}
        >
          <Icon name={icon} size={20} color={colors.ink} />
        </View>
      </View>
      <Text variant="headline-sm" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textSecondary" align="center">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

/** System failures only (network, save failed, AI unavailable) — `error` colour, never for "over target". */
export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
  retrying,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.error,
        { backgroundColor: colors.errorContainer, borderRadius: radius.lg, padding: layout.cardPadding },
      ]}
    >
      <View style={styles.errorRow}>
        <Icon name="error" size={24} color={colors.error} filled />
        <View style={styles.flex}>
          <Text variant="title">{title}</Text>
          {body ? (
            <Text variant="body" color="textSecondary">
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {onRetry ? (
        <Button label="Retry" icon="refresh" variant="ghost" size="sm" loading={retrying} onPress={onRetry} />
      ) : null}
    </View>
  );
}

/** Pill under the header: offline, or syncing N pending items. */
export function OfflineBanner({ mode, pending = 0 }: { mode: "offline" | "syncing"; pending?: number }) {
  const { colors, radius } = useTheme();
  const offline = mode === "offline";
  const label = offline ? "You're offline. Logs will sync" : `Syncing ${pending}`;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={[styles.banner, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}
    >
      <Icon name={offline ? "cloud_off" : "sync"} size={16} color={colors.textSecondary} />
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", gap: 12, overflow: "hidden", borderWidth: 1 },
  tile: { width: 64, height: 64, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  badge: {
    position: "absolute",
    right: -8,
    bottom: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    marginBottom: 0,
  },
  error: { gap: 12 },
  errorRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  flex: { flex: 1, gap: 2 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
