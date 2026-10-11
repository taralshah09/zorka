// Number stepper — DESIGN.md §7.1: default, min/max reached.
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
};

export function NumberStepper({ label, value, onChange, min, max, step = 1, unit, format = String }: Props) {
  const { colors, radius } = useTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, +v.toFixed(2)));
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${format(value)}${unit ? ` ${unit}` : ""}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === "increment" ? step : -step)))}
      style={[
        styles.row,
        { backgroundColor: colors.surfaceLow, borderRadius: radius.full, borderColor: colors.outline },
      ]}
    >
      <IconButton
        icon="remove"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => onChange(clamp(value - step))}
      />
      <Text variant="headline-md" tabular style={styles.valueText}>
        {format(value)}
        {unit ? (
          <Text variant="unit" color="textSecondary">
            {"  "}
            {unit}
          </Text>
        ) : null}
      </Text>
      <IconButton
        icon="add"
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPress={() => onChange(clamp(value + step))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 6, borderWidth: 1, alignSelf: "flex-start", gap: 8 },
  valueText: { minWidth: 96, textAlign: "center" },
});
