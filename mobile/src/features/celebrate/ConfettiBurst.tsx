// Smaller celebrations than S47: a confetti fountain over whatever screen is showing, for a single goal hit (kcal,
// protein, steps), a finished workout or run, finished onboarding and a done weekly check-in. burstConfetti() can be
// called from anywhere (it survives the navigation that usually follows a save); <ConfettiBurstHost /> in the root
// layout draws it. Pieces launch up from the lower middle and fall back with gravity. Brand §9 colours only, the
// mascot cheers along (reactMascot), and nothing renders when the OS reduces motion.
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
import { create } from "zustand";

import { haptics } from "@/core/haptics";
import { kv } from "@/core/storage/kv";
import { useTheme } from "@/core/theme";
import { reactMascot } from "@/core/ui";

type Size = "small" | "big";
type Burst = { id: number; size: Size };

const useBursts = create<{ bursts: Burst[] }>(() => ({ bursts: [] }));
let seq = 0;

/** Fires a confetti burst (plus a light haptic and a mascot cheer). */
export function burstConfetti(size: Size = "small") {
  useBursts.setState((s) => ({ bursts: [...s.bursts.slice(-2), { id: ++seq, size }] }));
  haptics.success();
  reactMascot(size === "big" ? "cheer" : "happy");
}

const SEEN_KEY = "zorka.bursts";
const KEEP = 80;

/** Bursts once per `key` per profile (remembered on the phone, like S47), so revisiting a screen doesn't replay it. */
export function burstOnce(userId: string | null, key: string, size: Size = "small"): boolean {
  if (!userId) return false;
  const k = `${SEEN_KEY}.${userId}`;
  let done: string[] = [];
  try {
    done = JSON.parse(kv.get(k) ?? "[]") as string[];
  } catch {
    done = [];
  }
  if (done.includes(key)) return false;
  kv.set(k, JSON.stringify([...done, key].slice(-KEEP)));
  burstConfetti(size);
  return true;
}

export function ConfettiBurstHost() {
  const bursts = useBursts((s) => s.bursts);
  const reduced = useReducedMotion();
  if (reduced || !bursts.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      {bursts.map((b) => (
        <BurstLayer key={b.id} id={b.id} size={b.size} />
      ))}
    </View>
  );
}

const DURATION = 1900;

type Piece = {
  vx: number;
  vy: number;
  spin: number;
  w: number;
  h: number;
  delay: number;
  color: string;
  round: boolean;
};

function layout(count: number, width: number, height: number, colors: readonly string[]): Piece[] {
  let seed = 11 + count;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, i) => {
    const angle = (-90 + (r() - 0.5) * 80) * (Math.PI / 180); // mostly straight up, ±40°
    const speed = height * (0.55 + r() * 0.4);
    return {
      vx: Math.cos(angle) * speed * (width / height) * 0.9,
      vy: Math.sin(angle) * speed,
      spin: (r() - 0.5) * 900,
      w: 6 + r() * 6,
      h: 8 + r() * 10,
      delay: r() * 160,
      color: colors[i % colors.length]!,
      round: r() < 0.3,
    };
  });
}

function BurstLayer({ id, size }: { id: number; size: Size }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () => layout(size === "big" ? 56 : 30, width, height, [colors.primary, colors.secondary, colors.tertiary]),
    [size, width, height, colors.primary, colors.secondary, colors.tertiary],
  );
  const origin = { x: width / 2, y: height * 0.62 };
  useEffect(() => {
    const timer = setTimeout(
      () => useBursts.setState((s) => ({ bursts: s.bursts.filter((x) => x.id !== id) })),
      DURATION + 300,
    );
    return () => clearTimeout(timer);
  }, [id]);
  return (
    <View style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <BurstPiece key={i} piece={p} origin={origin} gravity={height * 1.6} />
      ))}
    </View>
  );
}

function BurstPiece({ piece, origin, gravity }: { piece: Piece; origin: { x: number; y: number }; gravity: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(piece.delay, withTiming(1, { duration: DURATION, easing: Easing.linear }));
  }, [t, piece.delay]);
  const style = useAnimatedStyle(() => {
    const s = (t.value * DURATION) / 1000; // seconds
    return {
      opacity: t.value < 0.75 ? 1 : (1 - t.value) / 0.25,
      transform: [
        { translateX: origin.x + piece.vx * s * 0.9 },
        { translateY: origin.y + piece.vy * s + 0.5 * gravity * s * s },
        { rotate: `${piece.spin * s}deg` },
        { scale: t.value < 0.08 ? t.value / 0.08 : 1 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.w,
          height: piece.round ? piece.w : piece.h,
          borderRadius: piece.round ? piece.w / 2 : 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: { position: "absolute", top: 0, left: 0 },
});
