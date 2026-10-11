// S05 · Activity level (step 3 of 7): five rows with a plain-language example each.
import { router } from "expo-router";

import { ChoiceCard } from "@/features/onboarding/ChoiceCard";
import { ACTIVITY_OPTIONS } from "@/features/onboarding/copy";
import { useDraft } from "@/features/onboarding/draft";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";

export default function ActivityStep() {
  const level = useDraft((s) => s.activityLevel);
  const update = useDraft((s) => s.update);

  return (
    <OnboardingStep
      step={3}
      title="How active is a normal day?"
      subtitle="Count your job and your workouts."
      cta="Continue"
      canContinue={!!level}
      onNext={() => router.push("/onboarding/diet")}
    >
      {ACTIVITY_OPTIONS.map((o) => (
        <ChoiceCard
          key={o.value}
          title={o.title}
          body={o.body}
          selected={level === o.value}
          onPress={() => update({ activityLevel: o.value })}
        />
      ))}
    </OnboardingStep>
  );
}
