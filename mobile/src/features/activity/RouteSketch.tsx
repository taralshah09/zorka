import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "@/core/theme";
import { Text } from "@/core/ui";
import type { RoutePoint } from "@shared/domain/activity";
import { routeBounds } from "@shared/domain/activityMap";
// A north-up route projection with no network tiles or API key. Disconnected segments stay disconnected.
export function RouteSketch({ points }: { points: readonly RoutePoint[] }) {
  const { colors, radius } = useTheme();
  const midLat = points.length ? points.reduce((s, p) => s + p.latitude, 0) / points.length : 0;
  const bounds = routeBounds(points);
  const origin = bounds ? (bounds[0] + bounds[2]) / 2 : 0;
  const projected = points.map((p) => ({
    x: (origin + ((((p.longitude - origin + 180) % 360) + 360) % 360) - 180) * Math.cos((midLat * Math.PI) / 180),
    y: -p.latitude,
    segment: p.segment,
    timestamp: p.timestamp,
  }));
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  projected.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const span = Math.max(maxX - minX, maxY - minY, 0.0003);
  const xy = projected.map((p) => ({
    x: 150 + ((p.x - (minX + maxX) / 2) / span) * 200,
    y: 130 + ((p.y - (minY + maxY) / 2) / span) * 200,
    segment: p.segment,
    timestamp: p.timestamp,
  }));
  const path = xy
    .map(
      (p, i) =>
        `${i === 0 || p.segment !== xy[i - 1]!.segment || p.timestamp - xy[i - 1]!.timestamp > 30000 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`,
    )
    .join(" ");
  return (
    <View style={[styles.map, { backgroundColor: colors.surfaceHigh, borderRadius: radius.lg }]}>
      <Text variant="caption" color="textSecondary">
        N ↑ · GPS route
      </Text>
      {points.length ? (
        <Svg
          width="100%"
          height={240}
          viewBox="0 0 300 260"
          accessible
          accessibilityLabel="Recorded route, north up. Breaks show pauses or lost GPS."
        >
          <Path
            d={path}
            stroke={colors.dataActivity}
            strokeWidth={4}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Circle cx={xy[0]!.x} cy={xy[0]!.y} r={6} fill={colors.primary} stroke={colors.ink} strokeWidth={2} />
          <Circle
            cx={xy.at(-1)!.x}
            cy={xy.at(-1)!.y}
            r={6}
            fill={colors.dataActivity}
            stroke={colors.ink}
            strokeWidth={2}
          />
        </Svg>
      ) : (
        <View style={styles.mapEmpty}>
          <Text variant="body" color="textSecondary">
            Your route appears when GPS is ready.
          </Text>
        </View>
      )}
      <Text variant="caption" color="textSecondary">
        Start: lime · Latest point: lilac. Breaks show pauses or lost GPS.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  map: { padding: 12, gap: 8 },
  mapEmpty: { minHeight: 180, alignItems: "center", justifyContent: "center" },
});
