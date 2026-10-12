// Logo — brand §2. The mark is the Zorka tiger (core/ui/mascot), drawn live: it breathes, blinks and reacts to taps
// and to app moments (reactMascot). Pass `still` where the mark is captured as an image.
import { StyleSheet, View } from "react-native";

import { fontFamily } from "@/core/theme";
import { Mascot } from "./mascot/Mascot";
import { Text } from "./Text";

export function LogoMark({ size = 32, still = false }: { size?: number; still?: boolean }) {
  // The tiger is wider than tall; it sits centred in a size × size box so layouts keep their square slot.
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <Mascot size={size} still={still} shadow={size >= 64} accessibilityLabel="Zorka" />
    </View>
  );
}

/** "Zorka" — ExtraBold 800, tracking −0.03em, sentence case. */
export function Wordmark({ size = 17 }: { size?: 17 | 28 | 40 }) {
  return (
    <Text
      color="textPrimary"
      style={{ fontFamily: fontFamily[800], fontSize: size, lineHeight: size * 1.2, letterSpacing: -0.03 * size }}
    >
      Zorka
    </Text>
  );
}

/** Header lock-up (S10, S41): mark 32 + wordmark 17/800 + eyebrow sub-label in an accent colour. */
export function LogoLockup({ eyebrow }: { eyebrow?: string }) {
  return (
    <View style={styles.lockup} accessibilityRole="header" accessibilityLabel={eyebrow ? `Zorka, ${eyebrow}` : "Zorka"}>
      <LogoMark size={40} />
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
