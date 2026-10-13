// S03 · Goal (step 1). States: none selected, one selected.
import { router } from "expo-router";

import { ChoiceCard } from "@/features/onboarding/ChoiceCard";
import { GOAL_OPTIONS } from "@/features/onboarding/copy";
import { useDraft } from "@/features/onboarding/draft";
import { nextStep, stepHref } from "@/features/onboarding/flow";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";

export default function GoalStep() {
  const goal = useDraft((s) => s.goal);
  const update = useDraft((s) => s.update);

  return (
    <OnboardingStep
      id="goal"
      title="What's your main goal?"
      cta="Continue"
      canContinue={!!goal}
      onNext={() => router.push(stepHref(nextStep("goal", goal)))}
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
