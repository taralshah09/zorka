// Logo — brand §2. The real mark isn't delivered yet (design_ref/assets/logo/ is empty), so
// LogoMark renders a neutral lime "K" tile. Swap this one component when the mark arrives.
// The Stitch placeholder mark must never ship (brand §2).
import { StyleSheet, View } from "react-native";

import { fontFamily, useTheme } from "@/core/theme";
import { Text } from "./Text";

export function LogoMark({ size = 32 }: { size?: 24 | 32 | 64 | 96 }) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityLabel="Kimbo"
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size >= 64 ? radius.lg : radius.sm,
          backgroundColor: colors.primary,
        },
      ]}
    >
      <Text
        color="ink"
        style={{
          fontFamily: fontFamily[800],
          fontSize: size * 0.56,
          lineHeight: size * 0.7,
          letterSpacing: -0.03 * size * 0.56,
        }}
        maxFontSizeMultiplier={1}
      >
        K
      </Text>
    </View>
  );
}

/** "Kimbo" — ExtraBold 800, tracking −0.03em, sentence case. */
export function Wordmark({ size = 17 }: { size?: 17 | 28 | 40 }) {
  return (
    <Text
      color="textPrimary"
      style={{ fontFamily: fontFamily[800], fontSize: size, lineHeight: size * 1.2, letterSpacing: -0.03 * size }}
    >
      Kimbo
    </Text>
  );
}

/** Header lock-up (S10, S41): mark 32 + wordmark 17/800 + eyebrow sub-label in an accent colour. */
export function LogoLockup({ eyebrow }: { eyebrow?: string }) {
  return (
    <View style={styles.lockup} accessibilityRole="header" accessibilityLabel={eyebrow ? `Kimbo, ${eyebrow}` : "Kimbo"}>
      <LogoMark size={32} />
      <View>
        <Wordmark size={17} />
        {eyebrow ? (
          <Text variant="eyebrow" color="primaryText">
            {eyebrow}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: "center", justifyContent: "center" },
  lockup: { flexDirection: "row", alignItems: "center", gap: 10 },
});
