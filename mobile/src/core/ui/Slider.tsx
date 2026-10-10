// Stepped slider — DESIGN.md §7.1: 3–5 stops (e.g. S07 pace Gentle / Steady / Ambitious).
// Tap a stop to select it; no gesture library needed for a handful of discrete stops.
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Text } from "./Text";

type Props<T extends string> = {
  label: string;
  stops: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function Slider<T extends string>({ label, stops, value, onChange }: Props<T>) {
  const { colors, radius } = useTheme();
  const index = Math.max(
    0,
    stops.findIndex((s) => s.value === value),
  );
  const pct = stops.length > 1 ? (index / (stops.length - 1)) * 100 : 0;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: stops[index]?.label }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const next = index + (e.nativeEvent.actionName === "increment" ? 1 : -1);
        const stop = stops[Math.min(stops.length - 1, Math.max(0, next))];
        if (stop) onChange(stop.value);
      }}
      style={styles.wrap}
    >
      <View style={styles.trackArea}>
        <View style={[styles.track, { backgroundColor: colors.surfaceHigh, borderRadius: radius.xs }]}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.primary, borderRadius: radius.xs }]} />
        </View>
        <View style={styles.stops}>
          {stops.map((s, i) => (
            <Pressable
              key={s.value}
              onPress={() => onChange(s.value)}
              hitSlop={12}
              accessibilityLabel={s.label}
              style={[
                styles.dot,
                {
                  borderRadius: radius.full,
                  backgroundColor: i <= index ? colors.primary : colors.surfaceHighest,
                  borderColor: i === index ? colors.ink : "transparent",
                },
              ]}
            />
          ))}
        </View>
      </View>
      <View style={styles.labels}>
        {stops.map((s, i) => (
          <Text key={s.value} variant="label" color={i === index ? "textPrimary" : "textSecondary"}>
            {s.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const DOT = 24;
const styles = StyleSheet.create({
  wrap: { gap: 8 },
  trackArea: { height: 48, justifyContent: "center" },
  track: { height: 8, marginHorizontal: DOT / 2 },
  fill: { height: 8 },
  stops: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dot: { width: DOT, height: DOT, borderWidth: 3 },
  labels: { flexDirection: "row", justifyContent: "space-between" },
});
