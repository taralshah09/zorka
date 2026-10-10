// List item — DESIGN.md §7.1: with icon, with value, with chevron, with toggle.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Text } from "./Text";

type Props = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  value?: string;
  chevron?: boolean;
  /** Trailing control, e.g. <Toggle />. */
  trailing?: ReactNode;
  onPress?: () => void;
  divider?: boolean;
};

export function ListItem({ title, subtitle, icon, value, chevron, trailing, onPress, divider }: Props) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(", ")}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.surfaceHigh },
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outline },
      ]}
    >
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}>
          <Icon name={icon} size={20} color={colors.textPrimary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="title">{title}</Text>
        {subtitle ? (
          <Text variant="body" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" color="textSecondary" tabular>
          {value}
        </Text>
      ) : null}
      {trailing}
      {chevron ? <Icon name="chevron_right" size={20} color={colors.textSecondary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  iconWrap: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
});
