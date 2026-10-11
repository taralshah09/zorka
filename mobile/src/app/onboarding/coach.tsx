// S08 · Pick your coach (step 6 of 7): three swipeable persona cards with page dots. Swipe to
// browse, tap to pick. Coach illustrations aren't delivered yet, so avatars are initials (D19/D27).
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import type { CoachId } from "@/core/api/types";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Avatar, PressableScale, Text } from "@/core/ui";
import { PERSONA_ORDER, PERSONAS } from "@/features/coach/personas";
import { useDraft } from "@/features/onboarding/draft";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";

const GAP = 12;

export default function CoachStep() {
  const { colors, layout, radius } = useTheme();
  const { width } = useWindowDimensions();
  const coach = useDraft((s) => s.coach);
  const update = useDraft((s) => s.update);
  const cardWidth = width - layout.screenMargin * 2;
  const [page, setPage] = useState(Math.max(0, coach ? PERSONA_ORDER.indexOf(coach) : 0));

  return (
    <OnboardingStep
      step={6}
      title="Pick your coach"
      subtitle="Change any time in Settings."
      cta="Continue"
      canContinue={!!coach}
      onNext={() => router.push("/onboarding/plan")}
    >
      <ScrollView
        horizontal
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: page * (cardWidth + GAP), y: 0 }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + GAP)))}
        contentContainerStyle={{ gap: GAP }}
        style={{ marginHorizontal: -layout.screenMargin }}
      >
        <View style={{ width: layout.screenMargin - GAP }} />
        {PERSONA_ORDER.map((id) => (
          <PersonaCard
            key={id}
            id={id}
            width={cardWidth}
            selected={coach === id}
            onPress={() => update({ coach: id })}
          />
        ))}
        <View style={{ width: layout.screenMargin - GAP }} />
      </ScrollView>

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {PERSONA_ORDER.map((id, i) => (
          <View
            key={id}
            style={[
              styles.dot,
              {
                borderRadius: radius.full,
                width: i === page ? 20 : 8,
                backgroundColor: i === page ? colors.primary : colors.surfaceHighest,
              },
            ]}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}

function PersonaCard({
  id,
  width,
  selected,
  onPress,
}: {
  id: CoachId;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, radius, layout, isDark } = useTheme();
  const p = PERSONAS[id];
  const accent = { lime: colors.primary, lilac: colors.secondary, orchid: colors.tertiary }[p.accent];

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${p.name}, ${p.vibe}. Sample: ${p.sample}`}
      accessibilityState={{ selected, checked: selected }}
      style={[
        styles.card,
        {
          width,
          backgroundColor: colors.surfaceLow,
          borderRadius: radius.xl,
          padding: layout.heroPadding,
          borderColor: selected ? colors.primary : colors.outline,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      <View style={styles.head}>
        <Avatar name={p.name} accent={p.accent} kind="coach" size={56} />
        <Icon
          name="check_circle"
          size={28}
          filled
          color={selected ? colors.primaryText : "transparent"}
          accessibilityLabel={selected ? "Selected" : undefined}
        />
      </View>
      <View style={styles.names}>
        <Text variant="headline-md">{p.name}</Text>
        <Text variant="label" color="textSecondary">
          {p.vibe}
        </Text>
      </View>
      <View
        style={[
          styles.bubble,
          {
            borderRadius: radius.md,
            backgroundColor: isDark ? colors.surfaceHigh : colors.coachBubble[p.accent],
            borderLeftColor: isDark ? accent : "transparent",
          },
        ]}
      >
        <Text variant="body-lg">{p.sample}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, minHeight: 280 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  names: { gap: 2 },
  bubble: { padding: 16, borderLeftWidth: 2 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 4 },
  dot: { height: 8 },
});
