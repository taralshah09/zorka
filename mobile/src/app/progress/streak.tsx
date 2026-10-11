// S40 · Streak detail (P30). No export yet (D53): built from DESIGN.md §6.7 — current and best streak, a month
// calendar with logged days filled and frozen days marked with a snowflake, freezes available, the next milestone, and
// what counts as a day (D52). P38: Share (streak card) from 7 days.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Button, Card, Header, IconButton, Screen, Text } from "@/core/ui";
import { useActivityClock } from "@/features/activity/store";
import { StreakCalendar } from "@/features/progress/components";
import { streakDays } from "@/features/progress/copy";
import { useProgress } from "@/features/progress/hooks";
import { AT_RISK_HOUR, FREEZE_EARN_DAYS, MAX_FREEZES, STREAK_MILESTONES } from "@shared/domain/streak";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** First day of the month `by` months from `month` (YYYY-MM-DD). */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 10);
}

export default function StreakScreen() {
  const { colors } = useTheme();
  const p = useProgress(useActivityClock());
  const s = p.streak;
  const [month, setMonth] = useState(() => `${p.today.slice(0, 7)}-01`);
  const states = useMemo(() => new Map((s?.days ?? []).map((d) => [d.date, d.state])), [s]);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstLog = s?.days[0]?.date;
  const canBack = !!firstLog && `${firstLog.slice(0, 7)}-01` < month;
  const canForward = month < `${p.today.slice(0, 7)}-01`;

  return (
    <Screen header={<Header title="Streak" onBack={() => router.back()} />}>
      <Card variant="raised" accessibilityLabel={`Current streak ${streakDays(s?.current ?? 0)}, best ${s?.best ?? 0}`}>
        <View style={styles.hero}>
          <Icon name="local_fire_department" size={28} color={s?.atRisk ? colors.warn : colors.streak} filled />
          <Text variant="display-xl" tabular>
            {String(s?.current ?? 0)}
          </Text>
          <Text variant="title" color="textSecondary">
            {(s?.current ?? 0) === 1 ? "day" : "days"}
          </Text>
          <Text variant="body" color="textSecondary">{`Best ${streakDays(s?.best ?? 0)}`}</Text>
          {s?.atRisk ? (
            <Text variant="label" color="warn">
              Log anything today to keep your streak.
            </Text>
          ) : s?.todayLogged ? (
            <Text variant="label" color="primaryText">
              Today counts ✓
            </Text>
          ) : null}
          {(s?.current ?? 0) >= STREAK_MILESTONES[0] ? (
            <Button
              label="Share streak"
              icon="ios_share"
              variant="secondary"
              size="sm"
              onPress={() => router.push({ pathname: "/share", params: { card: "streak" } })}
            />
          ) : null}
        </View>
      </Card>

      <View style={styles.tiles}>
        <Card style={styles.flex}>
          <Icon name="ac_unit" color={colors.secondaryText} />
          <Text variant="headline-sm" tabular>{`${s?.freezes ?? 0} of ${MAX_FREEZES}`}</Text>
          <Text variant="caption" color="textSecondary">
            freezes available
          </Text>
        </Card>
        <Card style={styles.flex}>
          <Icon name="trophy" color={colors.primaryText} />
          <Text variant="headline-sm" tabular>
            {s?.nextMilestone != null ? streakDays(s.nextMilestone) : "All done"}
          </Text>
          <Text variant="caption" color="textSecondary">
            {s?.nextMilestone != null ? `next milestone · ${s.nextMilestone - s.current} to go` : "100 days reached"}
          </Text>
        </Card>
      </View>

      <Card>
        <View style={styles.monthRow}>
          <IconButton
            icon="chevron_left"
            accessibilityLabel="Previous month"
            disabled={!canBack}
            onPress={() => setMonth(shiftMonth(month, -1))}
          />
          <Text variant="title" style={styles.monthTitle}>{`${MONTHS[m - 1]} ${y}`}</Text>
          <IconButton
            icon="chevron_right"
            accessibilityLabel="Next month"
            disabled={!canForward}
            onPress={() => setMonth(shiftMonth(month, 1))}
          />
        </View>
        <StreakCalendar month={month} states={states} today={p.today} />
      </Card>

      <Card eyebrow="What counts as a day">
        <Text variant="body" color="textSecondary">
          {"Log anything: a meal, your weight, a workout or a recorded walk, run or ride. Steps alone don't count."}
        </Text>
        <Text variant="body" color="textSecondary">
          {`Miss a day and a freeze keeps your streak going. You earn one every ${FREEZE_EARN_DAYS} days in a row and can hold ${MAX_FREEZES}. From ${AT_RISK_HOUR - 12} PM, the flame warns you if today has nothing logged yet.`}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 4 },
  tiles: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  monthRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  monthTitle: { flex: 1, textAlign: "center" },
});
