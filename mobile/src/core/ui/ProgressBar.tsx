// Progress bar — brand §8: 8 h, radius-xs, track surface-high. Over-state turns warn.
// MacroBar: P · C · F segments (orchid · lime · lilac) with 2 px gaps — order is always P·C·F (§3.3).
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";

type Props = { progress: number; color: string; accessibilityLabel: string; track?: string };

export function ProgressBar({ progress, color, accessibilityLabel, track }: Props) {
  const { colors, radius } = useTheme();
  const over = progress > 1;
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={[styles.track, { backgroundColor: track ?? colors.surfaceHigh, borderRadius: radius.xs }]}
    >
      <View
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: radius.xs,
          backgroundColor: over ? colors.warn : color,
        }}
      />
    </View>
  );
}

type MacroProps = { protein: number; carbs: number; fat: number; accessibilityLabel: string };

/** Values are grams or kcal shares; widths are proportional. */
export function MacroBar({ protein, carbs, fat, accessibilityLabel }: MacroProps) {
  const { colors, radius } = useTheme();
  const total = protein + carbs + fat;
  const parts = [
    { key: "p", value: protein, color: colors.dataProtein },
    { key: "c", value: carbs, color: colors.dataCarbs },
    { key: "f", value: fat, color: colors.dataFat },
  ];
  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.track, styles.macro, { borderRadius: radius.xs }]}>
      {total === 0 ? (
        <View style={[styles.fill, { backgroundColor: colors.surfaceHigh, borderRadius: radius.xs }]} />
      ) : (
        parts
          .filter((p) => p.value > 0)
          .map((p) => <View key={p.key} style={{ flex: p.value, backgroundColor: p.color, borderRadius: radius.xs }} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, overflow: "hidden", width: "100%" },
  macro: { flexDirection: "row", gap: 2 },
  fill: { flex: 1 },
});
