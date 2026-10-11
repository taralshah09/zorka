// S06 · Diet preference (step 4 of 7): Veg · Eggetarian · Jain · Non-veg chips with markers.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Chip, Text } from "@/core/ui";
import { DIET_OPTIONS } from "@/features/onboarding/copy";
import { useDraft } from "@/features/onboarding/draft";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";

export default function DietStep() {
  const diet = useDraft((s) => s.diet);
  const update = useDraft((s) => s.update);

  return (
    <OnboardingStep
      step={4}
      title="How do you eat?"
      subtitle="Food suggestions will match this."
      cta="Continue"
      canContinue={!!diet}
      onNext={() => router.push("/onboarding/target")}
    >
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Diet preference">
        {DIET_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            kind="choice"
            label={o.label}
            diet={o.value}
            selected={diet === o.value}
            onPress={() => update({ diet: o.value })}
          />
        ))}
      </View>
      <Text variant="caption" color="textSecondary">
        You can switch any time.
      </Text>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
