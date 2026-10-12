// S09 · Your plan (step 8 of 8): kcal · protein · steps, the projection, a "How we got this"
// disclosure for geeks, the daily step goal (D48), a line from the chosen coach and "Start today",
// which saves the profile.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Card, StatTile, Text, useToast } from "@/core/ui";
import { CoachLine } from "@/features/coach/CoachLine";
import { PERSONAS } from "@/features/coach/personas";
import { ACTIVITY_LABEL, PACE_LABEL } from "@/features/onboarding/copy";
import { draftTargetInput, useDraft } from "@/features/onboarding/draft";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";
import { formatInt, formatKg, formatShortDate, formatThousands, formatWeeklyKg } from "@/features/targets/format";
import { StepGoalField } from "@/features/targets/StepGoalField";
import { useActiveUser } from "@/features/users/activeUser";
import { useUpdateProfile } from "@/features/users/api";
import {
  calculateTargets,
  FAT_SHARE_OF_KCAL,
  goalHasPace,
  PROTEIN_G_PER_KG,
  type Goal,
  type Pace,
  type Targets,
} from "@shared/domain/targets";

export default function PlanStep() {
  const { colors } = useTheme();
  const draft = useDraft();
  const userId = useActiveUser((s) => s.userId);
  const save = useUpdateProfile(userId);
  const toast = useToast();
  // False while the typed step goal is invalid; the draft keeps the last valid one.
  const [stepGoalValid, setStepGoalValid] = useState(true);

  const input = draftTargetInput(draft);
  if (!input || !draft.coach || !draft.diet) {
    // Reached without finishing the earlier steps (e.g. after a reload): start again.
    return (
      <OnboardingStep
        step={8}
        title="Your plan"
        cta="Start again"
        canContinue
        onNext={() => router.replace("/onboarding")}
      >
        <Text variant="body" color="textSecondary">
          {"Some answers are missing. Let's go through the steps again."}
        </Text>
      </OnboardingStep>
    );
  }

  const targets = calculateTargets(input);
  const hasPace = goalHasPace(input.goal);

  const start = () => {
    save.mutate(
      {
        goal: input.goal,
        age: input.age,
        sex: input.sex,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        activityLevel: input.activityLevel,
        diet: draft.diet,
        targetWeightKg: hasPace ? (input.targetWeightKg ?? null) : null,
        pace: hasPace ? (input.pace ?? null) : null,
        coach: draft.coach,
        stepGoal: draft.stepGoal,
        waterGoalGlasses: draft.waterGoalGlasses,
        onboardedAt: new Date().toISOString(),
      },
      {
        onSuccess: () => router.dismissTo("/today"),
        onError: (err) => toast({ kind: "error", message: describeError(err).body }),
      },
    );
  };

  return (
    <OnboardingStep
      step={8}
      title="Your plan"
      subtitle="Your daily targets. They adjust each week as you log."
      cta="Start today"
      glow
      canContinue={stepGoalValid}
      loading={save.isPending}
      onNext={start}
    >
      <View style={styles.tiles}>
        <StatTile value={formatInt(targets.kcal)} unit="kcal" label="Food" color={colors.dataKcal} />
        <StatTile value={formatInt(targets.proteinG)} unit="g" label="Protein" color={colors.dataProtein} />
        <StatTile value={formatThousands(targets.steps)} unit="steps" label="Move" color={colors.dataActivity} />
      </View>

      <StepGoalField
        initial={draft.stepGoal}
        onChange={(goal) => {
          setStepGoalValid(goal != null);
          if (goal != null) draft.update({ stepGoal: goal });
        }}
      />

      <Projection targets={targets} targetKg={input.targetWeightKg ?? null} weightKg={input.weightKg} />

      <HowWeGotThis
        targets={targets}
        goal={input.goal}
        activity={ACTIVITY_LABEL[input.activityLevel]}
        pace={hasPace ? (input.pace ?? null) : null}
      />

      <CoachLine coach={draft.coach} line={PERSONAS[draft.coach].planLine} />
    </OnboardingStep>
  );
}

function Projection({ targets, targetKg, weightKg }: { targets: Targets; targetKg: number | null; weightKg: number }) {
  if (targets.goalDate && targetKg != null && targets.weeklyChangeKg) {
    return (
      <Card variant="raised">
        <Text variant="headline-md" color="primaryText" tabular>
          {`→ ${formatKg(targetKg)} kg by ~${formatShortDate(targets.goalDate)}`}
        </Text>
        <Text variant="body" color="textSecondary">
          {`≈ ${formatWeeklyKg(targets.weeklyChangeKg)} kg a week${targets.paceCapped ? ", capped to keep it safe" : ""}${
            targets.floorApplied ? ", slowed to keep your calories at a safe minimum" : ""
          }.`}
        </Text>
      </Card>
    );
  }
  if (targetKg != null) {
    return (
      <Card variant="warning">
        <Text variant="body">
          {`${formatInt(targets.kcal)} kcal a day is your safe minimum, so there's no date for ${formatKg(targetKg)} kg yet. Moving more will get you there.`}
        </Text>
      </Card>
    );
  }
  return (
    <Card variant="raised">
      <Text variant="headline-md" color="primaryText" tabular>
        {`→ Hold steady around ${formatKg(weightKg)} kg`}
      </Text>
    </Card>
  );
}

type HowProps = { targets: Targets; goal: Goal; activity: string; pace: Pace | null };

function HowWeGotThis({ targets, goal, activity, pace }: HowProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const adj = targets.adjustmentKcal;
  const rows: [string, string][] = [
    ["Resting burn (Mifflin-St Jeor)", `${formatInt(targets.bmr)} kcal`],
    [`× ${targets.activityMultiplier} for ${activity.toLowerCase()}`, `${formatInt(targets.tdee)} kcal`],
  ];
  if (adj !== 0 && pace) {
    rows.push([`${PACE_LABEL[pace]} pace`, `${adj > 0 ? "+" : "−"}${formatInt(Math.abs(adj))} kcal`]);
  }
  if (targets.floorApplied) rows.push(["Raised to your safe minimum", `${formatInt(targets.kcal)} kcal`]);
  rows.push(
    ["Daily target (rounded)", `${formatInt(targets.kcal)} kcal`],
    [`Protein, ${PROTEIN_G_PER_KG[goal]} g per kg`, `${targets.proteinG} g`],
    [`Fat, ${FAT_SHARE_OF_KCAL * 100}% of calories`, `${targets.fatG} g`],
    ["Carbs, the rest", `${targets.carbsG} g`],
  );

  return (
    <Card flush>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.disclosure}
      >
        <Text variant="title" style={styles.flex}>
          How we got this
        </Text>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Icon name="expand_more" color={colors.textSecondary} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.rows}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text variant="body" color="textSecondary" style={styles.flex}>
                {label}
              </Text>
              <Text variant="label" tabular>
                {value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: 8 },
  disclosure: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 16 },
  rows: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  flex: { flex: 1 },
});
