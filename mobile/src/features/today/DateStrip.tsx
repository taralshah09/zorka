// Date strip — brand §8: 7 days in a surface-low pill track, selected day a lime circle with ink text,
// today marked with a dot. Tapping a past day shows that day's logs on Today; the chevrons move a week back or
// forward (never past this week). Future days can't be picked.
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { IconButton, PressableScale, Text } from "@/core/ui";
import { formatDayLong, weekdayInitial } from "@/features/targets/format";
import { localDate } from "@shared/domain/food";

import { dateOf } from "./selectedDay";

function weekOf(day: Date): Date[] {
  const mondayOffset = (day.getDay() + 6) % 7;
  return Array.from(
    { length: 7 },
    (_, i) => new Date(day.getFullYear(), day.getMonth(), day.getDate() - mondayOffset + i, 12),
  );
}

const shift = (day: string, days: number) => {
  const d = dateOf(day);
  d.setDate(d.getDate() + days);
  return localDate(d);
};

export function DateStrip({
  today,
  selected,
  onSelect,
}: {
  today: Date;
  /** The local date being shown. */
  selected: string;
  onSelect: (day: string) => void;
}) {
  const { colors, radius } = useTheme();
  const todayKey = localDate(today);
  const week = weekOf(dateOf(selected));
  const lastOfWeek = localDate(week[6]!);
  const isThisWeek = lastOfWeek >= todayKey;
  // Next week: same weekday a week on, capped at today.
  const next = shift(selected, 7) > todayKey ? todayKey : shift(selected, 7);

  return (
    <View style={styles.row}>
      <IconButton
        icon="chevron_left"
        accessibilityLabel="Previous week"
        onPress={() => onSelect(shift(selected, -7))}
      />
      <View
        accessibilityLabel={`Week of ${formatDayLong(week[0]!)}, ${formatDayLong(dateOf(selected))} selected`}
        style={[
          styles.track,
          { backgroundColor: colors.surfaceLow, borderColor: colors.outline, borderRadius: radius.full },
        ]}
      >
        {week.map((d) => {
          const key = localDate(d);
          const isSelected = key === selected;
          const isToday = key === todayKey;
          const future = key > todayKey;
          return (
            <PressableScale
              key={key}
              onPress={() => onSelect(key)}
              disabled={future || isSelected}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: future }}
              accessibilityLabel={`${formatDayLong(d)}${isToday ? ", today" : ""}`}
              containerStyle={styles.slot}
              style={[
                styles.day,
                {
                  borderRadius: radius.full,
                  backgroundColor: isSelected ? colors.primary : "transparent",
                  opacity: future ? 0.4 : 1,
                },
              ]}
            >
              <Text variant="caption" color={isSelected ? "ink" : "textSecondary"}>
                {weekdayInitial(d)}
              </Text>
              <Text variant="label" color={isSelected ? "ink" : "textPrimary"} tabular>
                {String(d.getDate())}
              </Text>
              {isToday ? (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: isSelected ? colors.ink : colors.primaryText, borderRadius: radius.full },
                  ]}
                />
              ) : null}
            </PressableScale>
          );
        })}
      </View>
      {isThisWeek ? (
        <View style={styles.chevronSpace} />
      ) : (
        <IconButton icon="chevron_right" accessibilityLabel="Next week" onPress={() => onSelect(next)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  track: { flex: 1, flexDirection: "row", justifyContent: "space-between", padding: 6, borderWidth: 1 },
  slot: { flex: 1 },
  day: { minHeight: 56, alignItems: "center", justifyContent: "center", gap: 2 },
  dot: { width: 4, height: 4 },
  chevronSpace: { width: 40 },
});
