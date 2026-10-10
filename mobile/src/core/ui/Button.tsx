// Buttons — brand §8. Always pills. Primary = lime, secondary = lilac, ghost, destructive ghost.
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Lime glow (dark only). At most one per screen — brand §7.3. */
  glow?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
};

const HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 56 };

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  glow = false,
  fullWidth = false,
  accessibilityHint,
}: Props) {
  const { colors, radius, elevation, isDark } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.primary, pressed: colors.primaryShade, fg: "ink", border: undefined },
    secondary: { bg: colors.secondary, pressed: colors.secondary, fg: "ink", border: undefined },
    ghost: { bg: colors.surfaceHigh, pressed: colors.surfaceHighest, fg: "textPrimary", border: colors.outlineSoft },
    destructive: { bg: colors.surfaceHigh, pressed: colors.surfaceHighest, fg: "error", border: colors.outlineSoft },
  } as const;
  const p = disabled
    ? { bg: colors.surfaceHigh, pressed: colors.surfaceHigh, fg: "textTertiary" as const, border: undefined }
    : palette[variant];
  const fgColor = colors[p.fg];

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      // Small buttons keep a 48 dp touch target.
      hitSlop={size === "sm" ? 4 : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: HEIGHT[size],
          borderRadius: radius.full,
          backgroundColor: pressed ? p.pressed : p.bg,
          paddingHorizontal: size === "sm" ? 16 : 24,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        p.border ? { borderWidth: 1, borderColor: p.border } : null,
        glow && isDark && variant === "primary" && !disabled ? { boxShadow: elevation.glow } : null,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fgColor} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={20} color={fgColor} /> : null}
            <Text variant="label-lg" color={p.fg} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { justifyContent: "center", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
