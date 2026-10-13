// S27 · Session bars: one vertical bar per workout day, height from zero (so 50 vs 52.5 kg looks like the small
// step it is), the value written on top ("52.5" over "× 7"), the day underneath. Record days are filled in the
// highlight colour, the rest are muted. Scrolls sideways when there are many sessions and opens on the latest.
// Tap a bar to read it in the line above.
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Text } from "@/core/ui";

export type Bar = {
  at: number;
  value: number;
  /** On top of the bar, e.g. "52.5". */
  label: string;
  /** Under the label, e.g. "× 7". */
  sub?: string;
  /** A record day. */
  highlight?: boolean;
};

const PLOT_H = 150;
const BAR_W = 30;
const GAP = 14;

const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function BarChart({
  bars,
  color,
  highlightColor,
  describe,
  accessibilityLabel,
}: {
  bars: readonly Bar[];
  color: string;
  highlightColor: string;
  /** The line shown for the tapped (or latest) bar. */
  describe: (bar: Bar, index: number) => string;
  accessibilityLabel: string;
}) {
  const { colors, radius } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  const top = Math.max(...bars.map((b) => b.value), 0) || 1;
  const last = bars.length - 1;
  const shown = selected !== null && selected <= last ? selected : last;

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      {bars[shown] ? (
        <View style={styles.readout}>
          <Text variant="label" tabular numberOfLines={1} style={styles.flex}>
            {describe(bars[shown], shown)}
          </Text>
          <Text variant="caption" color="textTertiary">
            {selected === null ? "Latest · tap a bar" : shown === last ? "Latest" : ""}
          </Text>
        </View>
      ) : null}
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={styles.row}
      >
        {bars.map((b, i) => {
          const h = Math.max(4, (b.value / top) * PLOT_H);
          const active = i === shown;
          return (
            <Pressable
              key={`${b.at}-${i}`}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              accessibilityLabel={describe(b, i)}
              style={styles.col}
            >
              <Text variant="caption" tabular color={b.highlight ? "textPrimary" : "textSecondary"} numberOfLines={1}>
                {b.label}
              </Text>
              {b.sub ? (
                <Text variant="caption" tabular color="textTertiary" numberOfLines={1}>
                  {b.sub}
                </Text>
              ) : null}
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    borderTopLeftRadius: radius.sm,
                    borderTopRightRadius: radius.sm,
                    backgroundColor: b.highlight ? highlightColor : color,
                    opacity: b.highlight || active ? 1 : 0.45,
                    borderWidth: active ? 2 : 0,
                    borderColor: colors.textPrimary,
                  },
                ]}
              />
              <Text variant="caption" color={active ? "textPrimary" : "textTertiary"} numberOfLines={1}>
                {shortDate(b.at)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {bars.some((b) => b.highlight) ? (
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: highlightColor }]} />
          <Text variant="caption" color="textSecondary">
            Personal record
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  readout: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, minHeight: 20 },
  row: { alignItems: "flex-end", gap: GAP, paddingHorizontal: 4 },
  col: { alignItems: "center", justifyContent: "flex-end", minWidth: BAR_W + 14, gap: 2 },
  bar: { width: BAR_W, marginTop: 4 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});
