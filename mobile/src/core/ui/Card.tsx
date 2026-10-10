// Cards — brand §7.2 and §8. default (surface card), highlighted (hero: lime gradient + orbit motif),
// warning (over target: amber border on warn-container).
import { useId, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/core/theme";
import { OrbitRings } from "./OrbitRings";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

type Props = {
  children: ReactNode;
  variant?: "default" | "raised" | "highlighted" | "warning";
  eyebrow?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Lime glow on the hero card (dark only; at most one per screen). */
  glow?: boolean;
  /** No body padding (edge-to-edge lists); the eyebrow keeps its padding. */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  variant = "default",
  eyebrow,
  onPress,
  accessibilityLabel,
  glow,
  flush = false,
  style,
}: Props) {
  const { colors, radius, elevation, layout, isDark } = useTheme();
  const hero = variant === "highlighted";
  const gradientId = `hero-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const r = hero ? radius.xl : radius.lg;

  const surface: ViewStyle =
    variant === "warning"
      ? { backgroundColor: colors.warnContainer, borderColor: colors.warn, borderWidth: 1.5 }
      : variant === "raised"
        ? { backgroundColor: colors.surface, borderColor: colors.outline, borderWidth: 1 }
        : hero
          ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.surfaceLow, borderColor: colors.outline, borderWidth: 1 };

  const body = (
    <>
      {hero ? (
        <>
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.heroGradient[0]} />
                <Stop offset="0.5" stopColor={colors.heroGradient[1]} />
                <Stop offset="1" stopColor={colors.heroGradient[2]} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />
          </Svg>
          <OrbitRings color={colors.ink} />
        </>
      ) : null}
      {eyebrow ? (
        <Text
          variant="eyebrow"
          color={hero ? "ink" : variant === "warning" ? "warn" : "secondaryText"}
          style={[styles.eyebrow, flush && { paddingHorizontal: layout.cardPadding, paddingTop: layout.cardPadding }]}
        >
          {eyebrow}
        </Text>
      ) : null}
      {children}
    </>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    surface,
    {
      borderRadius: r,
      padding: flush ? 0 : hero ? layout.heroPadding : layout.cardPadding,
      boxShadow: glow && hero && isDark ? elevation.glow : elevation.card,
    },
    style,
  ];

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={containerStyle}
      >
        {body}
      </PressableScale>
    );
  }
  return (
    <View style={containerStyle} accessibilityLabel={accessibilityLabel}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: "hidden" },
  eyebrow: { marginBottom: 8 },
});
