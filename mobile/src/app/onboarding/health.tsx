import { router } from "expo-router";
import { useState } from "react";
import { Text } from "@/core/ui";
import { HealthConnectSettings } from "@/features/activity/HealthConnectSettings";
import type { HealthState } from "@/features/activity/health";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";

export default function HealthStep() {
  const [status, setStatus] = useState<HealthState>("loading");
  const [busy, setBusy] = useState(false);
  return (
    <OnboardingStep
      step={7}
      title="Connect your steps"
      subtitle="Optional. Let Health Connect fill your daily steps ring."
      cta={status === "ready" ? "Continue" : "Skip for now"}
      canContinue={!busy}
      onNext={() => router.push("/onboarding/plan")}
    >
      <HealthConnectSettings showStepsLink={false} onStatusChange={setStatus} onBusyChange={setBusy} />
      <Text variant="caption" color="textSecondary">
        You can connect later in Settings → Health & activity. Skipping does not change your plan.
      </Text>
    </OnboardingStep>
  );
}
