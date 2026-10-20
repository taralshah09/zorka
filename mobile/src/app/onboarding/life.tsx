// LA1 · "Your life" (docs/LIFE_PLAN.md, after activity): where meals come from, the budget, a typical day and sessions a
// week, so plans fit the person's life. Every answer has Skip; nothing here is required to continue.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Chip, Text, Toggle } from "@/core/ui";
import { ChoiceCard } from "@/features/onboarding/ChoiceCard";
import { useDraft } from "@/features/onboarding/draft";
import { nextStep, stepHref } from "@/features/onboarding/flow";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";
import { BUDGET_OPTIONS, MEAL_SOURCE_OPTIONS, WORK_PATTERN_OPTIONS } from "@/features/life/standing";
import { DEFAULT_BRIEF_PROMPT_MINUTE } from "@shared/domain/nudges";

const SESSIONS = [0, 1, 2, 3, 4, 5, 6];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="eyebrow" color="textSecondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function LifeStep() {
  const d = useDraft();
  const update = d.update;

  return (
    <OnboardingStep
      id="life"
      title="What's your life like?"
      subtitle="So plans fit your day. Skip anything you'd rather not say."
      cta="Continue"
      canContinue
      onNext={() => router.push(stepHref(nextStep("life", d.goal)))}
    >
      <Section title="Where do most meals come from?">
        {MEAL_SOURCE_OPTIONS.map((o) => (
          <ChoiceCard
            key={o.value}
            title={o.title}
            body={o.body}
            selected={d.mealSource === o.value}
            onPress={() =>
              update({
                mealSource: d.mealSource === o.value ? null : o.value,
                // A mess means no kitchen of your own, unless the user says otherwise below.
                hasKitchen: d.hasKitchen ?? (o.value === "mess" ? false : o.value === "home_self" ? true : null),
              })
            }
          />
        ))}
        <View style={styles.chips}>
          <Chip label="Skip" selected={d.mealSource === null} onPress={() => update({ mealSource: null })} />
        </View>
      </Section>

      <Section title="Can you cook where you stay?">
        <View style={styles.chips}>
          <Chip label="Yes" selected={d.hasKitchen === true} onPress={() => update({ hasKitchen: true })} />
          <Chip label="No" selected={d.hasKitchen === false} onPress={() => update({ hasKitchen: false })} />
          <Chip label="Skip" selected={d.hasKitchen === null} onPress={() => update({ hasKitchen: null })} />
        </View>
      </Section>

      <Section title="Food budget">
        <View style={styles.chips}>
          {BUDGET_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.title} selected={d.budget === o.value} onPress={() => update({ budget: d.budget === o.value ? null : o.value })} />
          ))}
          <Chip label="Skip" selected={d.budget === null} onPress={() => update({ budget: null })} />
        </View>
        {d.budget ? (
          <Text variant="caption" color="textSecondary">
            {BUDGET_OPTIONS.find((o) => o.value === d.budget)!.body}
          </Text>
        ) : null}
      </Section>

      <Section title="A typical day">
        <View style={styles.chips}>
          {WORK_PATTERN_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.title}
              selected={d.workPattern === o.value}
              onPress={() => update({ workPattern: d.workPattern === o.value ? null : o.value })}
            />
          ))}
          <Chip label="Skip" selected={d.workPattern === null} onPress={() => update({ workPattern: null })} />
        </View>
      </Section>

      <Section title="Workouts a week">
        <View style={styles.chips}>
          {SESSIONS.map((n) => (
            <Chip key={n} label={String(n)} selected={d.sessionsPerWeek === n} onPress={() => update({ sessionsPerWeek: n })} />
          ))}
          <Chip label="Learn it from my logs" selected={d.sessionsPerWeek === null} onPress={() => update({ sessionsPerWeek: null })} />
        </View>
      </Section>

      <Section title="Evening check">
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="title">Ask me about tomorrow at 9 pm</Text>
            <Text variant="caption" color="textSecondary">
              {"Say what's coming up and Zorka plans around it."}
            </Text>
          </View>
          <Toggle
            value={d.briefPromptMinute != null}
            onValueChange={(on: boolean) => update({ briefPromptMinute: on ? DEFAULT_BRIEF_PROMPT_MINUTE : null })}
            accessibilityLabel="Ask me about tomorrow at 9 pm"
          />
        </View>
      </Section>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
});
