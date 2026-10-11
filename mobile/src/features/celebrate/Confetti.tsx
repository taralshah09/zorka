// P39 · Confetti for the big moments (brand §9: lime / lilac / orchid, only on celebrations). Built on Reanimated,
// which is already installed, so no Lottie. One burst of falling pieces, then it stops. Renders nothing when the OS
// "remove animations" setting is on.
import { useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/core/theme";

const PIECES = 42;
const FALL_MS = 2600;

type Piece = { x: number; drift: number; delay: number; spin: number; w: number; h: number; color: string };

/** Fixed pseudo-random layout, so a re-render doesn't reshuffle pieces mid-fall. */
function layoutPieces(width: number, colors: readonly string[]): Piece[] {
  let seed = 7;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: PIECES }, (_, i) => ({
    x: r() * width,
    drift: (r() - 0.5) * 120,
    delay: r() * 500,
    spin: (r() - 0.5) * 720,
    w: 6 + r() * 6,
    h: 10 + r() * 8,
    color: colors[i % colors.length]!,
  }));
}

export function Confetti() {
  const reduced = useReducedMotion();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () => layoutPieces(width, [colors.primary, colors.secondary, colors.tertiary]),
    [width, colors.primary, colors.secondary, colors.tertiary],
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} fall={height + 40} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, fall }: { piece: Piece; fall: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(piece.delay, withTiming(1, { duration: FALL_MS, easing: Easing.in(Easing.quad) }));
  }, [t, piece.delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.85 ? 1 : (1 - t.value) / 0.15,
    transform: [
      { translateX: piece.x + piece.drift * t.value },
      { translateY: -40 + fall * t.value },
      { rotate: `${piece.spin * t.value}deg` },
    ],
  }));
  return (
    <Animated.View style={[styles.piece, { width: piece.w, height: piece.h, backgroundColor: piece.color }, style]} />
  );
}

const styles = StyleSheet.create({
  piece: { position: "absolute", top: 0, left: 0 },
});
