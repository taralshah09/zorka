// Progress ring — brand §8: round caps, track surface-high, fill = data colour.
// Stroke ratio follows S10 (r 46 / stroke 14). Over target: fill turns warn and the overflow
// shows as a dashed arc. Animated 600 ms on first fill, 400 ms on change (§9); no animation with
// reduced motion.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useTheme } from "@/core/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RingSize = "S" | "M" | "L";
const DIAMETER: Record<RingSize, number> = { S: 64, M: 104, L: 168 };
const STROKE_TO_RADIUS = 14 / 46;

type Props = {
  /** 0..n — values above 1 render the over-target state. */
  progress: number;
  color: string;
  size?: RingSize;
  accessibilityLabel: string;
  children?: ReactNode;
};

function overflowDashes(length: number, circumference: number): number[] {
  const dash = 4;
  const gap = 5;
  const n = Math.max(1, Math.floor(length / (dash + gap)));
  return [...Array.from({ length: n }, () => [dash, gap]).flat(), 0, circumference];
}

export function ProgressRing({ progress, color, size = "M", accessibilityLabel, children }: Props) {
  const { colors, motion } = useTheme();
  const d = DIAMETER[size];
  const stroke = Math.round((d / 2) * STROKE_TO_RADIUS);
  const r = (d - stroke) / 2;
  const c = d / 2;
  const circumference = 2 * Math.PI * r;
  const over = progress > 1;
  const clamped = Math.max(0, Math.min(1, progress));

  const anim = useState(() => new Animated.Value(0))[0];
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        anim.setValue(clamped);
      } else {
        Animated.timing(anim, {
          toValue: clamped,
          duration: first.current ? motion.ringFirst : motion.ringChange,
          easing: Easing.bezier(0.2, 0, 0, 1),
          useNativeDriver: false,
        }).start();
      }
      first.current = false;
    });
    return () => {
      cancelled = true;
    };
  }, [clamped, anim, motion.ringFirst, motion.ringChange]);

  const dashOffset = anim.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={{ width: d, height: d }}
    >
      <Svg width={d} height={d} style={styles.rotate}>
        <Circle cx={c} cy={c} r={r} stroke={colors.surfaceHigh} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={c}
          cy={c}
          r={r}
          stroke={over ? colors.warn : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={dashOffset}
          fill="none"
        />
        {over ? (
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={colors.ink}
            strokeOpacity={0.6}
            strokeWidth={Math.max(2, stroke / 3)}
            strokeDasharray={overflowDashes(Math.min(1, progress - 1) * circumference, circumference)}
            fill="none"
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  rotate: { transform: [{ rotate: "-90deg" }] },
  center: { alignItems: "center", justifyContent: "center" },
});
