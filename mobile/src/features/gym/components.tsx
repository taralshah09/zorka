// Gym domain components (DESIGN.md §7.2): ExerciseTile, ExerciseRow (S23), PRBadge (S24/S25/S27),
// SetTable + SetRow with previous ghost values and PR state (S24), RestTimerBar (S24, P20).
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import type { Exercise } from "@/core/api/types";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Badge, IconButton, PressableScale, ProgressBar, Text, useToast } from "@/core/ui";
import {
  formatClock,
  formatKg,
  formatSet,
  PR_LABEL,
  REST_STEP_S,
  type ExerciseCategory,
  type ExerciseType,
  type PrKind,
  type SetValues,
} from "@shared/domain/gym";
import { CATEGORY_TILE, SET_COLUMNS } from "./format";
import { restTimer, useRestTimer } from "./rest";
import {
  completeSet,
  removeSet,
  restoreSet,
  uncompleteSet,
  updateSet,
  type WorkoutExercise,
  type WorkoutSet,
} from "./store";

/** 40–56 px category tile (brand §10 style, no photos). */
export function ExerciseTile({ category, size = 44 }: { category: ExerciseCategory | null; size?: number }) {
  const { colors, radius } = useTheme();
  const tile = CATEGORY_TILE[category ?? "chest"];
  const bg = tile.tint === "orchid" ? colors.tertiary : tile.tint === "lilac" ? colors.secondary : colors.primary;
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: radius.md, backgroundColor: bg }]}>
      <Icon name={tile.icon} size={size >= 52 ? 28 : 20} color={colors.ink} />
    </View>
  );
}

/** S23 row: tile · name · "last: 77.5 kg × 8 · best 80 kg" · selection tick. */
export function ExerciseRow({
  exercise,
  meta,
  selected,
  onPress,
}: {
  exercise: Exercise;
  meta: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole={selected === undefined ? "button" : "checkbox"}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={`${exercise.name}, ${meta}`}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.surfaceHigh : colors.surfaceLow,
          borderRadius: radius.lg,
          padding: layout.cardPadding,
          borderColor: selected ? colors.primary : "transparent",
        },
      ]}
    >
      <ExerciseTile category={exercise.category} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text variant="title" numberOfLines={1} style={styles.shrink}>
            {exercise.name}
          </Text>
          {exercise.custom ? (
            <Text variant="caption" color="secondaryText">
              Yours
            </Text>
          ) : null}
        </View>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {selected !== undefined ? (
        <Icon
          name={selected ? "check_circle" : "add_circle"}
          size={24}
          color={selected ? colors.primaryText : colors.textTertiary}
          filled={selected}
        />
      ) : (
        <Icon name="chevron_right" size={20} color={colors.textSecondary} />
      )}
    </PressableScale>
  );
}

/** Trophy "PR" badge. With kinds, the label names the record ("Heaviest weight"). */
export function PRBadge({ kinds, long = false }: { kinds: readonly PrKind[]; long?: boolean }) {
  if (!kinds.length) return null;
  return <Badge label={long ? kinds.map((k) => PR_LABEL[k]).join(" · ") : "PR"} tone="lime" icon="trophy" />;
}

// ── S24 set table ──────────────────────────────────────────────────────────────────────────────

type Field = "weightKg" | "reps" | "durationS" | "distanceM";

/** Shown and typed in kg, reps, seconds (holds), minutes (cardio time) and km (cardio distance). */
function toText(type: ExerciseType, field: Field, v: number | null): string {
  if (v === null) return "";
  if (field === "distanceM") return formatKg(v / 1000);
  if (field === "durationS" && type === "distance_time") return formatKg(v / 60);
  if (field === "weightKg") return formatKg(v);
  return String(v);
}

function fromText(type: ExerciseType, field: Field, t: string): number | null {
  const n = Number(t.replace(",", ".").trim());
  if (!t.trim() || !Number.isFinite(n) || n < 0) return null;
  if (field === "distanceM") return Math.round(n * 1000);
  if (field === "durationS") return Math.round(type === "distance_time" ? n * 60 : n);
  if (field === "reps") return Math.round(n);
  return Math.round(n * 100) / 100;
}

export function SetTable({
  userId,
  we,
  previous,
  onCompleted,
}: {
  userId: string;
  we: WorkoutExercise;
  /** Last session's ticked sets, by index (the grey "Previous" column). */
  previous: readonly WorkoutSet[];
  /** A set was ticked: start the rest timer, show the PR toast. */
  onCompleted: (set: SetValues, kinds: PrKind[]) => void;
}) {
  const { colors } = useTheme();
  const cols = SET_COLUMNS[we.type];
  return (
    <View>
      <View style={styles.tableRow}>
        <Text variant="unit" color="textTertiary" style={styles.colSet}>
          Set
        </Text>
        <Text variant="unit" color="textTertiary" style={styles.colPrev}>
          Previous
        </Text>
        {cols.map((c) => (
          <Text key={c.field} variant="unit" color="textTertiary" style={styles.colField} align="center">
            {c.label}
          </Text>
        ))}
        <View style={styles.colCheck}>
          <Icon name="check" size={16} color={colors.textTertiary} />
        </View>
      </View>
      {we.sets.map((s, i) => (
        <SetRow
          key={s.id}
          userId={userId}
          we={we}
          set={s}
          index={i}
          previous={previous[i] ?? null}
          onCompleted={onCompleted}
        />
      ))}
    </View>
  );
}

function SetRow({
  userId,
  we,
  set,
  index,
  previous,
  onCompleted,
}: {
  userId: string;
  we: WorkoutExercise;
  set: WorkoutSet;
  index: number;
  previous: WorkoutSet | null;
  onCompleted: (set: SetValues, kinds: PrKind[]) => void;
}) {
  const { colors, radius, type } = useTheme();
  const toast = useToast();
  const cols = SET_COLUMNS[we.type];
  // Typed text not saved yet; everything else shows the stored value.
  const [edits, setEdits] = useState<Partial<Record<Field, string>>>({});
  const shown = (f: Field) => edits[f] ?? toText(we.type, f, set[f]);
  const hint = (f: Field) =>
    previous
      ? toText(we.type, f, previous[f])
      : f === "reps" && we.targetReps
        ? String(we.targetReps)
        : f === "weightKg"
          ? "0"
          : "";

  const current = (): SetValues => {
    const v: SetValues = { weightKg: set.weightKg, reps: set.reps, durationS: set.durationS, distanceM: set.distanceM };
    for (const f of Object.keys(edits) as Field[]) v[f] = fromText(we.type, f, edits[f]!);
    return v;
  };

  const commit = () => {
    if (!Object.keys(edits).length) return;
    updateSet(userId, we, set.id, current());
    setEdits({});
  };

  const toggle = () => {
    if (set.done) {
      uncompleteSet(userId, we, set.id);
      return;
    }
    // An empty field takes last session's number (or the routine's target reps): one tap repeats it.
    const v = current();
    for (const c of cols) {
      if (v[c.field] === null) v[c.field] = previous?.[c.field] ?? (c.field === "reps" ? we.targetReps : null);
    }
    if (we.type === "weight_reps" && v.weightKg === null && v.reps !== null) v.weightKg = 0;
    const kinds = completeSet(userId, we, set.id, v);
    setEdits({});
    if (kinds === null) {
      toast({ kind: "info", message: `Add ${cols.map((c) => c.label.toLowerCase()).join(" and ")} first` });
      return;
    }
    onCompleted(v, kinds);
  };

  const pr = set.done && set.prKinds.length > 0;
  return (
    <View
      style={[
        styles.tableRow,
        styles.setRow,
        { borderRadius: radius.sm },
        set.done ? { backgroundColor: pr ? colors.surfaceHighest : colors.surfaceHigh } : null,
      ]}
    >
      <Pressable
        onLongPress={() => {
          removeSet(userId, we, set.id);
          toast({ kind: "info", message: `Set ${index + 1} removed`, onUndo: () => restoreSet(userId, we, set) });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Set ${index + 1}${pr ? ", personal record" : ""}`}
        accessibilityHint="Long press to remove this set"
        style={styles.colSet}
      >
        {pr ? (
          <Icon name="trophy" size={20} color={colors.primaryText} filled />
        ) : (
          <Text variant="label-lg" tabular>
            {String(index + 1)}
          </Text>
        )}
      </Pressable>
      <Text variant="body" color="textTertiary" style={styles.colPrev} numberOfLines={1} tabular>
        {previous ? formatSet(we.type, previous) : "—"}
      </Text>
      {cols.map((c) => (
        <TextInput
          key={c.field}
          value={shown(c.field)}
          placeholder={hint(c.field)}
          placeholderTextColor={colors.textTertiary}
          onChangeText={(t) => setEdits((e) => ({ ...e, [c.field]: t }))}
          onEndEditing={commit}
          keyboardType={
            c.field === "reps" || (c.field === "durationS" && we.type === "time") ? "number-pad" : "decimal-pad"
          }
          selectTextOnFocus
          accessibilityLabel={`Set ${index + 1} ${c.label}`}
          style={[
            type["label-lg"],
            styles.colField,
            styles.input,
            {
              color: colors.textPrimary,
              backgroundColor: set.done ? "transparent" : colors.surface,
              borderRadius: radius.xs,
            },
          ]}
        />
      ))}
      <View style={styles.colCheck}>
        <PressableScale
          onPress={toggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.done }}
          accessibilityLabel={`Set ${index + 1} done`}
          style={[
            styles.check,
            { borderRadius: radius.xs, backgroundColor: set.done ? colors.primary : colors.surfaceHighest },
          ]}
        >
          <Icon name="check" size={20} color={set.done ? colors.ink : colors.textSecondary} />
        </PressableScale>
      </View>
    </View>
  );
}

// ── P20 rest timer bar ─────────────────────────────────────────────────────────────────────────

/** Pinned to the bottom of S24 while a rest is running: "1:24" · −15 s · +15 s · Skip. */
export function RestTimerBar() {
  const { colors, radius, elevation } = useTheme();
  const { endsAt, totalS, label } = useRestTimer();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (endsAt === null) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <View
      style={[
        styles.rest,
        { backgroundColor: colors.surfaceHighest, borderRadius: radius.lg, boxShadow: elevation.card },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.restTop}>
        <Icon name="timer" size={24} color={colors.primaryText} />
        <View style={styles.flex}>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {label ? `Rest · ${label}` : "Rest"}
          </Text>
          <Text variant="headline-md" tabular accessibilityLabel={`Rest, ${left} seconds left`}>
            {formatClock(left)}
          </Text>
        </View>
        <IconButton
          icon="remove"
          accessibilityLabel={`${REST_STEP_S} seconds less`}
          onPress={() => restTimer.adjust(-REST_STEP_S)}
        />
        <IconButton
          icon="add"
          accessibilityLabel={`${REST_STEP_S} seconds more`}
          onPress={() => restTimer.adjust(REST_STEP_S)}
        />
        <IconButton icon="skip_next" accessibilityLabel="Skip rest" variant="filled" onPress={restTimer.skip} />
      </View>
      <ProgressBar progress={totalS ? left / totalS : 0} color={colors.primary} accessibilityLabel="Rest time left" />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5 },
  flex: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  shrink: { flexShrink: 1 },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  setRow: { minHeight: 48, paddingHorizontal: 2 },
  colSet: { width: 32, alignItems: "center", justifyContent: "center", textAlign: "center" },
  colPrev: { flex: 1 },
  colField: { width: 62 },
  colCheck: { width: 44, alignItems: "center" },
  input: { minHeight: 40, textAlign: "center", paddingVertical: 6 },
  check: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  rest: { padding: 12, gap: 8 },
  restTop: { flexDirection: "row", alignItems: "center", gap: 8 },
});
