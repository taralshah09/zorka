// This week's volume by day (S22, P19). UX T5 moved it from the Train tab to Progress → "This week".
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Card, Text } from "@/core/ui";
import { localDate } from "@shared/domain/food";
import { formatVolume } from "./format";
import { useWorkoutsBetween, workoutStats } from "./store";

/** Monday-to-Sunday local dates of the week containing `d`. */
export function weekDays(d: Date): string[] {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return localDate(x);
  });
}

/** Renders nothing in a week without workouts, so Progress stays short for people who don't lift. */
export function WeekVolume({ userId, now = new Date() }: { userId: string | null; now?: Date }) {
  const { colors, radius } = useTheme();
  const days = weekDays(now);
  const workouts = useWorkoutsBetween(userId, days[0]!, days[6]!);
  if (!workouts.length) return null;
  const today = localDate(now);
  const byDay = days.map((d) => {
    const ws = workouts.filter((w) => w.localDate === d);
    return { day: d, volume: ws.reduce((s, w) => s + workoutStats(w).volumeKg, 0), sessions: ws.length };
  });
  const max = Math.max(1, ...byDay.map((d) => d.volume));
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <Card eyebrow="Workouts this week">
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

const styles = StyleSheet.create({
  bars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 132, marginTop: 12 },
  barCol: { alignItems: "center", gap: 6 },
});
