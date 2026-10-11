// P38 · One share card (brand §14): 9:16, always the dark style, orbit motif top-right, eyebrow, a lime hero number +
// unit, 2–3 supporting stats, the route in lilac for runs, and the "Zorka" wordmark small at the bottom left. Laid out
// on a 360 × 640 grid scaled by `width`, so the preview and the 1080 × 1920 capture are the same picture. Text ignores
// the system font scale: the card is an image, and its layout must not reflow.
import { forwardRef, type ForwardedRef } from "react";
import { StyleSheet, Text as RNText, View, type TextStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { fontFamily, tabularNums, ThemeScope, useTheme } from "@/core/theme";
import { OrbitRings } from "@/core/ui";
import type { RoutePoint } from "@shared/domain/activity";
import type { ShareCardSpec } from "./cards";
import { routePath } from "./route";

export const CARD_RATIO = 16 / 9;
/** Output size of a captured card (Instagram/WhatsApp story). */
export const CARD_PX = { width: 1080, height: 1920 } as const;

type Props = { spec: ShareCardSpec; width: number; name?: string | null };

export const ShareCard = forwardRef<View, Props>(function ShareCard(props, ref) {
  return (
    <ThemeScope name="dark">
      <CardBody {...props} innerRef={ref} />
    </ThemeScope>
  );
});

function CardBody({ spec, width, name, innerRef }: Props & { innerRef: ForwardedRef<View> }) {
  const { colors } = useTheme();
  const k = width / 360;
  const t = (size: number, weight: keyof typeof fontFamily, color: string, extra?: TextStyle): TextStyle => ({
    fontFamily: fontFamily[weight],
    fontSize: size * k,
    lineHeight: size * k * 1.18,
    color,
    ...extra,
  });

  return (
    <View
      ref={innerRef}
      collapsable={false}
      accessible
      accessibilityRole="image"
      accessibilityLabel={spec.a11y}
      style={[styles.card, { width, height: width * CARD_RATIO, backgroundColor: colors.bg, padding: 28 * k }]}
    >
      <OrbitRings color={colors.primary} size={300 * k} opacity={0.12} />

      <View style={{ marginTop: 40 * k, gap: 6 * k }}>
        <RNText allowFontScaling={false} style={t(13, 700, colors.primaryText, { letterSpacing: 0.12 * 13 * k })}>
          {spec.eyebrow}
        </RNText>
        {spec.title ? (
          <RNText allowFontScaling={false} numberOfLines={2} style={t(22, 700, colors.textPrimary)}>
            {spec.title}
          </RNText>
        ) : null}
      </View>

      <View style={[styles.heroWrap, { marginTop: 18 * k }]}>
        <RNText
          allowFontScaling={false}
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[t(88, 800, colors.primary, { letterSpacing: -0.03 * 88 * k, lineHeight: 96 * k }), tabularNums]}
        >
          {spec.hero.value}
        </RNText>
        <RNText
          allowFontScaling={false}
          style={t(18, 600, colors.textSecondary, { letterSpacing: 0.04 * 18 * k, textTransform: "uppercase" })}
        >
          {spec.hero.unit}
        </RNText>
      </View>

      <View style={styles.middle}>
        {spec.route?.length ? <RouteLine points={spec.route} width={width - 56 * k} k={k} /> : null}
      </View>

      <View style={[styles.stats, { gap: 14 * k, marginBottom: 32 * k }]}>
        {spec.stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <RNText allowFontScaling={false} numberOfLines={2} style={[t(22, 700, colors.textPrimary), tabularNums]}>
              {s.value}
              {s.unit ? (
                <RNText style={t(12, 600, colors.textSecondary, { textTransform: "uppercase" })}>{` ${s.unit}`}</RNText>
              ) : null}
            </RNText>
            <RNText allowFontScaling={false} style={t(12, 500, colors.textSecondary)}>
              {s.label}
            </RNText>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <View>
          <RNText allowFontScaling={false} style={t(20, 800, colors.textPrimary, { letterSpacing: -0.03 * 20 * k })}>
            Zorka
          </RNText>
          {name ? (
            <RNText allowFontScaling={false} style={t(12, 500, colors.textSecondary)}>
              {name}
            </RNText>
          ) : null}
        </View>
        <RNText allowFontScaling={false} style={t(12, 500, colors.textSecondary)}>
          {spec.date}
        </RNText>
      </View>
    </View>
  );
}

function RouteLine({ points, width, k }: { points: readonly RoutePoint[]; width: number; k: number }) {
  const { colors } = useTheme();
  const height = width * 0.8;
  const r = routePath(points, width, height, 16 * k);
  if (!r) return null;
  return (
    <Svg width={width} height={height}>
      <Path
        d={r.d}
        stroke={colors.dataActivity}
        strokeWidth={6 * k}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={r.start.x} cy={r.start.y} r={7 * k} fill={colors.primary} />
      <Circle cx={r.end.x} cy={r.end.y} r={7 * k} fill={colors.dataActivity} stroke={colors.bg} strokeWidth={3 * k} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden" },
  heroWrap: { gap: 2 },
  middle: { flex: 1, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row" },
  stat: { flex: 1, gap: 2 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
});
