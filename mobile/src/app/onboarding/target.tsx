// S07 · Target weight & pace (step 4, only for goals with a target weight, UX O3). States: normal, capped-pace
// warning, calorie-floor note. The preview runs the P08 calculator live. UX O2: the suggested target is filled in as
// the real value, so Continue works straight away. The water goal moved to the plan step (UX O3).
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Card, Slider, Text, TextField } from "@/core/ui";
import { PACE_STOPS } from "@/features/onboarding/copy";
import {
  BOUNDS,
  draftTargetInput,
  inRange,
  parseNumber,
  suggestedTargetKg,
  useDraft,
  type Draft,
} from "@/features/onboarding/draft";
import { nextStep, stepHref } from "@/features/onboarding/flow";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";
import { formatInt, formatKg, formatShortDate, formatWeeklyKg } from "@/features/targets/format";
import { calculateTargets, goalHasPace, MAX_LOSS_KG_PER_WEEK, type Targets } from "@shared/domain/targets";

/** The target to start from: the saved one when it fits the goal, else the suggestion. */
function startingTarget(d: Draft): number | null {
  if (!d.goal || !goalHasPace(d.goal) || d.weightKg == null) return d.targetWeightKg;
  const t = d.targetWeightKg;
  const fits =
    inRange(t, BOUNDS.weightKg) &&
    (d.goal === "lose_fat" ? t < d.weightKg : d.goal === "build_muscle" ? t > d.weightKg : true);
  return fits ? t : suggestedTargetKg(d.goal, d.weightKg);
}

export default function TargetStep() {
  const draft = useDraft();
  const { update } = draft;
  const [initial] = useState(() => startingTarget(draft));
  const [text, setText] = useState(initial == null ? "" : formatKg(initial));
  useEffect(() => {
    if (initial !== useDraft.getState().targetWeightKg) useDraft.getState().update({ targetWeightKg: initial });
  }, [initial]);

  const hasPace = !!draft.goal && goalHasPace(draft.goal);
  const input = draftTargetInput(draft);
  const targets = input ? calculateTargets(input) : null;

  const current = draft.weightKg ?? 0;
  const t = draft.targetWeightKg;
  let warning: string | undefined;
  if (hasPace && text.trim() !== "") {
    if (!inRange(t, BOUNDS.weightKg)) {
      warning = `Enter a weight between ${BOUNDS.weightKg.min} and ${BOUNDS.weightKg.max} kg.`;
    } else if (draft.goal === "lose_fat" && t >= current) {
      warning = `To lose fat, pick a weight below your current ${formatKg(current)} kg.`;
    } else if (draft.goal === "build_muscle" && t <= current) {
      warning = `To build muscle, pick a weight above your current ${formatKg(current)} kg.`;
    }
  }

  return (
    <OnboardingStep
      id="target"
      title="Where do you want to be?"
      subtitle={hasPace ? "Pick a target and how fast to get there." : undefined}
      cta="Continue"
      canContinue={!!input && (!hasPace || inRange(t, BOUNDS.weightKg))}
      onNext={() => router.push(stepHref(nextStep("target", draft.goal)))}
    >
      {hasPace ? (
        <>
          <TextField
            label="Target weight"
            unit="kg"
            keyboardType="decimal-pad"
            placeholder={draft.goal ? formatKg(suggestedTargetKg(draft.goal, current)) : undefined}
            value={text}
            onChangeText={(v) => {
              setText(v);
              update({ targetWeightKg: parseNumber(v) });
            }}
            warning={warning}
          />
          <View style={styles.pace}>
            <Text variant="label" color="textSecondary">
              Pace
            </Text>
            <Slider label="Pace" stops={PACE_STOPS} value={draft.pace} onChange={(pace) => update({ pace })} />
          </View>
          {targets && t != null ? <Preview targets={targets} targetKg={t} /> : null}
          {targets ? <SafetyNotes targets={targets} /> : null}
        </>
      ) : (
        <Card eyebrow="No target weight needed">
          <Text variant="body-lg">
            {`We'll set your food to keep you around ${formatKg(current)} kg${
              draft.goal === "get_fitter" ? ", and focus on moving more." : "."
            }`}
          </Text>
        </Card>
      )}
    </OnboardingStep>
  );
}

function Preview({ targets, targetKg }: { targets: Targets; targetKg: number }) {
  const weekly = targets.weeklyChangeKg ?? 0;
  return (
    <Card variant="raised" eyebrow="Your pace">
      {targets.goalDate ? (
        <Text variant="headline-md" tabular>
          {`≈ ${formatWeeklyKg(weekly)} kg/week → ${formatKg(targetKg)} kg by ~${formatShortDate(targets.goalDate)}`}
        </Text>
      ) : (
        <Text variant="headline-sm">{`${formatKg(targetKg)} kg is the target. No date yet.`}</Text>
      )}
    </Card>
  );
}

function SafetyNotes({ targets }: { targets: Targets }) {
  const notes: string[] = [];
  if (targets.paceCapped) notes.push(`Capped at ${MAX_LOSS_KG_PER_WEEK} kg/week to keep it safe.`);
  if (targets.floorApplied && targets.weeklyChangeKg) {
    notes.push(
      `Slowed to ≈ ${formatWeeklyKg(targets.weeklyChangeKg)} kg/week so you still eat at least ${formatInt(targets.kcal)} kcal a day.`,
    );
  } else if (targets.floorApplied) {
    notes.push(
      `${formatInt(targets.kcal)} kcal a day is the safe minimum and about what you burn, so food alone won't move the scale. Moving more will.`,
    );
  }
  if (!notes.length) return null;
  return (
    <>
      {notes.map((n) => (
        <WarnNote key={n} text={n} />
      ))}
    </>
  );
}

function WarnNote({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Card variant="warning">
      <View style={styles.note} accessibilityLiveRegion="polite">
        <Icon name="warning" size={20} color={colors.warn} filled />
        <Text variant="body" style={styles.flex}>
          {text}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  pace: { gap: 4 },
  note: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  flex: { flex: 1 },
});
