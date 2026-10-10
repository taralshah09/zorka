// Chips — brand §8. Filter chip (selected = lilac), choice chip (selected = lime), optional diet marker.
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { DietMarker, type Diet } from "./DietMarker";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** filter → lilac when selected; choice → lime when selected. */
  kind?: "filter" | "choice";
  icon?: IconName;
  diet?: Diet;
  disabled?: boolean;
};

export function Chip({ label, selected = false, onPress, kind = "filter", icon, diet, disabled }: Props) {
  const { colors, radius } = useTheme();
  const selectedBg = kind === "filter" ? colors.secondary : colors.primary;
  const fg = selected ? "ink" : "textSecondary";

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind === "choice" ? "radio" : "checkbox"}
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected, disabled }}
      hitSlop={6}
      style={[
        styles.base,
        {
          borderRadius: radius.full,
          backgroundColor: selected ? selectedBg : colors.surfaceHigh,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {diet ? <DietMarker diet={diet} /> : null}
        {icon ? <Icon name={icon} size={16} color={colors[fg]} filled={selected} /> : null}
        <Text variant="label" color={fg} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 36, paddingHorizontal: 16, justifyContent: "center", alignSelf: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
