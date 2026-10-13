// S09 · Your plan (last step): kcal · protein · steps, the projection, the daily goals, the coach, a "How we got this"
// disclosure for geeks, and "Start today", which saves the profile.
// UX O3: the coach (recommended for the goal), the water goal and the step goal (suggested from activity, F13) are
// defaulted and shown here with "Edit goals" / "Change coach"; Health Connect is offered here instead of its own step.
// UX O4: offline, or when the server can't be reached, the plan is kept on the phone and sent later.
// UX F12: nudges are on by default, so the S49 explainer asks for the notification permission once, at the end.
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { ApiError, describeError } from "@/core/api/client";
import type { ProfileUpdate } from "@/core/api/types";
import { Icon } from "@/core/icons/Icon";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { BottomSheet, Button, Card, ListItem, NumberStepper, StatTile, Text, useToast } from "@/core/ui";
import { healthStatus, installHealth, requestSteps, type HealthState } from "@/features/activity/health";
import { burstOnce } from "@/features/celebrate/ConfettiBurst";
import { CoachLine } from "@/features/coach/CoachLine";
import { CoachPickerSheet } from "@/features/coach/CoachPickerSheet";
import { PERSONAS } from "@/features/coach/personas";
import { requestNotifAccess, useNotifAccess, useNudgeSettings } from "@/features/nudges/settings";
import { ACTIVITY_LABEL, PACE_LABEL } from "@/features/onboarding/copy";
import { clearSavedDraft, draftCoach, draftStepGoal, draftTargetInput, useDraft } from "@/features/onboarding/draft";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";
import { PermissionExplainer } from "@/features/permissions/PermissionExplainer";
import { formatInt, formatKg, formatShortDate, formatThousands, formatWeeklyKg } from "@/features/targets/format";
import { StepGoalField } from "@/features/targets/StepGoalField";
import { useActiveUser } from "@/features/users/activeUser";
import { queueProfileSave, useUpdateProfile } from "@/features/users/api";
import {
  calculateTargets,
  FAT_SHARE_OF_KCAL,
  goalHasPace,
  PROTEIN_G_PER_KG,
  type Goal,
  type Pace,
  type Targets,
} from "@shared/domain/targets";
import { WATER_GOAL_MAX, WATER_GOAL_MIN } from "@shared/domain/water";

export default function PlanStep() {
  const { colors } = useTheme();
  const draft = useDraft();
  const userId = useActiveUser((s) => s.userId);
  const save = useUpdateProfile(userId);
  const queryClient = useQueryClient();
  const online = useNetwork((s) => s.online);
  const toast = useToast();
  const nudges = useNudgeSettings(userId);
  const { access, setAccess } = useNotifAccess();
  // False while the typed step goal is invalid; the draft keeps the last valid one.
  const [stepGoalValid, setStepGoalValid] = useState(true);
  const [editGoals, setEditGoals] = useState(false);
  const [coachSheet, setCoachSheet] = useState(false);
  const [askNudges, setAskNudges] = useState(false);

  const input = draftTargetInput(draft);
  const coach = draftCoach(draft);
  if (!input || !coach || !draft.diet) {
    // Reached without finishing the earlier steps (e.g. after a reload): start again.
    return (
      <OnboardingStep
        id="plan"
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
  const stepGoal = draftStepGoal(draft);
  const persona = PERSONAS[coach];

  const leave = () => {
    router.dismissTo("/today");
    // First finished onboarding on this profile gets the big burst (redoing the plan later doesn't).
    burstOnce(userId, "onboarded", "big");
  };
  const done = (queued: boolean) => {
    clearSavedDraft(userId);
    if (queued) toast({ message: "Plan saved on this phone. It syncs when you're back online." });
    if (access === "ask" && nudges.enabled && !nudges.promptDismissed) setAskNudges(true);
    else leave();
  };

  const start = () => {
    if (!userId) return;
    const update: ProfileUpdate = {
      goal: input.goal,
      age: input.age,
      sex: input.sex,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      activityLevel: input.activityLevel,
      diet: draft.diet,
      targetWeightKg: hasPace ? (input.targetWeightKg ?? null) : null,
      pace: hasPace ? (input.pace ?? null) : null,
      coach,
      stepGoal,
      waterGoalGlasses: draft.waterGoalGlasses,
      onboardedAt: new Date().toISOString(),
    };
    if (!online) {
      queueProfileSave(queryClient, userId, update);
      return done(true);
    }
    save.mutate(update, {
      onSuccess: () => done(false),
      onError: (err) => {
        if (err instanceof ApiError && (err.kind === "network" || err.kind === "timeout")) {
          queueProfileSave(queryClient, userId, update);
          done(true);
        } else toast({ kind: "error", message: describeError(err).body });
      },
    });
  };

  return (
    <OnboardingStep
      id="plan"
      title="Your plan"
      subtitle="Your daily targets. They adjust each week as you log."
      cta="Start today"
      glow
      canContinue={stepGoalValid && !askNudges}
      loading={save.isPending}
      onNext={start}
    >
      <View style={styles.tiles}>
        <StatTile value={formatInt(targets.kcal)} unit="kcal" label="Food" color={colors.dataKcal} />
        <StatTile value={formatInt(targets.proteinG)} unit="g" label="Protein" color={colors.dataProtein} />
        <StatTile value={formatThousands(targets.steps)} unit="steps" label="Move" color={colors.dataActivity} />
      </View>

      <Projection targets={targets} targetKg={input.targetWeightKg ?? null} weightKg={input.weightKg} />

      <Card flush>
        <ListItem
          icon="water_drop"
          title="Water"
          value={`${draft.waterGoalGlasses} ${draft.waterGoalGlasses === 1 ? "glass" : "glasses"} a day`}
          divider
        />
        <ListItem
          icon="footprint"
          title="Steps"
          subtitle={draft.stepGoal == null ? "Suggested from how active you are" : undefined}
          value={`${formatInt(stepGoal)} a day`}
        />
        {editGoals ? (
          <View style={styles.editors}>
            <View style={styles.editor}>
              <Text variant="label" color="textSecondary">
                Daily water goal
              </Text>
              <NumberStepper
                label="Daily water goal"
                value={draft.waterGoalGlasses}
                onChange={(waterGoalGlasses) => draft.update({ waterGoalGlasses })}
                min={WATER_GOAL_MIN}
                max={WATER_GOAL_MAX}
                unit={draft.waterGoalGlasses === 1 ? "glass" : "glasses"}
              />
            </View>
            <StepGoalField
              initial={stepGoal}
              onChange={(goal) => {
                setStepGoalValid(goal != null);
                if (goal != null) draft.update({ stepGoal: goal });
              }}
            />
          </View>
        ) : (
          <View style={styles.editLink}>
            <Button label="Edit goals" variant="ghost" size="sm" onPress={() => setEditGoals(true)} />
          </View>
        )}
        <HealthRow />
      </Card>

      <View style={styles.coach}>
        <CoachLine coach={coach} line={persona.planLine} />
        <View style={styles.coachRow}>
          <Text variant="caption" color="textSecondary" style={styles.flex}>
            {draft.coach ? `${persona.name} is your coach.` : `${persona.name} suits this goal.`}
          </Text>
          <Button label="Change coach" variant="ghost" size="sm" onPress={() => setCoachSheet(true)} />
        </View>
      </View>

      <HowWeGotThis
        targets={targets}
        goal={input.goal}
        activity={ACTIVITY_LABEL[input.activityLevel]}
        pace={hasPace ? (input.pace ?? null) : null}
      />

      <CoachPickerSheet
        visible={coachSheet}
        onClose={() => setCoachSheet(false)}
        current={coach}
        onPick={(c) => draft.update({ coach: c })}
      />
      <BottomSheet visible={askNudges} onClose={leave} size="medium">
        <View style={{ backgroundColor: colors.surfaceLow }}>
          <PermissionExplainer
            kind="notifications"
            denied={false}
            perDay={nudges.perDay}
            onContinue={async () => {
              setAccess(await requestNotifAccess());
              setAskNudges(false);
              leave();
            }}
            onNotNow={() => {
              setAskNudges(false);
              leave();
            }}
          />
        </View>
      </BottomSheet>
    </OnboardingStep>
  );
}

/** UX O3: Health Connect in one row instead of its own step. Only shown when it's connected or can be. */
function HealthRow() {
  const [status, setStatus] = useState<HealthState>("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let active = true;
    void healthStatus().then((s) => {
      if (active) setStatus(s);
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === "ready") return <ListItem icon="check_circle" title="Steps come from Health Connect" />;
  if (status !== "permission" && status !== "missing") return null;
  const connect = async () => {
    setBusy(true);
    try {
      setStatus(await requestSteps());
    } catch {
      // Left as it was; Settings → Health & activity can connect later.
    } finally {
      setBusy(false);
    }
  };
  return (
    <ListItem
      icon="directions_walk"
      title="Count steps automatically"
      subtitle={status === "missing" ? "Needs the Health Connect app" : "Optional. Reads steps from Health Connect"}
      trailing={
        <Button
          label={status === "missing" ? "Install" : "Connect"}
          size="sm"
          variant="secondary"
          loading={busy}
          onPress={status === "missing" ? () => void installHealth().catch(() => {}) : () => void connect()}
        />
      }
    />
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
  editors: { padding: 16, gap: 16 },
  editor: { gap: 4 },
  editLink: { paddingHorizontal: 8, paddingBottom: 4, alignItems: "flex-start" },
  coach: { gap: 4 },
  coachRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  disclosure: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 16 },
  rows: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  flex: { flex: 1 },
});
