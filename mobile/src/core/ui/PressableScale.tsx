// Press feedback — brand §9: scale 0.97 over 120 ms, ease-out.
import { useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/core/theme";

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  /** Layout style for the outer Pressable (e.g. `flex: 1` in a row) — `style` only reaches the inner view. */
  containerStyle?: StyleProp<ViewStyle>;
};

export function PressableScale({ style, containerStyle, onPressIn, onPressOut, disabled, children, ...rest }: Props) {
  const { motion } = useTheme();
  const scale = useState(() => new Animated.Value(1))[0];

  const to = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: motion.press.duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      disabled={disabled}
      style={containerStyle}
      onPressIn={(e) => {
        if (!disabled) to(motion.press.scale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
      {...rest}
    >
      {(state) => (
        <Animated.View style={[typeof style === "function" ? style(state) : style, { transform: [{ scale }] }]}>
          {typeof children === "function" ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
