// Avatar — DESIGN.md §7.1: profile (2 px lime ring) and coach (accent ring, brand §3.6).
// Illustrated avatars are still to be drawn (DESIGN.md §9), so this renders initials on an accent
// tile. No photos, ever (brand §10).
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Text } from "./Text";

export type Accent = "lime" | "lilac" | "orchid";

type Props = {
  name: string;
  accent?: Accent;
  size?: 32 | 40 | 44 | 56;
  /** Profile avatars get a lime ring; coach avatars get their accent ring. */
  kind?: "profile" | "coach";
};

export function Avatar({ name, accent = "lilac", size = 40, kind = "profile" }: Props) {
  const { colors, radius } = useTheme();
  const fill = { lime: colors.primary, lilac: colors.secondary, orchid: colors.tertiary }[accent];
  const ring = kind === "profile" ? colors.primary : fill;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View
      accessibilityLabel={name}
      style={[styles.ring, { width: size, height: size, borderRadius: radius.full, borderColor: ring }]}
    >
      <View style={[styles.inner, { borderRadius: radius.full, backgroundColor: fill }]}>
        <Text variant={size >= 44 ? "title" : "label"} color="ink">
          {initials}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, padding: 2 },
  inner: { flex: 1, alignItems: "center", justifyContent: "center" },
});
