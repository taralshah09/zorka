// Date strip — brand §8: 7 days in a surface-low pill track, selected day a lime circle with ink text,
// today marked with a dot. P10 shell: shows this week with today selected; changing day comes with
// the day's logs (P12+).
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Text } from "@/core/ui";
import { weekdayInitial } from "@/features/targets/format";

function weekOf(today: Date): Date[] {
  const mondayOffset = (today.getDay() + 6) % 7;
  return Array.from(
    { length: 7 },
    (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset + i),
  );
}

export function DateStrip({ today }: { today: Date }) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityLabel="This week, today selected"
      style={[
        styles.track,
        { backgroundColor: colors.surfaceLow, borderColor: colors.outline, borderRadius: radius.full },
      ]}
    >
      {weekOf(today).map((d) => {
        const selected = d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
        return (
          <View
            key={d.toISOString()}
            style={[
              styles.day,
              { borderRadius: radius.full, backgroundColor: selected ? colors.primary : "transparent" },
            ]}
          >
            <Text variant="caption" color={selected ? "ink" : "textSecondary"}>
              {weekdayInitial(d)}
            </Text>
            <Text variant="label" color={selected ? "ink" : "textPrimary"} tabular>
              {String(d.getDate())}
            </Text>
            {selected ? (
              <View style={[styles.dot, { backgroundColor: colors.ink, borderRadius: radius.full }]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", justifyContent: "space-between", padding: 6, borderWidth: 1 },
  day: { width: 40, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 2 },
  dot: { width: 4, height: 4 },
});
