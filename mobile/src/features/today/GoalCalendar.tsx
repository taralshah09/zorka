// Today's goal calendar: a month of days, each with a four-segment ring showing how many of the day's goals were
// hit (calories in budget, protein, steps, water; shared/domain/goalDays.ts). All four fills the day lime. Tapping a
// past day opens it on Today. The chevrons move a month at a time, never past this month.
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useTheme } from "@/core/theme";
import { Card, IconButton, PressableScale, Text } from "@/core/ui";
import { formatDayLong } from "@/features/targets/format";
import { GOAL_COUNT, type GoalDay } from "@shared/domain/gap";
import type { Targets } from "@shared/domain/targets";

import { monthRange, useGoalMonth } from "./goalDays";
import { dateOf, PLAN_AHEAD_DAYS } from "./selectedDay";
import { addDays } from "@shared/domain/progress";

const MONTH_NAMES = [
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
const WEEK_HEAD = ["M", "T", "W", "T", "F", "S", "S"];
const CELL = 38;
const STROKE = 3;
const R = (CELL - STROKE) / 2 - 1;
const CIRC = 2 * Math.PI * R;
const GAP = 4;
const SEG = CIRC / GOAL_COUNT - GAP;

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function hitWords(d: GoalDay): string {
  const hit = [d.calories && "calories", d.protein && "protein", d.steps && "steps", d.water && "water"].filter(
    Boolean,
  );
  return hit.length ? `${d.hit} of ${GOAL_COUNT} goals: ${hit.join(", ")}` : `0 of ${GOAL_COUNT} goals`;
}

/** Quarter segments around the date: one per goal hit, starting at 12 o'clock. */
function GoalRing({ hit, color, track }: { hit: number; color: string; track: string }) {
  const c = CELL / 2;
  return (
    <Svg width={CELL} height={CELL} style={[StyleSheet.absoluteFill, styles.rotate]}>
      {Array.from({ length: GOAL_COUNT }, (_, i) => (
        <Circle
          key={i}
          cx={c}
          cy={c}
          r={R}
          fill="none"
          stroke={i < hit ? color : track}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={[SEG, CIRC - SEG]}
          strokeDashoffset={-(i * (CIRC / GOAL_COUNT) + GAP / 2)}
        />
      ))}
    </Svg>
  );
}

export function GoalCalendar({
  userId,
  today,
  selected,
  targets,
  waterGoal,
  onSelect,
}: {
  userId: string | null;
  /** Local dates (YYYY-MM-DD). */
  today: string;
  selected: string;
  targets: Targets;
  waterGoal: number;
  onSelect: (day: string) => void;
}) {
  const { colors, radius } = useTheme();
  // The month on show, browsed with the chevrons; picking a day elsewhere (the date strip) jumps to its month.
  const [view, setView] = useState({ selected, month: selected.slice(0, 7) });
  const month = view.selected === selected ? view.month : selected.slice(0, 7);
  const setMonth = (m: string) => setView({ selected, month: m });
  const days = useGoalMonth(userId, month, today, targets, waterGoal);

  const { start, end } = monthRange(month);
  const lead = (dateOf(start).getDay() + 6) % 7; // Monday first, as on the date strip
  const count = Number(end.slice(8));
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const fullDays = [...days.values()].filter((d) => d.hit === GOAL_COUNT).length;
  const [y, m] = month.split("-").map(Number) as [number, number];

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="headline-sm" accessibilityRole="header">
            Goal calendar
          </Text>
          <Text variant="caption" color="textSecondary">
            {`${fullDays} ${fullDays === 1 ? "day" : "days"} with all ${GOAL_COUNT} goals hit`}
          </Text>
        </View>
        <IconButton
          icon="chevron_left"
          accessibilityLabel="Previous month"
          onPress={() => setMonth(shiftMonth(month, -1))}
        />
        <IconButton
          icon="chevron_right"
          accessibilityLabel="Next month"
          disabled={month >= addDays(today, PLAN_AHEAD_DAYS).slice(0, 7)}
          onPress={() => setMonth(shiftMonth(month, 1))}
        />
      </View>
      <Text variant="label" style={styles.month}>{`${MONTH_NAMES[m - 1]} ${y}`}</Text>

      <View style={styles.grid}>
        <View style={styles.row}>
          {WEEK_HEAD.map((d, i) => (
            <Text key={i} variant="caption" color="textTertiary" align="center" style={styles.cell}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.row}>
            {week.map((date, di) => {
              if (!date) return <View key={di} style={styles.cell} />;
              const day = days.get(date);
              const future = date > today;
              // LA3: the coming week opens its plan; further out there's nothing to show yet.
              const beyond = date > addDays(today, PLAN_AHEAD_DAYS);
              const full = day?.hit === GOAL_COUNT;
              const isSelected = date === selected;
              return (
                <PressableScale
                  key={date}
                  onPress={() => onSelect(date)}
                  disabled={beyond}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: beyond }}
                  accessibilityLabel={`${formatDayLong(dateOf(date))}${date === today ? ", today" : ""}. ${
                    future ? (beyond ? "Upcoming" : "Planned") : day ? hitWords(day) : `0 of ${GOAL_COUNT} goals`
                  }`}
                  style={[
                    styles.cell,
                    styles.day,
                    {
                      borderRadius: radius.full,
                      backgroundColor: full ? colors.primary : isSelected ? colors.surfaceHighest : "transparent",
                    },
                  ]}
                >
                  {!future && !full ? (
                    <GoalRing hit={day?.hit ?? 0} color={colors.primary} track={colors.surfaceHigh} />
                  ) : null}
                  <Text
                    variant="caption"
                    color={full ? "ink" : future ? "textTertiary" : "textPrimary"}
                    tabular
                    style={date === today ? styles.today : undefined}
                  >
                    {String(Number(date.slice(8)))}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        ))}
      </View>

      <View
        style={styles.legend}
        accessible
        accessibilityLabel="Each segment is one goal hit: calories, protein, steps, water"
      >
        <View style={styles.legendRing}>
          <GoalRing hit={2} color={colors.primary} track={colors.surfaceHigh} />
        </View>
        <Text variant="caption" color="textSecondary" style={styles.flex}>
          One segment per goal hit: calories, protein, steps, water. Tap a day to open it.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  month: { marginTop: 8, marginBottom: 4 },
  grid: { gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  cell: { width: CELL, height: CELL },
  day: { alignItems: "center", justifyContent: "center" },
  today: { fontWeight: "700", textDecorationLine: "underline" },
  rotate: { transform: [{ rotate: "-90deg" }] },
  legend: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  legendRing: { width: CELL, height: CELL },
});
