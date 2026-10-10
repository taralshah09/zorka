import { Text as RNText, type TextProps, type TextStyle } from "react-native";

import { MAX_FONT_SCALE, tabularNums, useTheme, type ColorTokens, type TypeVariant } from "@/core/theme";

export type TextColor = keyof Pick<
  ColorTokens,
  | "textPrimary"
  | "textSecondary"
  | "textTertiary"
  | "ink"
  | "primaryText"
  | "secondaryText"
  | "tertiaryText"
  | "streak"
  | "warn"
  | "error"
>;

type Props = TextProps & {
  variant?: TypeVariant;
  color?: TextColor;
  /** Tabular figures for live numbers (brand §4.1). */
  tabular?: boolean;
  align?: TextStyle["textAlign"];
};

export function Text({
  variant = "body",
  color = "textPrimary",
  tabular = false,
  align,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}: Props) {
  const theme = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        theme.type[variant],
        { color: theme.colors[color] },
        tabular && tabularNums,
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}

/** Brand §4.3 — big number + small uppercase unit, baseline-aligned with a 6 px gap. */
export function NumberUnit({
  value,
  unit,
  approx = false,
  variant = "display",
  color = "textPrimary",
  unitColor = "textSecondary",
}: {
  value: string;
  unit: string;
  approx?: boolean;
  variant?: Extract<TypeVariant, "display-xl" | "display" | "headline-lg" | "headline-md" | "title">;
  color?: TextColor;
  unitColor?: TextColor;
}) {
  return (
    <Text variant={variant} color={color} tabular accessibilityLabel={`${approx ? "about " : ""}${value} ${unit}`}>
      {approx ? (
        <Text variant="unit" color={unitColor}>
          {"≈ "}
        </Text>
      ) : null}
      {value}
      <Text variant="unit" color={unitColor}>
        {"  "}
        {unit}
      </Text>
    </Text>
  );
}
