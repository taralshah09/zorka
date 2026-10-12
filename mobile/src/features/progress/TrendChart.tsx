// P27 · TrendChart (DESIGN.md §7.2, S33/S38): a vertical bar per weigh-in day, drawn with react-native-svg like the S27
// chart (D40, no new dependency). Days run left to right on a calendar axis, so gaps in weigh-ins show as gaps between
// bars. The latest bar is highlighted.
import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path } from "react-native-svg";

import { useTheme } from "@/core/theme";
import { Text } from "@/core/ui";
import { formatKg, formatShortDate } from "@/features/targets/format";
import { dayNumber, type TrendPoint } from "@shared/domain/progress";

const PAD_TOP = 12;
const PAD_BOTTOM = 8;
const PAD_LEFT = 40;
const MAX_BAR = 16;

/** A bar from the baseline up to `top`, with rounded top corners. */
function barPath(cx: number, top: number, bottom: number, w: number): string {
  const h = bottom - top;
  const r = Math.min(w / 2, 4, h);
  const l = cx - w / 2;
  const rt = cx + w / 2;
  return `M${l},${bottom} L${l},${top + r} Q${l},${top} ${l + r},${top} L${rt - r},${top} Q${rt},${top} ${rt},${top + r} L${rt},${bottom} Z`;
}

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

  const values = points.map((p) => p.scaleKg);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const yMin = lo - span * 0.15;
  const yMax = hi + span * 0.15;
  const d0 = dayNumber(from);
  const d1 = Math.max(d0 + 1, dayNumber(to));

  const plotW = Math.max(1, width - PAD_LEFT - 8);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  // One slot per calendar day; bars sit in the middle of their slot so the first and last stay inside the plot.
  const slot = plotW / (d1 - d0 + 1);
  const barW = Math.max(2, Math.min(MAX_BAR, slot * 0.62));
  const x = (date: string) => PAD_LEFT + slot / 2 + ((dayNumber(date) - d0) / (d1 - d0)) * (plotW - slot);
  const baseline = PAD_TOP + plotH;
  const y = (v: number) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const guides = [yMin + (yMax - yMin) * 0.15, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.15];
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
              <Line x1={PAD_LEFT} x2={width - 8} y1={baseline} y2={baseline} stroke={colors.outline} strokeWidth={1} />
              {points.map((p) => (
                <Path
                  key={p.date}
                  d={barPath(x(p.date), y(p.scaleKg), baseline, barW)}
                  fill={p === last ? colors.primary : colors.textTertiary}
                  opacity={p === last ? 1 : 0.5}
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
