// Orbit rings motif — brand §7.3: 2–3 concentric arcs at 8–12% opacity, clipped top-right.
// Decorative only; never placed behind text that needs reading.
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type Props = { color: string; size?: number; opacity?: number };

export function OrbitRings({ color, size = 220, opacity = 0.1 }: Props) {
  const c = size / 2;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { width: size, height: size, top: -size * 0.45, right: -size * 0.35 }]}
    >
      <Svg width={size} height={size}>
        {[0.95, 0.72, 0.5].map((f) => (
          <Circle
            key={f}
            cx={c}
            cy={c}
            r={c * f - 2}
            stroke={color}
            strokeOpacity={opacity}
            strokeWidth={14}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute" },
});
