// Progress cards (DESIGN.md §7.2): PhaseCard (S33, S36), StreakCard (S33), StreakCalendar (S40), the weekly stats
// grid (S33) and the "check-in ready" card (S10, S33).
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Button, Card, ProgressBar, StatTile, Text } from "@/core/ui";
import { formatInt, formatKg, formatShortDate } from "@/features/targets/format";
import { dayNumber, goalProgress, trendOn, type PhaseSummary, type TrendPoint } from "@shared/domain/progress";
import type { Streak, StreakDayState } from "@shared/domain/streak";
import { GOAL_LABEL } from "@/features/onboarding/copy";
import { streakDays, trendWords } from "./copy";
import type { Phase } from "./phases";

/** "week 5 of 9" (or "week 5" without a planned end). */
export function phaseWeek(p: Pick<Phase, "startDate" | "endDate">, today: string): string {
  const week = Math.max(1, Math.floor((dayNumber(today) - dayNumber(p.startDate)) / 7) + 1);
  if (!p.endDate) return `week ${week}`;
  const total = Math.max(1, Math.ceil((dayNumber(p.endDate) - dayNumber(p.startDate) + 1) / 7));
  return `week ${Math.min(week, total)} of ${total}`;
}

/** Progress to the target weight when there is one, else through the planned dates. */
export function phaseProgress(p: Phase, series: readonly TrendPoint[], today: string): number | null {
  const start = trendOn(series, p.startDate) ?? series.find((s) => s.date >= p.startDate)?.trendKg ?? null;
  const toGoal = goalProgress(start, p.targetWeightKg, trendOn(series, today));
  if (toGoal != null) return toGoal;
  if (!p.endDate) return null;
  const total = dayNumber(p.endDate) - dayNumber(p.startDate);
  return total > 0 ? Math.min(1, Math.max(0, (dayNumber(today) - dayNumber(p.startDate)) / total)) : 1;
}

/** "9 weeks · −4.2 kg · avg 138 g protein · 31 workouts · 4 PRs" */
export function summaryLine(s: PhaseSummary): string {
  return [
    `${s.weeks} ${s.weeks === 1 ? "week" : "weeks"}`,
    s.changeKg != null
      ? `${s.changeKg < 0 ? "−" : s.changeKg > 0 ? "+" : "±"}${formatKg(Math.abs(s.changeKg))} kg`
      : null,
    s.avgProteinG != null ? `avg ${Math.round(s.avgProteinG)} g protein` : null,
    `${s.workouts} ${s.workouts === 1 ? "workout" : "workouts"}`,
    `${s.prs} ${s.prs === 1 ? "PR" : "PRs"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function PhaseCard({
  phase,
  series,
  today,
  onPress,
}: {
  phase: Phase;
  series: readonly TrendPoint[];
  today: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  if (phase.closedDate) {
    return (
      <Card onPress={onPress} accessibilityLabel={`${phase.name}, closed`}>
        <Text variant="title">{phase.name}</Text>
        <Text variant="body" color="textSecondary">
          {phase.summary
            ? summaryLine(phase.summary)
            : `${formatShortDate(phase.startDate)} – ${formatShortDate(phase.closedDate)}`}
        </Text>
      </Card>
    );
  }
  const progress = phaseProgress(phase, series, today);
  return (
    <Card
      variant="raised"
      eyebrow="Active phase"
      onPress={onPress}
      accessibilityLabel={`${phase.name}, ${phaseWeek(phase, today)}`}
    >
      <View style={styles.row}>
        <Text variant="headline-sm" style={styles.flex} numberOfLines={1}>
          {phase.name}
        </Text>
        <Text variant="label" color="textSecondary">
          {phaseWeek(phase, today)}
        </Text>
      </View>
      <Text variant="caption" color="textSecondary">
        {[GOAL_LABEL[phase.goal], phase.targetWeightKg != null ? `goal ${formatKg(phase.targetWeightKg)} kg` : null]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {progress != null ? (
        <View style={styles.bar}>
          <ProgressBar
            progress={progress}
            color={colors.primary}
            accessibilityLabel={`${Math.round(progress * 100)}% of the phase`}
          />
        </View>
      ) : null}
    </Card>
  );
}

export function StreakCard({ streak, onPress }: { streak: Streak; onPress: () => void }) {
  const { colors } = useTheme();
  const toGo = streak.nextMilestone != null ? streak.nextMilestone - streak.current : null;
  return (
    <Card onPress={onPress} accessibilityLabel={`Streak ${streakDays(streak.current)}`}>
      <View style={styles.row}>
        <Icon name="local_fire_department" size={28} color={colors.streak} filled />
        <View style={styles.flex}>
          <Text variant="headline-sm" tabular>
            {streakDays(streak.current)}
          </Text>
          <Text variant="caption" color={streak.atRisk ? "warn" : "textSecondary"}>
            {streak.atRisk
              ? "Log anything today to keep it"
              : `Best ${streak.best} · ${streak.freezes} ${streak.freezes === 1 ? "freeze" : "freezes"}${
                  toGo != null ? ` · ${streak.nextMilestone} in ${toGo}` : ""
                }`}
          </Text>
        </View>
        <Icon name="chevron_right" color={colors.textTertiary} />
      </View>
    </Card>
  );
}

/** S10 header flame (brand §8; replaces the P10 placeholder). Amber when the streak is at risk tonight. */
export function StreakChip({ streak }: { streak: Streak | null }) {
  const { colors, radius } = useTheme();
  const n = streak?.current ?? 0;
  return (
    <View
      accessibilityLabel={n ? `Streak ${streakDays(n)}${streak?.atRisk ? ", at risk" : ""}` : "No streak yet"}
      style={[
        styles.chip,
        { backgroundColor: streak?.atRisk ? colors.warnContainer : colors.surfaceHigh, borderRadius: radius.full },
      ]}
    >
      <Icon name="local_fire_department" size={16} color={streak?.atRisk ? colors.warn : colors.streak} filled />
      <Text variant="label" tabular>
        {n ? String(n) : "No streak yet"}
      </Text>
    </View>
  );
}

export function WeekStats({
  avgKcal,
  avgProteinG,
  workouts,
  km,
}: {
  avgKcal: number | null;
  avgProteinG: number | null;
  workouts: number;
  km: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        <StatTile
          value={avgKcal != null ? formatInt(avgKcal) : "–"}
          unit="kcal / day"
          label="Avg calories"
          color={colors.dataKcal}
        />
        <StatTile
          value={avgProteinG != null ? formatInt(avgProteinG) : "–"}
          unit="g / day"
          label="Avg protein"
          color={colors.dataProtein}
        />
      </View>
      <View style={styles.gridRow}>
        <StatTile
          value={String(workouts)}
          unit={workouts === 1 ? "workout" : "workouts"}
          label="Gym"
          color={colors.secondary}
        />
        <StatTile value={String(+km.toFixed(1))} unit="km" label="Distance" color={colors.dataActivity} />
      </View>
    </View>
  );
}

export function CheckinReadyCard({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Card variant="highlighted" accessibilityLabel="Your weekly check-in is ready">
      <Text variant="eyebrow" color="ink">
        Weekly check-in
      </Text>
      <Text variant="title" color="ink">
        {title}
      </Text>
      <Button label="See your check-in" variant="secondary" size="sm" onPress={onPress} />
    </Card>
  );
}

/** One weekly trend line under the chart: "Trend 74.6 kg · ▼0.4 this week". */
export function trendHeadline(latest: TrendPoint | null, weekChange: number | null): string {
  if (!latest) return "No weigh-ins yet";
  return `Trend ${formatKg(latest.trendKg)} kg${weekChange != null ? ` · ${trendWords(weekChange)} this week` : ""}`;
}

const WEEK_HEAD = ["S", "M", "T", "W", "T", "F", "S"];

/** S40 month calendar: filled logged days, snowflakes on frozen days. */
export function StreakCalendar({
  month,
  states,
  today,
}: {
  /** Any date in the month to show (YYYY-MM-DD). */
  month: string;
  states: ReadonlyMap<string, StreakDayState>;
  today: string;
}) {
  const { colors, radius } = useTheme();
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <View style={styles.calendar}>
      <View style={styles.calRow}>
        {WEEK_HEAD.map((d, i) => (
          <Text key={i} variant="caption" color="textTertiary" style={styles.calCell} align="center">
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calRow}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={styles.calCell} />;
            const state = states.get(date);
            const isToday = date === today;
            return (
              <View
                key={date}
                accessibilityLabel={`${date}: ${state ?? (date > today ? "upcoming" : "no log")}`}
                style={[
                  styles.calCell,
                  styles.calDay,
                  {
                    borderRadius: radius.full,
                    backgroundColor:
                      state === "logged" ? colors.streak : state === "frozen" ? colors.surfaceHighest : "transparent",
                    borderColor: isToday ? colors.textPrimary : "transparent",
                  },
                ]}
              >
                {state === "frozen" ? (
                  <Icon name="ac_unit" size={16} color={colors.secondaryText} />
                ) : (
                  <Text
                    variant="caption"
                    color={state === "logged" ? "ink" : date > today ? "textTertiary" : "textSecondary"}
                    tabular
                  >
                    {String(Number(date.slice(8)))}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  bar: { marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12 },
  grid: { gap: 8 },
  gridRow: { flexDirection: "row", gap: 8 },
  calendar: { gap: 6 },
  calRow: { flexDirection: "row", justifyContent: "space-between" },
  calCell: { width: 36, height: 36 },
  calDay: { alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
});
