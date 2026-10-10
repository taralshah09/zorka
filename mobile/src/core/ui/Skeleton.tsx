// Skeleton — brand §8: surface-high blocks shimmering to surface-highest, same radii as real content.
// Variants: line, card, ring. Static with reduced motion.
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View, type DimensionValue } from "react-native";

import { useTheme } from "@/core/theme";

type Props =
  | { variant: "line"; width?: DimensionValue; height?: number }
  | { variant: "card"; height?: number }
  | { variant: "ring"; size?: number };

export function Skeleton(props: Props) {
  const { colors, radius } = useTheme();
  const pulse = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [pulse]);

  const shape =
    props.variant === "line"
      ? { width: props.width ?? "100%", height: props.height ?? 14, borderRadius: radius.xs }
      : props.variant === "card"
        ? { width: "100%" as const, height: props.height ?? 120, borderRadius: radius.lg }
        : { width: props.size ?? 104, height: props.size ?? 104, borderRadius: radius.full };

  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[shape, { backgroundColor: colors.surfaceHigh, overflow: "hidden" }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceHighest, opacity: pulse }]} />
    </View>
  );
}
