// S00 · Splash — brand moment while data loads: the tiger (breathing, blinking) + wordmark on `bg` (DESIGN.md §6.1).
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Mascot, Wordmark } from "@/core/ui";

export function SplashView() {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} accessibilityLabel="Zorka is loading">
      <Mascot size={150} playOnMount="wiggle" interactive={false} />
      <Wordmark size={40} />
      <ActivityIndicator color={colors.textSecondary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  spinner: { position: "absolute", bottom: 96 },
});
