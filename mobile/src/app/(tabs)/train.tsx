// S22 · Train hub (P19, routines P21). Layout from the S22 export (D11): title + this-week pill, the lime
// "Start empty workout" hero (or "Resume" while one is open), My routines (P21), Record activity (runs
// arrive in P25), this week's volume by day, recent sessions, and the exercise library.
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { useTheme } from "@/core/theme";
import { Badge, Button, Card, EmptyState, ListItem, PressableScale, Screen, Text, useToast } from "@/core/ui";
import { AppHeader } from "@/features/shell/AppHeader";
import { getExercise, useExercises } from "@/features/gym/catalog";
import { ExerciseTile } from "@/features/gym/components";
import { formatDuration, formatElapsed, formatVolume, relativeDay } from "@/features/gym/format";
import { startRoutine, useRoutines, type Routine } from "@/features/gym/routines";
import {
  startWorkout,
  useActiveWorkout,
  useRecentWorkouts,
  useWorkoutsBetween,
  workoutStats,
  type Workout,
} from "@/features/gym/store";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";
import { CATEGORY_LABEL } from "@shared/domain/gym";
import { ActivityHistory } from "@/features/activity/history";

const ACTIVITIES: { icon: IconName; label: string; hint: string }[] = [
  { icon: "directions_run", label: "Run", hint: "Pace · splits" },
  { icon: "directions_walk", label: "Walk", hint: "Distance · steps" },
  { icon: "directions_bike", label: "Ride", hint: "Speed · distance" },
  { icon: "hiking", label: "Hike", hint: "Distance · time" },
];

/** Monday-to-Sunday local dates of the week containing `d`. */
function weekDays(d: Date): string[] {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return localDate(x);
  });
}

export default function Train() {
  const { colors, radius, layout } = useTheme();
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const active = useActiveWorkout(userId);
  const recent = useRecentWorkouts(userId, 5);
  const { routines, lastDone } = useRoutines(userId);
  const exercises = useExercises(userId);
  const now = new Date();
  const days = weekDays(now);
  const week = useWorkoutsBetween(userId, days[0]!, days[6]!);
  const weekVolume = week.reduce((sum, w) => sum + workoutStats(w).volumeKg, 0);

  const open = () => {
    if (!userId) return;
    if (!active) startWorkout(userId);
    router.push("/train/workout");
  };

  const start = (r: Routine) => {
    if (!userId) return;
    if (active) {
      toast({ kind: "info", message: "Finish or discard the open workout first" });
      router.push("/train/workout");
      return;
    }
    startRoutine(userId, r, (id) => getExercise(userId, id));
    router.push("/train/workout");
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

      <Card
        variant="highlighted"
        glow
        onPress={open}
        accessibilityLabel={active ? `Resume ${active.name}` : "Start empty workout"}
      >
        <Text variant="eyebrow" color="ink">
          {active ? "In progress" : "Workout"}
        </Text>
        <Text variant="display" color="ink" style={styles.heroTitle}>
          {active ? "Resume workout" : "Start empty workout"}
        </Text>
        <Text variant="body" color="ink">
          {active
            ? `${active.name} · ${formatElapsed(active.startedAt, now.getTime())} · ${workoutStats(active).sets} sets done`
            : "Log sets as you go. Last session's numbers are filled in for you."}
        </Text>
        <View style={styles.heroFoot}>
          <View style={[styles.heroPill, { backgroundColor: colors.ink, borderRadius: radius.full }]}>
            <Icon name="timer" size={16} color={colors.primary} />
            <Text variant="label" style={{ color: colors.primary }}>
              {active ? "Running" : "Rest timer ready"}
            </Text>
          </View>
          <View style={[styles.heroFab, { backgroundColor: colors.ink, borderRadius: radius.full }]}>
            <Icon name={active ? "play_arrow" : "add"} size={28} color={colors.primary} />
          </View>
        </View>
      </Card>

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
          Record activity
        </Text>
      </View>
      <View style={styles.grid}>
        {ACTIVITIES.map((a) => (
          <PressableScale
            key={a.label}
            onPress={() =>
              a.label === "Hike"
                ? router.push({ pathname: "/coming-soon", params: { feature: "Hike recording" } })
                : router.push({ pathname: "/activity/record", params: { kind: a.label.toLowerCase() } })
            }
            accessibilityRole="button"
            accessibilityLabel={`Record a ${a.label.toLowerCase()}`}
            accessibilityHint={a.label === "Hike" ? "Coming soon" : "Open the GPS recorder"}
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
            <View style={styles.flex}>
              <Text variant="title">{a.label}</Text>
              <Text variant="caption" color="textSecondary">
                {a.hint}
              </Text>
            </View>
          </PressableScale>
        ))}
      </View>

      <WeekVolume days={days} workouts={week} today={localDate(now)} />
      <ActivityHistory userId={userId} />

      <View style={styles.sectionHead}>
        <Text variant="headline-sm" accessibilityRole="header">
          Recent sessions
        </Text>
      </View>
      {recent.length ? (
        recent.map((w) => <SessionCard key={w.id} workout={w} />)
      ) : (
        <EmptyState
          icon="fitness_center"
          title="No workouts yet"
          body="Start one above. Sets, PRs and volume show up here."
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

function RoutineCard({
  routine,
  lastDone,
  tint,
  onStart,
}: {
  routine: Routine;
  lastDone: string | undefined;
  tint: "lilac" | "orchid";
  onStart: () => void;
}) {
  const { colors, radius } = useTheme();
  const bg = tint === "orchid" ? colors.tertiary : colors.secondary;
  const groups = [...new Set(routine.exercises.map((e) => e.category).filter((c) => c !== null))]
    .slice(0, 3)
    .map((c) => CATEGORY_LABEL[c]);
  return (
    <PressableScale
      onPress={() => router.push({ pathname: "/train/routine/[id]", params: { id: routine.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${routine.name}, ${routine.exercises.length} exercises. Opens the editor.`}
      style={[styles.routine, { backgroundColor: bg, borderRadius: radius.xl }]}
    >
      <Text variant="headline-sm" color="ink" numberOfLines={1}>
        {routine.name}
      </Text>
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
          {lastDone ? `Last: ${relativeDay(lastDone)}` : "Not done yet"}
        </Text>
        <PressableScale
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={`Start ${routine.name}`}
          style={[styles.play, { backgroundColor: colors.ink, borderRadius: radius.full }]}
        >
          <Icon name="play_arrow" size={24} color={bg} filled />
        </PressableScale>
      </View>
    </PressableScale>
  );
}

function WeekVolume({ days, workouts, today }: { days: string[]; workouts: Workout[]; today: string }) {
  const { colors, radius } = useTheme();
  const byDay = days.map((d) => {
    const ws = workouts.filter((w) => w.localDate === d);
    return { day: d, volume: ws.reduce((s, w) => s + workoutStats(w).volumeKg, 0), sessions: ws.length };
  });
  const max = Math.max(1, ...byDay.map((d) => d.volume));
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <Card eyebrow="This week">
      <Text variant="title">Volume by day</Text>
      <Text variant="caption" color="textSecondary">
        kg lifted (weight × reps) per day
      </Text>
      <View
        style={styles.bars}
        accessible
        accessibilityLabel={byDay.map((d, i) => `${labels[i]} ${formatVolume(d.volume)}`).join(", ")}
      >
        {byDay.map((d, i) => {
          const h = d.volume ? 16 + (d.volume / max) * 84 : d.sessions ? 16 : 8;
          const isToday = d.day === today;
          return (
            <View key={d.day} style={styles.barCol}>
              <View
                style={{
                  width: 22,
                  height: h,
                  borderRadius: radius.full,
                  backgroundColor:
                    d.volume || d.sessions ? (isToday ? colors.primary : colors.secondary) : colors.surfaceHigh,
                }}
              />
              <Text variant="caption" color={isToday ? "primaryText" : "textSecondary"}>
                {labels[i]!}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function SessionCard({ workout }: { workout: Workout }) {
  const { colors } = useTheme();
  const stats = workoutStats(workout);
  const category = workout.exercises[0]?.category ?? null;
  return (
    <Card
      onPress={() => router.push({ pathname: "/train/summary/[id]", params: { id: workout.id } })}
      accessibilityLabel={`${workout.name}, ${relativeDay(workout.startedAt)}, ${formatVolume(stats.volumeKg)}, ${stats.prs.length} PRs`}
    >
      <View style={styles.inline}>
        <ExerciseTile category={category} />
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={1}>
            {workout.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {`${relativeDay(workout.startedAt)} · ${workout.exercises.length} exercises`}
          </Text>
        </View>
        {stats.prs.length ? (
          <Badge label={`${stats.prs.length} PR${stats.prs.length > 1 ? "s" : ""}`} tone="lime" icon="trophy" />
        ) : null}
        {!workout.synced ? <Icon name="cloud_off" size={16} color={colors.textTertiary} /> : null}
      </View>
      <View style={styles.statRow}>
        <Stat label="Duration" value={formatDuration(stats.durationS)} />
        <Stat label="Volume" value={formatVolume(stats.volumeKg)} />
        <Stat label="Sets" value={String(stats.sets)} />
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flex}>
      <Text variant="unit" color="textSecondary">
        {label}
      </Text>
      <Text variant="title" tabular>
        {value}
      </Text>
    </View>
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
  routineChips: { flexDirection: "row", gap: 6, marginTop: 8 },
  routineChip: { paddingHorizontal: 10, paddingVertical: 4 },
  routineFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  play: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridSlot: { width: "47%", flexGrow: 1 },
  activity: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1 },
  activityIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  bars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 132, marginTop: 12 },
  barCol: { alignItems: "center", gap: 6 },
  statRow: { flexDirection: "row", gap: 12, marginTop: 12 },
});
