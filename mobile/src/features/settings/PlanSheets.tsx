// UX O5 · Settings edits the plan one field at a time instead of "Redo setup": diet and activity save on tap (with
// Undo), water and target weight with a stepper and Save. The profile is server-owned (D23), so these need the network.
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import type { ActivityLevel, DietPref, Profile, ProfileUpdate } from "@/core/api/types";
import { BottomSheet, Button, Chip, NumberStepper, Text, useToast } from "@/core/ui";
import { ChoiceCard } from "@/features/onboarding/ChoiceCard";
import { ACTIVITY_LABEL, ACTIVITY_OPTIONS, DIET_OPTIONS } from "@/features/onboarding/copy";
import { followTargetWeight } from "@/features/progress/phases";
import { formatKg } from "@/features/targets/format";
import { useUpdateProfile } from "@/features/users/api";
import { WATER_GOAL_MAX, WATER_GOAL_MIN, clampWaterGoal } from "@shared/domain/water";

type SheetProps = { visible: boolean; onClose: () => void; profile: Profile; online: boolean };

const OFFLINE = "Connect to change this.";

/** Saves one profile change, with a toast (and Undo when `undo` is given). */
function useSave(userId: string) {
  const update = useUpdateProfile(userId);
  const toast = useToast();
  const save = (change: ProfileUpdate, message: string, undo?: ProfileUpdate, after?: () => void) =>
    update.mutate(change, {
      onSuccess: () => {
        after?.();
        toast({
          kind: "success",
          message,
          onUndo: undo ? () => update.mutate(undo, { onError: (e) => toastError(e) }) : undefined,
        });
      },
      onError: (e) => toastError(e),
    });
  const toastError = (e: unknown) => toast({ kind: "error", message: describeError(e).title });
  return { save, pending: update.isPending };
}

/** Starts from the saved value each time the sheet opens. */
function useOpenValue<T>(visible: boolean, saved: T): [T, (v: T) => void] {
  const [value, setValue] = useState(saved);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setValue(saved);
  }
  return [value, setValue];
}

export const DIET_LABEL = Object.fromEntries(DIET_OPTIONS.map((o) => [o.value, o.label])) as Record<DietPref, string>;

export function DietSheet({ visible, onClose, profile, online }: SheetProps) {
  const { save, pending } = useSave(profile.userId);
  const pick = (diet: DietPref) => {
    if (diet === profile.diet) return onClose();
    onClose();
    save({ diet }, `Diet set to ${DIET_LABEL[diet]}`, { diet: profile.diet });
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Diet">
      <View style={styles.sheet}>
        <Text variant="body" color="textSecondary">
          {online ? "Food ideas and the coach follow this." : OFFLINE}
        </Text>
        <View style={styles.chips}>
          {DIET_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              kind="choice"
              label={o.label}
              selected={o.value === profile.diet}
              onPress={() => pick(o.value)}
              disabled={!online || pending}
            />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

export function ActivitySheet({ visible, onClose, profile, online }: SheetProps) {
  const { save, pending } = useSave(profile.userId);
  const pick = (activityLevel: ActivityLevel) => {
    if (activityLevel === profile.activityLevel) return onClose();
    onClose();
    save({ activityLevel }, `Activity set to ${ACTIVITY_LABEL[activityLevel].toLowerCase()}. Targets updated`, {
      activityLevel: profile.activityLevel,
    });
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="How active is a normal day?" size="full">
      <ScrollView contentContainerStyle={styles.sheet}>
        <Text variant="body" color="textSecondary">
          {online ? "Count your job and your workouts. Your calories follow this." : OFFLINE}
        </Text>
        {ACTIVITY_OPTIONS.map((o) => (
          <ChoiceCard
            key={o.value}
            title={o.title}
            body={o.body}
            selected={o.value === profile.activityLevel}
            onPress={() => (online && !pending ? pick(o.value) : undefined)}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

export function WaterGoalSheet({ visible, onClose, profile, online }: SheetProps) {
  const { save, pending } = useSave(profile.userId);
  const saved = clampWaterGoal(profile.waterGoalGlasses);
  const [glasses, setGlasses] = useOpenValue(visible, saved);
  const submit = () => {
    if (glasses === saved) return onClose();
    save({ waterGoalGlasses: glasses }, `Water goal set to ${glasses} glasses`, undefined, onClose);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Daily water goal">
      <View style={styles.sheet}>
        <Text variant="body" color="textSecondary">
          {online ? "One glass is about 250 ml. Most adults do well with 8." : OFFLINE}
        </Text>
        <NumberStepper
          label="Glasses a day"
          value={glasses}
          onChange={setGlasses}
          min={WATER_GOAL_MIN}
          max={WATER_GOAL_MAX}
          unit={glasses === 1 ? "glass" : "glasses"}
        />
        <Button label="Save" onPress={submit} loading={pending} disabled={!online} />
      </View>
    </BottomSheet>
  );
}

/** Only for goals with a target (lose fat, build muscle). The open phase follows the new target. */
export function TargetWeightSheet({ visible, onClose, profile, online }: SheetProps) {
  const { save, pending } = useSave(profile.userId);
  const weight = profile.weightKg ?? 70;
  const saved = profile.targetWeightKg ?? Math.round(weight);
  const [target, setTarget] = useOpenValue(visible, saved);
  const issue =
    profile.goal === "lose_fat" && target >= weight
      ? `Pick a target below your weight (${formatKg(weight)} kg).`
      : profile.goal === "build_muscle" && target <= weight
        ? `Pick a target above your weight (${formatKg(weight)} kg).`
        : null;
  const submit = () => {
    if (target === saved) return onClose();
    save({ targetWeightKg: target }, `Target set to ${formatKg(target)} kg. Targets updated`, undefined, () => {
      followTargetWeight(profile.userId, target);
      onClose();
    });
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Target weight">
      <View style={styles.sheet}>
        <Text variant="body" color="textSecondary">
          {online ? "Your daily calories and goal date follow this." : OFFLINE}
        </Text>
        <NumberStepper
          label="Target"
          value={target}
          onChange={setTarget}
          min={30}
          max={300}
          step={0.5}
          unit="kg"
          format={formatKg}
        />
        {issue ? (
          <Text variant="caption" color="error">
            {issue}
          </Text>
        ) : null}
        <Button label="Save" onPress={submit} loading={pending} disabled={!online || !!issue} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
