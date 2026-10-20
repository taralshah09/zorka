// S22 · Train hub (P19, routines P21). Layout from the S22 export (D11), reshaped by UX T3/T5 into one decision and
// one list: title + this-week pill, the lime hero (today's workout once something's logged, else an open GPS
// activity, else the routine that's up next, else "log today's workout"), My routines (tap adds it to today, pencil
// edits), Strength analytics, Record (Run · Walk · Ride), Recent (3, merged gym + GPS, "See all"), and the exercise
// library. One workout per day: a routine already in today's workout shows a check.
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { useTheme } from "@/core/theme";
import { Badge, Button, Card, EmptyState, ListItem, PressableScale, Screen, Text, useToast } from "@/core/ui";
import { AppHeader } from "@/features/shell/AppHeader";
import { activeActivity, useActivityClock } from "@/features/activity/store";
import { getExercise, useExercises } from "@/features/gym/catalog";
import { formatVolume, relativeDay, weekDays } from "@/features/gym/format";
import { RecentCard, useRecentTraining } from "@/features/gym/recent";
import { nextRoutine, startRoutine, useRoutines, type Routine } from "@/features/gym/routines";
import { useActiveWorkout, useWorkoutsBetween, workoutStats } from "@/features/gym/store";
import { useActiveUser } from "@/features/users/activeUser";
import { CATEGORY_LABEL } from "@shared/domain/gym";
import { ACTIVITY_LABEL } from "@shared/domain/activity";
import { chooseRest, restChosen, useRestChoiceVersion } from "@/features/gym/prepared";
import { preferencesFor, usePreferencesVersion } from "@/features/meals/preferences";
import { localDate } from "@shared/domain/food";

const ACTIVITIES: { icon: IconName; kind: "run" | "walk" | "ride"; label: string; hint: string }[] = [
  { icon: "directions_run", kind: "run", label: "Run", hint: "Pace · splits" },
  { icon: "directions_walk", kind: "walk", label: "Walk", hint: "Distance · pace" },
  { icon: "directions_bike", kind: "ride", label: "Ride", hint: "Speed · distance" },
];

const RECENT_COUNT = 3;

type Hero = {
  eyebrow: string;
  title: string;
  body: string;
  pill: string;
  fab: IconName;
  label: string;
  onPress: () => void;
};

export default function Train() {
  const { colors, radius, layout } = useTheme();
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  useRestChoiceVersion((s) => s.v);
  usePreferencesVersion((s) => s.v);
  const active = useActiveWorkout(userId);
  const clock = useActivityClock();
  const recording = activeActivity();
  const openActivity = recording?.userId === userId ? recording : null;
  const recent = useRecentTraining(userId, RECENT_COUNT + 1);
  const { routines, lastDone } = useRoutines(userId);
  const exercises = useExercises(userId);
  const now = new Date(clock);
  const days = weekDays(now);
  const week = useWorkoutsBetween(userId, days[0]!, days[6]!);
  const weekVolume = week.reduce((sum, w) => sum + workoutStats(w).volumeKg, 0);
  const upNext = routines.find((r) => r.id === preferencesFor(userId).routineId) ?? nextRoutine(routines, lastDone);
  const resting = restChosen(userId, localDate(now));

  // One workout per day: everything goes into today's, made on first use.
  const openToday = () => {
    if (!userId) return;
    if (active?.exercises.length) router.push("/train/workout");
    else router.push({ pathname: "/train/exercises", params: { mode: "workout" } });
  };

  const start = (r: Routine) => {
    if (!userId) return;
    startRoutine(userId, r, (id) => getExercise(userId, id));
    toast({ kind: "info", message: `${r.name} added to today's workout` });
    router.push("/train/workout");
  };

  const todaySets = active ? workoutStats(active).sets : 0;
  const hero: Hero = active?.exercises.length
    ? {
        eyebrow: "Today",
        title: "Today's workout",
        body: `${active.name} · ${todaySets} ${todaySets === 1 ? "set" : "sets"} logged · log more any time today`,
        pill: "Saved as you go",
        fab: "add",
        label: `Open ${active.name}`,
        onPress: openToday,
      }
    : openActivity
      ? {
          eyebrow: openActivity.status === "paused" ? "Paused" : "Recording",
          title: `Resume ${ACTIVITY_LABEL[openActivity.kind].toLowerCase()}`,
          body: "Your route is saved. Open the recorder to carry on or stop.",
          pill: openActivity.status === "paused" ? "Paused" : "Recording",
          fab: openActivity.status === "paused" ? "play_arrow" : "pause",
          label: `Resume ${ACTIVITY_LABEL[openActivity.kind].toLowerCase()}`,
          onPress: () => router.push({ pathname: "/activity/live", params: { id: openActivity.id } }),
        }
      : resting
        ? { eyebrow: "Rest chosen", title: "Rest today", body: "Your earlier sessions are still here. No workout is recorded for a rest choice.", pill: "Rest", fab: "bedtime", label: "Change today's training choice", onPress: () => router.push("/train/prepare") }
      : upNext
        ? {
            eyebrow: "Up next",
            title: upNext.name,
            body: `${lastDone.get(upNext.id) ? `Last done ${relativeDay(lastDone.get(upNext.id)!).toLowerCase()}` : "Not done yet"} · ${upNext.exercises.length} exercises`,
            pill: "Rest timer ready",
            fab: "play_arrow",
            label: `Start ${upNext.name}`,
            onPress: () => router.push({ pathname: "/train/prepare", params: { routineId: upNext.id } }),
          }
        : {
            eyebrow: "Today",
            title: "Log today's workout",
            body: "Pick your exercises and log sets whenever you do them. It all goes into one workout for the day.",
            pill: "Saved as you go",
            fab: "add",
            label: "Log today's workout",
            onPress: openToday,
          };

  return (
    <Screen withDock header={<AppHeader eyebrow="Train" />}>
      <NetworkBanner />

      <View style={styles.titleRow}>
        <Text variant="headline-lg" accessibilityRole="header">
          Train
        </Text>
        <View
          style={[
            styles.weekPill,
            { backgroundColor: colors.surfaceLow, borderColor: colors.outline, borderRadius: radius.full },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
          <Text variant="label" tabular>
            {`${formatVolume(weekVolume)} · ${week.length} ${week.length === 1 ? "session" : "sessions"} this week`}
          </Text>
        </View>
      </View>

      <Card variant="highlighted" glow onPress={hero.onPress} accessibilityLabel={hero.label}>
        <Text variant="eyebrow" color="ink">
          {hero.eyebrow}
        </Text>
        <Text variant="display" color="ink" style={styles.heroTitle} numberOfLines={2}>
          {hero.title}
        </Text>
        <Text variant="body" color="ink">
          {hero.body}
        </Text>
        <View style={styles.heroFoot}>
          <View style={[styles.heroPill, { backgroundColor: colors.ink, borderRadius: radius.full }]}>
            <Icon name="timer" size={16} color={colors.primary} />
            <Text variant="label" style={{ color: colors.primary }}>
              {hero.pill}
            </Text>
          </View>
          <View style={[styles.heroFab, { backgroundColor: colors.ink, borderRadius: radius.full }]}>
            <Icon name={hero.fab} size={28} color={colors.primary} />
          </View>
        </View>
      </Card>
      {!active?.exercises.length && !openActivity ? <Card>
        <Text variant="body">{resting ? "Rest chosen for today. No workout has been recorded." : "Rest is an available choice."}</Text>
        <Button label={resting ? "Change rest choice" : "Rest today"} variant="ghost" onPress={() => userId && chooseRest(userId, localDate(now), !resting)} />
        {upNext ? <Button label="See shorter session" variant="secondary" onPress={() => router.push({ pathname: "/train/prepare", params: { routineId: upNext.id } })} /> : null}
      </Card> : null}
      {!active?.exercises.length && !openActivity && upNext ? (
        <Button label="Add exercises to today" icon="add" variant="ghost" onPress={openToday} />
      ) : null}
      <Button label="Strength analytics" icon="show_chart" variant="ghost" onPress={() => router.push("/train/analytics")} />

      <View style={styles.sectionHead}>
        <View style={styles.sectionTitle}>
          <Text variant="headline-sm" accessibilityRole="header">
            My routines
          </Text>
          {routines.length ? <Badge label={String(routines.length)} /> : null}
        </View>
        <Button
          label="New routine"
          size="sm"
          variant="secondary"
          icon="add"
          onPress={() => router.push("/train/routine/new")}
        />
      </View>
      {routines.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routineRow}>
          {routines.map((r, i) => (
            <RoutineCard
              key={r.id}
              routine={r}
              lastDone={lastDone.get(r.id)}
              tint={i % 2 ? "orchid" : "lilac"}
              running={active?.routineId === r.id && active.exercises.length ? "In today's workout" : null}
              onStart={() => start(r)}
            />
          ))}
        </ScrollView>
      ) : (
        <Card onPress={() => router.push("/train/routine/new")} accessibilityLabel="Build your first routine">
          <View style={styles.inline}>
            <Icon name="add_circle" color={colors.secondaryText} />
            <View style={styles.flex}>
              <Text variant="title">Build your first routine</Text>
              <Text variant="caption" color="textSecondary">
                Push, pull, legs… save the exercises once and start them in one tap.
              </Text>
            </View>
          </View>
        </Card>
      )}

      <View style={styles.sectionHead}>
        <Text variant="headline-sm" accessibilityRole="header">
          Record
        </Text>
      </View>
      <View style={styles.grid}>
        {ACTIVITIES.map((a) => (
          <PressableScale
            key={a.kind}
            onPress={() => router.push({ pathname: "/activity/record", params: { kind: a.kind } })}
            accessibilityRole="button"
            accessibilityLabel={`Record a ${a.label.toLowerCase()}`}
            accessibilityHint="Open the GPS recorder"
            containerStyle={styles.gridSlot}
            style={[
              styles.activity,
              {
                backgroundColor: colors.surfaceLow,
                borderColor: colors.outline,
                borderRadius: radius.lg,
                padding: layout.cardPadding,
              },
            ]}
          >
            <View style={[styles.activityIcon, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}>
              <Icon name={a.icon} size={20} color={colors.primaryText} />
            </View>
            <Text variant="title">{a.label}</Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {a.hint}
            </Text>
          </PressableScale>
        ))}
      </View>

      <View style={styles.sectionHead}>
        <Text variant="headline-sm" accessibilityRole="header">
          Recent
        </Text>
        {recent.length > RECENT_COUNT ? (
          <Button label="See all" size="sm" variant="ghost" onPress={() => router.push("/train/history")} />
        ) : null}
      </View>
      {recent.length ? (
        recent
          .slice(0, RECENT_COUNT)
          .map((item) => <RecentCard key={item.kind === "workout" ? item.workout.id : item.activity.id} item={item} />)
      ) : (
        <EmptyState
          icon="fitness_center"
          title="No training yet"
          body="Start a workout or record a walk. Sets, PRs and routes show up here."
        />
      )}

      <Card flush>
        <ListItem
          icon="menu_book"
          title="Exercise library"
          subtitle={`${exercises.length} exercises · how-to from MuscleWiki`}
          chevron
          onPress={() => router.push({ pathname: "/train/exercises", params: { mode: "browse" } })}
        />
      </Card>
    </Screen>
  );
}

/** UX T3: tapping the card starts the routine; the pencil opens the editor. */
function RoutineCard({
  routine,
  lastDone,
  tint,
  running,
  onStart,
}: {
  routine: Routine;
  lastDone: string | undefined;
  tint: "lilac" | "orchid";
  /** Set when this routine is already in today's workout; null otherwise. */
  running: string | null;
  onStart: () => void;
}) {
  const { colors, radius } = useTheme();
  const bg = tint === "orchid" ? colors.tertiary : colors.secondary;
  const groups = [...new Set(routine.exercises.map((e) => e.category).filter((c) => c !== null))]
    .slice(0, 3)
    .map((c) => CATEGORY_LABEL[c]);
  return (
    <PressableScale
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={
        running
          ? `${routine.name} is in today's workout. Open it`
          : `Add ${routine.name} to today, ${routine.exercises.length} exercises`
      }
      style={[styles.routine, { backgroundColor: bg, borderRadius: radius.xl }]}
    >
      <View style={styles.routineHead}>
        <Text variant="headline-sm" color="ink" numberOfLines={1} style={styles.flex}>
          {routine.name}
        </Text>
        <PressableScale
          onPress={() => router.push({ pathname: "/train/routine/[id]", params: { id: routine.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${routine.name}`}
          hitSlop={8}
          style={[styles.edit, { borderColor: colors.ink, borderRadius: radius.full }]}
        >
          <Icon name="edit" size={20} color={colors.ink} />
        </PressableScale>
      </View>
      <Text variant="caption" color="ink" numberOfLines={1}>
        {groups.join(", ") || "Custom"}
      </Text>
      <View style={styles.routineChips}>
        <View style={[styles.routineChip, { backgroundColor: colors.ink, borderRadius: radius.full }]}>
          <Text variant="caption" style={{ color: bg }}>
            {`${routine.exercises.length} exercises`}
          </Text>
        </View>
      </View>
      <View style={styles.routineFoot}>
        <Text variant="caption" color="ink">
          {running ? running : lastDone ? `Last: ${relativeDay(lastDone)}` : "Not done yet"}
        </Text>
        <View style={[styles.play, { backgroundColor: colors.ink, borderRadius: radius.full }]}>
          <Icon name={running ? "check" : "add"} size={24} color={bg} filled />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  titleRow: { gap: 8 },
  weekPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  heroTitle: { marginTop: 8, marginBottom: 4 },
  heroFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  heroFab: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  routineRow: { gap: 12, paddingRight: 16 },
  routine: { width: 240, padding: 16, gap: 4 },
  routineHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  edit: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  routineChips: { flexDirection: "row", gap: 6, marginTop: 8 },
  routineChip: { paddingHorizontal: 10, paddingVertical: 4 },
  routineFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  play: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, gap: 2 },
  grid: { flexDirection: "row", gap: 8 },
  gridSlot: { flex: 1 },
  activity: { gap: 6, borderWidth: 1 },
  activityIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
