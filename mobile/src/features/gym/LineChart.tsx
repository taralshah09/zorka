// P21 · Progress line chart for S27, drawn with react-native-svg (already installed: no new dependency, D40).
// Three horizontal guide lines with values, the first and last date under the plot, a dot per session and
// the latest point highlighted. Reads as a list for screen readers (summary label on the whole chart).
import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { useTheme } from "@/core/theme";
import { Text } from "@/core/ui";

export type ChartPoint = { at: number; value: number };

const PAD_TOP = 12;
const PAD_BOTTOM = 8;
const PAD_LEFT = 44;

const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function LineChart({
  points,
  height = 180,
  color,
  format,
  accessibilityLabel,
}: {
  points: readonly ChartPoint[];
  height?: number;
  color: string;
  format: (v: number) => string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Some headroom so a flat line sits in the middle rather than on an edge.
  const span = hi - lo || Math.max(1, hi * 0.1);
  const yMin = lo - span * 0.15;
  const yMax = hi + span * 0.15;
  const t0 = points[0]?.at ?? 0;
  const t1 = points[points.length - 1]?.at ?? 1;

  const plotW = Math.max(1, width - PAD_LEFT - 8);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const x = (at: number) => PAD_LEFT + (t1 === t0 ? plotW / 2 : ((at - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const guides = [yMin + (yMax - yMin) * 0.15, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.15];
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View style={{ height }} onLayout={onLayout}>
        {width > 0 && points.length ? (
          <>
            <Svg width={width} height={height}>
              {guides.map((g) => (
                <Line
                  key={g}
                  x1={PAD_LEFT}
                  x2={width - 8}
                  y1={y(g)}
                  y2={y(g)}
                  stroke={colors.outline}
                  strokeWidth={1}
                  strokeDasharray="4 6"
                />
              ))}
              <Path d={d} stroke={color} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) => (
                <Circle
                  key={`${p.at}-${i}`}
                  cx={x(p.at)}
                  cy={y(p.value)}
                  r={p === last ? 6 : 3.5}
                  fill={p === last ? color : colors.bg}
                  stroke={color}
                  strokeWidth={2}
                />
              ))}
            </Svg>
            {guides.map((g) => (
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
      <View style={[styles.xAxis, { paddingLeft: PAD_LEFT }]}>
        <Text variant="caption" color="textTertiary">
          {points.length ? shortDate(t0) : ""}
        </Text>
        <Text variant="caption" color="textTertiary">
          {points.length > 1 ? shortDate(t1) : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: "absolute", left: 0, width: PAD_LEFT - 6, textAlign: "right" },
  xAxis: { flexDirection: "row", justifyContent: "space-between", paddingRight: 8, marginTop: 4 },
});
