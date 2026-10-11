// S03 · Goal (step 1 of 7). States: none selected, one selected.
import { router } from "expo-router";

import { ChoiceCard } from "@/features/onboarding/ChoiceCard";
import { GOAL_OPTIONS } from "@/features/onboarding/copy";
import { useDraft } from "@/features/onboarding/draft";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";

export default function GoalStep() {
  const goal = useDraft((s) => s.goal);
  const update = useDraft((s) => s.update);

  return (
    <OnboardingStep
      step={1}
      title="What's your main goal?"
      cta="Continue"
      canContinue={!!goal}
      onNext={() => router.push("/onboarding/basics")}
    >
      {GOAL_OPTIONS.map((o) => (
        <ChoiceCard
          key={o.value}
          icon={o.icon}
          title={o.title}
          body={o.body}
          selected={goal === o.value}
          onPress={() => update({ goal: o.value })}
        />
      ))}
    </OnboardingStep>
  );
}
