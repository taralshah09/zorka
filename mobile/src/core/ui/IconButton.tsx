// Icon button — brand §5 icon containers: 40 px circle on surface-high, ≥ 48 dp touch target.
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

type Props = {
  icon: IconName;
  /** Required: icon-only controls always carry a label (brand §12). */
  accessibilityLabel: string;
  onPress?: () => void;
  /** Press-and-hold repeat (NumberStepper). */
  onPressIn?: () => void;
  onPressOut?: () => void;
  variant?: "default" | "filled";
  badge?: number;
  disabled?: boolean;
};

const SIZE = 40;

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  onPressIn,
  onPressOut,
  variant = "default",
  badge,
  disabled,
}: Props) {
  const { colors, radius } = useTheme();
  const filled = variant === "filled";
  return (
    <PressableScale
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${accessibilityLabel}, ${badge} new` : accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: radius.full,
          backgroundColor: filled ? colors.primary : pressed ? colors.surfaceHighest : colors.surfaceHigh,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Icon name={icon} size={20} color={filled ? colors.ink : colors.textPrimary} filled={filled} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.secondary, borderRadius: radius.full }]}>
          <Text variant="caption" color="ink" tabular>
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
