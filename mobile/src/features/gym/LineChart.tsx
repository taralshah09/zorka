// P21 · Progress line chart for S27, drawn with react-native-svg (already installed: no new dependency, D40).
// Guide lines sit on round values (40, 45, 50 kg, not 41.3), and `minSpan` keeps a small change from filling the
// whole height (a 2.5 kg step on a 50 kg bench shouldn't look like a cliff). A dot per session; `highlight` points
// (personal records) are filled and larger. Tap or drag across the plot to read a point; otherwise the line above
// the plot describes the latest one. Dates: first, middle and last. Reads as one summary for screen readers.
import { useState } from "react";
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { useTheme } from "@/core/theme";
import { Text } from "@/core/ui";

export type ChartPoint = { at: number; value: number; highlight?: boolean };

const PAD_TOP = 12;
const PAD_BOTTOM = 8;
const PAD_LEFT = 48;
const PAD_RIGHT = 10;

const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** A round step (1, 2, 2.5 or 5 × 10ⁿ) that splits `span` into about `count` parts. */
function niceStep(span: number, count: number): number {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

/** The y range (on round values) and its ticks, for data between lo and hi. */
export function chartScale(lo: number, hi: number, minSpan = 0, floor: number | null = 0) {
  // A little headroom so the highest and lowest dots don't sit on the frame.
  const span = Math.max(hi - lo, minSpan, Math.abs(hi) * 0.02, 1e-6) * 1.2;
  // Centre the data in the span, but never below `floor` (weights, reps and volume can't go negative).
  let min = (lo + hi) / 2 - span / 2;
  if (floor !== null && min < floor) min = floor;
  let max = min + span;
  const step = niceStep(span, 3);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  if (max - min < step * 2) max = min + step * 2;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}

export function LineChart({
  points,
  height = 180,
  color,
  highlightColor,
  format,
  describe,
  minSpan,
  accessibilityLabel,
}: {
  points: readonly ChartPoint[];
  height?: number;
  color: string;
  /** Fill for `highlight` points (default: `color`). */
  highlightColor?: string;
  format: (v: number) => string;
  /** The line shown for the selected (or latest) point; default "12 Sep · 52.5 kg". */
  describe?: (p: ChartPoint, index: number) => string;
  /** The smallest value range the y-axis shows. */
  minSpan?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const values = points.map((p) => p.value);
  const { min: yMin, max: yMax, ticks } = chartScale(Math.min(...values), Math.max(...values), minSpan);
  const t0 = points[0]?.at ?? 0;
  const t1 = points[points.length - 1]?.at ?? 1;

  const plotW = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const x = (at: number) => PAD_LEFT + (t1 === t0 ? plotW / 2 : ((at - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const lastIndex = points.length - 1;
  const shown = selected !== null && selected <= lastIndex ? selected : lastIndex;
  const shownPoint = points[shown];
  const fill = highlightColor ?? color;
  const describeAt = describe ?? ((p: ChartPoint) => `${shortDate(p.at)} · ${format(p.value)}`);

  const pick = (e: GestureResponderEvent) => {
    const px = e.nativeEvent.locationX;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.at) - px) < Math.abs(x(points[best]!.at) - px)) best = i;
    });
    setSelected(best);
  };

  const mid = points.length > 2 ? points[Math.floor(lastIndex / 2)] : undefined;

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      {shownPoint ? (
        <View style={styles.readout}>
          <Text variant="label" tabular numberOfLines={1} style={styles.flex}>
            {describeAt(shownPoint, shown)}
          </Text>
          <Text variant="caption" color="textTertiary">
            {selected === null ? "Latest · tap the chart" : shown === lastIndex ? "Latest" : ""}
          </Text>
        </View>
      ) : null}
      <View
        style={{ height }}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
      >
        {width > 0 && points.length ? (
          <>
            <Svg width={width} height={height}>
              {ticks.map((g) => (
                <Line
                  key={g}
                  x1={PAD_LEFT}
                  x2={width - PAD_RIGHT}
                  y1={y(g)}
                  y2={y(g)}
                  stroke={colors.outline}
                  strokeWidth={1}
                  strokeDasharray="4 6"
                />
              ))}
              {shownPoint && selected !== null ? (
                <Line
                  x1={x(shownPoint.at)}
                  x2={x(shownPoint.at)}
                  y1={PAD_TOP}
                  y2={height - PAD_BOTTOM}
                  stroke={colors.textTertiary}
                  strokeWidth={1}
                />
              ) : null}
              <Path d={d} stroke={color} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) => (
                <Circle
                  key={`${p.at}-${i}`}
                  cx={x(p.at)}
                  cy={y(p.value)}
                  r={i === shown ? 6.5 : p.highlight ? 5 : 3.5}
                  fill={p.highlight ? fill : i === shown ? color : colors.bg}
                  stroke={p.highlight ? fill : color}
                  strokeWidth={2}
                />
              ))}
            </Svg>
            {ticks.map((g) => (
              <Text
                key={g}
                variant="caption"
                color="textTertiary"
                tabular
                style={[styles.yLabel, { top: y(g) - 8 }]}
                numberOfLines={1}
              >
                {format(g)}
              </Text>
            ))}
          </>
        ) : null}
      </View>
      <View style={[styles.xAxis, { paddingLeft: PAD_LEFT, paddingRight: PAD_RIGHT }]}>
        <Text variant="caption" color="textTertiary">
          {points.length ? shortDate(t0) : ""}
        </Text>
        <Text variant="caption" color="textTertiary">
          {mid ? shortDate(mid.at) : ""}
        </Text>
        <Text variant="caption" color="textTertiary">
          {points.length > 1 ? shortDate(t1) : ""}
        </Text>
      </View>
      {points.some((p) => p.highlight) ? (
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: fill }]} />
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
  readout: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, minHeight: 20 },
  yLabel: { position: "absolute", left: 0, width: PAD_LEFT - 6, textAlign: "right" },
  xAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});
