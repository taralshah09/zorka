// Input — brand §8: surface-lowest fill, 1 px outline, radius-md. Focus: 1.5 px lime (+ glow in dark).
// Error: error border + message. Out-of-range: warn border + message. Optional unit suffix.
import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { MAX_FONT_SCALE, useTheme } from "@/core/theme";
import { Text } from "./Text";

type Props = Omit<TextInputProps, "style" | "editable"> & {
  label: string;
  unit?: string;
  error?: string;
  /** Out-of-range warning (amber), e.g. S04 basics. */
  warning?: string;
  disabled?: boolean;
};

export function TextField({ label, unit, error, warning, disabled, onFocus, onBlur, ...rest }: Props) {
  const { colors, radius, type, elevation, isDark } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.error : warning ? colors.warn : focused ? colors.primary : colors.outline;
  const borderWidth = error || warning || focused ? 1.5 : 1;
  const message = error ?? warning;

  return (
    <View style={styles.wrap}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surfaceLowest,
            borderRadius: radius.md,
            borderColor,
            borderWidth,
            opacity: disabled ? 0.5 : 1,
          },
          focused && isDark && !error && !warning ? { boxShadow: elevation.glow } : null,
        ]}
      >
        <TextInput
          editable={!disabled}
          accessibilityLabel={label}
          accessibilityHint={message}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, type["body-lg"], { color: colors.textPrimary }]}
          {...rest}
        />
        {unit ? (
          <Text variant="unit" color="textSecondary">
            {unit}
          </Text>
        ) : null}
      </View>
      {message ? (
        <Text variant="caption" color={error ? "error" : "warn"} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8 },
  input: { flex: 1, paddingVertical: 12 },
});
