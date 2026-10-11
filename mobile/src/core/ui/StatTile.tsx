// StatTile — DESIGN.md §7.2: big number + unit + label (S09 plan, later S25 / S30 summaries).
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Text } from "./Text";

type Props = { value: string; unit: string; label: string; color: string };

export function StatTile({ value, unit, label, color }: Props) {
  const { colors, radius, layout } = useTheme();
  return (
    <View
      accessibilityLabel={`${label}: ${value} ${unit}`}
      style={[
        styles.tile,
        {
          backgroundColor: colors.surfaceLow,
          borderColor: colors.outline,
          borderRadius: radius.lg,
          padding: layout.cardPadding,
        },
      ]}
    >
      <View style={styles.labelRow}>
        <View style={[styles.dot, { backgroundColor: color, borderRadius: radius.full }]} />
        <Text variant="eyebrow" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="headline-lg" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="unit" color="textSecondary">
        {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: 4, borderWidth: 1 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8 },
});
