// Toggle — on (lime), off, disabled. Pill track, 48 dp touch target.
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";

import { useTheme } from "@/core/theme";

type Props = {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
};

const TRACK_W = 52;
const TRACK_H = 32;
const KNOB = 24;
const PAD = 4;

export function Toggle({ value, onValueChange, disabled, accessibilityLabel }: Props) {
  const { colors, radius, motion } = useTheme();
  const x = useState(() => new Animated.Value(value ? 1 : 0))[0];

  useEffect(() => {
    Animated.timing(x, {
      toValue: value ? 1 : 0,
      duration: motion.press.duration * 1.5,
      useNativeDriver: true,
    }).start();
  }, [value, x, motion.press.duration]);

  return (
    <Pressable
      onPress={() => onValueChange?.(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
      style={[
        styles.track,
        {
          borderRadius: radius.full,
          backgroundColor: value ? colors.primary : colors.surfaceHighest,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.knob,
          {
            borderRadius: radius.full,
            backgroundColor: value ? colors.ink : colors.textSecondary,
            transform: [
              { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_W - KNOB - PAD * 2] }) },
            ],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: TRACK_W, height: TRACK_H, padding: PAD, justifyContent: "center" },
  knob: { width: KNOB, height: KNOB },
});
