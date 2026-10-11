// CoachLine — brand §8 coach card: surface card, 44 px coach avatar, eyebrow `COACH · <PERSONA>` in the
// accent's text colour, quote in body-lg. Used on S09 and S10 (real lines arrive with P35/P37).
import { StyleSheet, View } from "react-native";

import type { CoachId } from "@/core/api/types";
import { useTheme } from "@/core/theme";
import { Avatar, Text, type TextColor } from "@/core/ui";
import { PERSONAS } from "./personas";

const ACCENT_TEXT: Record<"lime" | "lilac" | "orchid", TextColor> = {
  lime: "primaryText",
  lilac: "secondaryText",
  orchid: "tertiaryText",
};

export function CoachLine({ coach, line, muted = false }: { coach: CoachId; line: string; muted?: boolean }) {
  const { colors, radius, layout } = useTheme();
  const persona = PERSONAS[coach];
  return (
    <View
      accessibilityLabel={`${persona.name}: ${line}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.outline,
          borderRadius: radius.lg,
          padding: layout.cardPadding,
        },
      ]}
    >
      <Avatar name={persona.name} accent={persona.accent} kind="coach" size={44} />
      <View style={styles.text}>
        <Text variant="eyebrow" color={ACCENT_TEXT[persona.accent]}>
          {`Coach · ${persona.name}`}
        </Text>
        <Text variant="body-lg" color={muted ? "textSecondary" : "textPrimary"}>
          {line}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 12, alignItems: "flex-start", borderWidth: 1 },
  text: { flex: 1, gap: 4 },
});
