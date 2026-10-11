// Selectable card for one-answer questions (S03 goal, S05 activity). Selected: lime border + check.
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { PressableScale, Text } from "@/core/ui";

type Props = {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
};

export function ChoiceCard({ title, body, selected, onPress, icon }: Props) {
  const { colors, radius, layout } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ selected, checked: selected }}
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceLow,
          borderRadius: radius.lg,
          padding: layout.cardPadding,
          borderColor: selected ? colors.primary : colors.outline,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      {icon ? (
        <View
          style={[
            styles.tile,
            { borderRadius: radius.md, backgroundColor: selected ? colors.primary : colors.surfaceHigh },
          ]}
        >
          <Icon name={icon} color={selected ? colors.ink : colors.textPrimary} filled={selected} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="title">{title}</Text>
        <Text variant="body" color="textSecondary">
          {body}
        </Text>
      </View>
      <Icon
        name={selected ? "check_circle" : "chevron_right"}
        color={selected ? colors.primaryText : "transparent"}
        filled={selected}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72 },
  tile: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
});
