// S37 · Phase editor (P29). No export yet (D53): built from DESIGN.md §6.7 — name, goal type, start/end dates, target
// weight, calorie and protein targets (pre-filled from the plan), Create. No date-picker dependency: the start is
// Today / Tomorrow / Next Monday and the end is a length in weeks (or open-ended). With "Follow my plan" on, the phase
// keeps using the plan's targets (stored as null) and weekly check-ins adjust them.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { Goal } from "@/core/api/types";
import {
  Button,
  Card,
  Chip,
  Header,
  ListItem,
  NumberStepper,
  Screen,
  Text,
  TextField,
  Toggle,
  useToast,
} from "@/core/ui";
import { useActivityClock } from "@/features/activity/store";
import { GOAL_LABEL } from "@/features/onboarding/copy";
import { useProgress } from "@/features/progress/hooks";
import { getPhase, savePhase } from "@/features/progress/phases";
import { formatInt, formatKg, formatShortDate } from "@/features/targets/format";
import { addDays, dayNumber, weekday } from "@shared/domain/progress";
import { goalHasPace } from "@shared/domain/targets";

const GOALS: Goal[] = ["lose_fat", "build_muscle", "maintain", "get_fitter"];
const DEFAULT_WEEKS = 8;

export default function PhaseEditor() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const p = useProgress(useActivityClock());
  const existing = useMemo(() => (id ? getPhase(id) : null), [id]);
  const profile = p.profile.data;
  const currentKg = p.latest?.trendKg ?? profile?.weightKg ?? 70;

  const starts = useMemo(() => {
    const nextMonday = addDays(p.today, (8 - weekday(p.today)) % 7 || 7);
    return [
      { label: "Today", date: p.today },
      { label: "Tomorrow", date: addDays(p.today, 1) },
      { label: "Next Monday", date: nextMonday },
    ];
  }, [p.today]);

  const [name, setName] = useState(existing?.name ?? "");
  const [goal, setGoal] = useState<Goal>(existing?.goal ?? profile?.goal ?? "lose_fat");
  const [start, setStart] = useState(existing?.startDate ?? p.today);
  const [openEnded, setOpenEnded] = useState(existing ? existing.endDate == null : false);
  const [weeks, setWeeks] = useState(
    existing?.endDate
      ? Math.max(1, Math.round((dayNumber(existing.endDate) - dayNumber(existing.startDate) + 1) / 7))
      : DEFAULT_WEEKS,
  );
  const [targetKg, setTargetKg] = useState(
    existing?.targetWeightKg ?? profile?.targetWeightKg ?? Math.round(currentKg),
  );
  const [followPlan, setFollowPlan] = useState(existing ? existing.kcal == null : true);
  // Hand-set calories never go under the plan's calorie floor (D25).
  const floor = Math.ceil((p.plan?.floorKcal ?? 1200) / 50) * 50;
  const [kcal, setKcal] = useState(Math.max(floor, existing?.kcal ?? p.targets?.kcal ?? 2000));
  const [proteinG, setProteinG] = useState(existing?.proteinG ?? p.targets?.proteinG ?? 120);

  const usesTarget = goalHasPace(goal);
  const targetIssue = !usesTarget
    ? null
    : goal === "lose_fat" && targetKg >= currentKg
      ? `Pick a target below your trend weight (${formatKg(currentKg)} kg).`
      : goal === "build_muscle" && targetKg <= currentKg
        ? `Pick a target above your trend weight (${formatKg(currentKg)} kg).`
        : null;
  const nameIssue = name.trim() ? null : "Give the phase a name.";
  const replacing = !existing && p.active ? p.active : null;
  const endDate = openEnded ? null : addDays(start, weeks * 7 - 1);

  const save = () => {
    if (!p.userId || nameIssue || targetIssue) return;
    const phaseId = savePhase(
      p.userId,
      {
        name,
        goal,
        startDate: start,
        endDate,
        targetWeightKg: usesTarget ? targetKg : null,
        kcal: followPlan ? null : kcal,
        proteinG: followPlan ? null : proteinG,
      },
      existing?.id ?? null,
      p.series,
    );
    toast({ kind: "success", message: existing ? "Phase saved" : `${name.trim()} started` });
    router.replace(`/progress/phase/${phaseId}`);
  };

  return (
    <Screen header={<Header title={existing ? "Edit phase" : "New phase"} onBack={() => router.back()} />}>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Summer Cut"
        maxLength={60}
        error={name ? (nameIssue ?? undefined) : undefined}
      />

      <Text variant="label" color="textSecondary">
        Goal
      </Text>
      <View style={styles.chips}>
        {GOALS.map((g) => (
          <Chip key={g} kind="choice" label={GOAL_LABEL[g]} selected={g === goal} onPress={() => setGoal(g)} />
        ))}
      </View>

      {existing ? (
        <Text variant="body" color="textSecondary">{`Started ${formatShortDate(existing.startDate)}`}</Text>
      ) : (
        <>
          <Text variant="label" color="textSecondary">
            Starts
          </Text>
          <View style={styles.chips}>
            {starts.map((s) => (
              <Chip
                key={s.label}
                kind="choice"
                label={s.label}
                selected={s.date === start}
                onPress={() => setStart(s.date)}
              />
            ))}
          </View>
        </>
      )}

      <Card>
        <ListItem
          title="Open-ended"
          subtitle="No planned end date"
          trailing={<Toggle value={openEnded} onValueChange={setOpenEnded} accessibilityLabel="Open-ended phase" />}
        />
        {!openEnded ? (
          <>
            <NumberStepper
              label="Length"
              value={weeks}
              onChange={setWeeks}
              min={1}
              max={52}
              unit={weeks === 1 ? "week" : "weeks"}
            />
            <Text variant="caption" color="textSecondary">{`Ends ${formatShortDate(endDate!)}`}</Text>
          </>
        ) : null}
      </Card>

      {usesTarget ? (
        <Card>
          <NumberStepper
            label="Target weight"
            value={targetKg}
            onChange={setTargetKg}
            min={30}
            max={300}
            step={0.5}
            unit="kg"
            format={formatKg}
          />
          {targetIssue ? (
            <Text variant="caption" color="error">
              {targetIssue}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <ListItem
          title="Follow my plan"
          subtitle="Use your plan's targets and let weekly check-ins adjust them"
          trailing={<Toggle value={followPlan} onValueChange={setFollowPlan} accessibilityLabel="Follow my plan" />}
        />
        {followPlan ? (
          <Text variant="caption" color="textSecondary">
            {p.targets ? `Now ${formatInt(p.targets.kcal)} kcal · ${formatInt(p.targets.proteinG)} g protein` : ""}
          </Text>
        ) : (
          <View style={styles.steppers}>
            <NumberStepper
              label="Calories"
              value={kcal}
              onChange={setKcal}
              min={floor}
              max={6000}
              step={50}
              unit="kcal"
              format={formatInt}
            />
            <Text
              variant="caption"
              color="textSecondary"
            >{`Never below ${formatInt(floor)} kcal, your minimum safe calories.`}</Text>
            <NumberStepper
              label="Protein"
              value={proteinG}
              onChange={setProteinG}
              min={20}
              max={400}
              step={5}
              unit="g"
              format={formatInt}
            />
          </View>
        )}
      </Card>

      {replacing ? <Text variant="caption" color="warn">{`Creating this phase closes ${replacing.name}.`}</Text> : null}
      <Button
        label={existing ? "Save" : "Create"}
        onPress={save}
        fullWidth
        disabled={!!nameIssue || !!targetIssue || !p.userId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  steppers: { gap: 12, marginTop: 8 },
});
