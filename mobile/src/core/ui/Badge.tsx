// Badge / pill — brand §8 and §3.5. Variants: accent fill + ink, outline accent, neutral, estimate.
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme, type ColorTokens } from "@/core/theme";
import { Text, type TextColor } from "./Text";

export type BadgeTone = "lime" | "lilac" | "orchid" | "neutral" | "success" | "warning" | "estimate";

type Props = {
  label: string;
  tone?: BadgeTone;
  outline?: boolean;
  icon?: IconName;
};

const FILL: Record<"lime" | "lilac" | "orchid", keyof ColorTokens> = {
  lime: "primary",
  lilac: "secondary",
  orchid: "tertiary",
};
const TEXT: Record<"lime" | "lilac" | "orchid", "primaryText" | "secondaryText" | "tertiaryText"> = {
  lime: "primaryText",
  lilac: "secondaryText",
  orchid: "tertiaryText",
};

export function Badge({ label, tone = "neutral", outline = false, icon }: Props) {
  const { colors, radius } = useTheme();

  let bg: string = colors.surfaceHigh;
  let border: string | undefined;
  let fg: TextColor = "textSecondary";
  let text = label;
  let leading = icon;

  if (tone === "lime" || tone === "lilac" || tone === "orchid") {
    if (outline) {
      bg = "transparent";
      border = colors[FILL[tone]] as string;
      fg = TEXT[tone];
    } else {
      bg = colors[FILL[tone]] as string;
      fg = "ink";
    }
  } else if (tone === "success") {
    bg = colors.primary;
    fg = "ink";
    leading = leading ?? "check_circle";
  } else if (tone === "warning") {
    bg = colors.warnContainer;
    fg = "warn";
    leading = leading ?? "warning";
  } else if (tone === "estimate") {
    text = `≈ ${label}`;
  }

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: bg, borderRadius: radius.full },
        border ? { borderWidth: 1, borderColor: border } : null,
      ]}
    >
      {leading ? <Icon name={leading} size={16} color={colors[fg]} filled /> : null}
      <Text variant="label" color={fg} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
});
