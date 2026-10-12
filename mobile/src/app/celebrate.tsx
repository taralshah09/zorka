// S47 · Celebration (P39). No export yet: built from DESIGN.md §6.9 and brand §9 (D65). Variants: streak 7/30/100, PR,
// all goals hit, phase complete. The tiger cheering with the moment's icon as a badge (saffron flame for streaks), a
// soft warm gradient, confetti (skipped when the OS reduces motion), the coach's line, and "Share" (opens S46 with the
// matching card) / "Keep going".
// The success haptic plays once when it opens.
//
// Params: kind = streak | pr | day | phase, value (streak days), id (workout or phase id), detail (PR line).
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { haptics } from "@/core/haptics";
import { SYMBOLS, type IconName } from "@/core/icons/symbols.generated";
import { useTheme } from "@/core/theme";
import { Button, Mascot, Text } from "@/core/ui";
import { celebrationLine, celebrationTitle, type CelebrationKind } from "@/features/celebrate/celebrations";
import { Confetti } from "@/features/celebrate/Confetti";
import { PERSONAS } from "@/features/coach/personas";
import { useProfile } from "@/features/users/api";
import { useActiveUser } from "@/features/users/activeUser";

const ICON: Record<CelebrationKind, IconName> = {
  streak: "local_fire_department",
  pr: "trophy",
  day: "check_circle",
  phase: "flag",
};

const SUB: Record<CelebrationKind, string> = {
  streak: "Logged every single day.",
  pr: "",
  day: "Calories and protein, right on target.",
  phase: "Its summary is saved in Progress.",
};

export default function Celebrate() {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ kind?: CelebrationKind; value?: string; id?: string; detail?: string }>();
  const kind: CelebrationKind = params.kind ?? "day";
  const userId = useActiveUser((s) => s.userId);
  const coach = useProfile(userId).data?.coach ?? null;
  const facts = { value: params.value, detail: params.detail };
  const line = celebrationLine(coach, kind, facts);
  const accent = kind === "streak" ? colors.streak : colors.primary;

  useEffect(() => {
    haptics.success();
  }, []);

  const share = () => {
    const card = kind === "day" ? "day" : kind === "streak" ? "streak" : kind;
    router.replace({ pathname: "/share", params: params.id ? { card, id: params.id } : { card } });
  };

  return (
    <View
      style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}
      accessibilityViewIsModal
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="warm" cx="50%" cy="32%" r="60%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.28} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#warm)" />
      </Svg>
      <Confetti />

      <View style={[styles.body, { paddingHorizontal: layout.screenMargin }]}>
        <View style={styles.hero}>
          <Mascot size={180} playOnMount="cheer" listen={false} />
          <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: accent }]}>
            <Svg width={40} height={40} viewBox="0 -960 960 960" accessibilityElementsHidden>
              <Path d={SYMBOLS[ICON[kind]][1]} fill={accent} />
            </Svg>
          </View>
        </View>
        <Text variant="display" align="center" accessibilityRole="header" tabular>
          {celebrationTitle(kind, facts)}
        </Text>
        {(params.detail ?? SUB[kind]) ? (
          <Text variant="body-lg" color="textSecondary" align="center">
            {params.detail ?? SUB[kind]}
          </Text>
        ) : null}
        {line && coach ? (
          <View style={styles.coach}>
            <Text variant="eyebrow" color="secondaryText" align="center">
              {PERSONAS[coach].name}
            </Text>
            <Text variant="title" align="center">{`“${line}”`}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.actions, { paddingHorizontal: layout.screenMargin }]}>
        <Button label="Share" icon="ios_share" variant="secondary" fullWidth onPress={share} />
        <Button label="Keep going" fullWidth glow onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "space-between" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  coach: { marginTop: 16, gap: 6, maxWidth: 340 },
  hero: { marginBottom: 8 },
  badge: {
    position: "absolute",
    right: -6,
    bottom: 4,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { gap: 12 },
});
