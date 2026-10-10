// Segmented tabs — brand §8: surface-low pill track, selected segment lime + ink (+ optional icon).
import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Text } from "./Text";

export type Segment<T extends string> = { value: T; label: string; icon?: IconName };

type Props<T extends string> = {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

export function SegmentedControl<T extends string>({ segments, value, onChange, accessibilityLabel }: Props<T>) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { backgroundColor: colors.surfaceLow, borderRadius: radius.full, borderColor: colors.outline },
      ]}
    >
      {segments.map((s) => {
        const selected = s.value === value;
        const fg = selected ? "ink" : "textSecondary";
        return (
          <Pressable
            key={s.value}
            onPress={() => onChange(s.value)}
            accessibilityRole="tab"
            accessibilityLabel={s.label}
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              { borderRadius: radius.full, backgroundColor: selected ? colors.primary : "transparent" },
            ]}
          >
            {s.icon ? <Icon name={s.icon} size={20} color={colors[fg]} filled={selected} /> : null}
            <Text variant="label-lg" color={fg} numberOfLines={1}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 4, gap: 4, borderWidth: 1 },
  segment: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
});
