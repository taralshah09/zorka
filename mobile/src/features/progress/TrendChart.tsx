// P27 · TrendChart (DESIGN.md §7.2, S33/S38): faint daily scale dots and the smooth trend line, drawn with
// react-native-svg like the S27 chart (D40, no new dependency). Days run left to right on a calendar axis, so gaps in
// weigh-ins show as gaps between dots while the trend line carries on.
import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { useTheme } from "@/core/theme";
import { Text } from "@/core/ui";
import { formatKg, formatShortDate } from "@/features/targets/format";
import { dayNumber, type TrendPoint } from "@shared/domain/progress";

const PAD_TOP = 12;
const PAD_BOTTOM = 8;
const PAD_LEFT = 40;

export function TrendChart({
  points,
  from,
  to,
  targetKg,
  height = 180,
  accessibilityLabel,
}: {
  /** Weigh-in days inside the range, oldest first. */
  points: readonly TrendPoint[];
  /** The visible range (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Dashed goal line when it falls inside the plotted range. */
  targetKg?: number | null;
  height?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const values = points.flatMap((p) => [p.scaleKg, p.trendKg]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const yMin = lo - span * 0.15;
  const yMax = hi + span * 0.15;
  const d0 = dayNumber(from);
  const d1 = Math.max(d0 + 1, dayNumber(to));

  const plotW = Math.max(1, width - PAD_LEFT - 8);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const x = (date: string) => PAD_LEFT + ((dayNumber(date) - d0) / (d1 - d0)) * plotW;
  const y = (v: number) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const guides = [yMin + (yMax - yMin) * 0.15, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.15];
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.trendKg).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const showTarget = targetKg != null && targetKg >= yMin && targetKg <= yMax;

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
              {showTarget ? (
                <Line
                  x1={PAD_LEFT}
                  x2={width - 8}
                  y1={y(targetKg!)}
                  y2={y(targetKg!)}
                  stroke={colors.secondary}
                  strokeWidth={1.5}
                  strokeDasharray="2 4"
                />
              ) : null}
              {points.map((p) => (
                <Circle key={p.date} cx={x(p.date)} cy={y(p.scaleKg)} r={3} fill={colors.textTertiary} opacity={0.6} />
              ))}
              <Path
                d={line}
                stroke={colors.primary}
                strokeWidth={3}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {last ? (
                <Circle
                  cx={x(last.date)}
                  cy={y(last.trendKg)}
                  r={6}
                  fill={colors.primary}
                  stroke={colors.bg}
                  strokeWidth={2}
                />
              ) : null}
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
                {formatKg(g)}
              </Text>
            ))}
          </>
        ) : null}
      </View>
      <View style={[styles.xAxis, { paddingLeft: PAD_LEFT }]}>
        <Text variant="caption" color="textTertiary">
          {formatShortDate(from)}
        </Text>
        <Text variant="caption" color="textTertiary">
          {formatShortDate(to)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: "absolute", left: 0, width: PAD_LEFT - 6, textAlign: "right" },
  xAxis: { flexDirection: "row", justifyContent: "space-between", paddingRight: 8, marginTop: 4 },
});
