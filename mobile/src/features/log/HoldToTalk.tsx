// Hold-to-talk button with a hold-to-arm ring. Pressing starts a ring filling around the button over HOLD_MS; only
// when it's full does the mic start (onArmed, with a light tap). Letting go before that cancels (onCancel) and the
// ring runs back; letting go after it stops the recording (onRelease). Used by meal voice (S13) and "Say a set" (S24).
// The button is a pill or circle (radius.full), so the ring is a stadium drawn just outside it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Rect } from "react-native-svg";

import { haptics } from "@/core/haptics";
import { useTheme } from "@/core/theme";
import { PressableScale } from "@/core/ui";

/** How long the button must be held before the mic starts. */
export const HOLD_MS = 1000;
const STROKE = 4;
/** Space between the button and the ring. */
const GAP = 4;
const INSET = STROKE + GAP;

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function HoldToTalk({
  onArmed,
  onRelease,
  onCancel,
  holdMs = HOLD_MS,
  disabled,
  ringColor,
  style,
  accessibilityLabel,
  accessibilityHint,
  children,
}: {
  onArmed: () => void;
  onRelease: () => void;
  /** Let go before the ring filled: nothing was recorded. */
  onCancel?: () => void;
  /** 0 arms at once (no ring), e.g. when the press only opens the permission sheet. */
  holdMs?: number;
  disabled?: boolean;
  ringColor?: string;
  /** The button's own style (size, colour, radius). */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  accessibilityHint?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const progress = useState(() => new Animated.Value(0))[0];
  const armed = useRef(false);
  const holding = useRef(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Leaving the screen mid-hold must not start the mic.
  useEffect(
    () => () => {
      holding.current = false;
      progress.stopAnimation();
    },
    [progress],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
  };

  const pressIn = () => {
    if (disabled) return;
    holding.current = true;
    armed.current = false;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished || !holding.current) return;
      armed.current = true;
      haptics.tap();
      onArmed();
    });
  };

  const pressOut = () => {
    if (!holding.current) return;
    holding.current = false;
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    if (armed.current) {
      armed.current = false;
      onRelease();
    } else {
      onCancel?.();
    }
  };

  // The ring's rect, centred on the stroke, with fully rounded ends.
  const ring = size
    ? (() => {
        const w = size.w + 2 * INSET - STROKE;
        const h = size.h + 2 * INSET - STROKE;
        const r = h / 2;
        return { w, h, r, length: 2 * (w - 2 * r) + 2 * Math.PI * r };
      })()
    : null;

  return (
    <View style={styles.wrap}>
      {ring && holdMs > 0 ? (
        <Svg
          pointerEvents="none"
          width={ring.w + STROKE}
          height={ring.h + STROKE}
          style={[styles.ring, { left: -INSET, top: -INSET }]}
        >
          <AnimatedRect
            x={STROKE / 2}
            y={STROKE / 2}
            width={ring.w}
            height={ring.h}
            rx={ring.r}
            ry={ring.r}
            fill="none"
            stroke={ringColor ?? colors.primary}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={[ring.length, ring.length]}
            strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [ring.length, 0] })}
            opacity={progress.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] })}
          />
        </Svg>
      ) : null}
      <PressableScale
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        onLayout={onLayout}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={style}
      >
        {children}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { margin: INSET },
  ring: { position: "absolute" },
});
