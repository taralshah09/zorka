// AB5 · The one card an answer can carry (docs/ASSISTANT_BAR_PLAN.md "Two-way: answering questions"): today's rings,
// the week's bars, the weight trend, or today's plan. Built from the same facts as the words (assistantFacts.ts) and from
// the app's own pieces: the rings from Home, the session bars from Train.
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Badge, ProgressRing, Text } from "@/core/ui";
import { BarChart } from "@/features/gym/BarChart";
import { DAY_TYPE_LABEL } from "@/features/life/copy";
import { formatInt } from "@/features/targets/format";
import type { AnswerCard as Card } from "@shared/domain/assistantFacts";

function Ring({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <View style={styles.ring}>
      <ProgressRing size="S" progress={target > 0 ? value / target : 0} color={color} accessibilityLabel={`${label}: ${formatInt(value)} of ${formatInt(target)}`}>
        <Text variant="label" tabular>
          {`${Math.round(target > 0 ? (value / target) * 100 : 0)}%`}
        </Text>
      </ProgressRing>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

export function AnswerCard({ card }: { card: Card }) {
  const { colors, radius } = useTheme();
  const box = [styles.box, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }];
  switch (card.kind) {
    case "today_rings":
      return (
        <View style={[box, styles.rings]}>
          <Ring label="kcal" value={card.kcal[0]} target={card.kcal[1]} color={colors.dataKcal} />
          <Ring label="protein" value={card.proteinG[0]} target={card.proteinG[1]} color={colors.dataProtein} />
          {card.steps ? <Ring label="steps" value={card.steps[0]} target={card.steps[1]} color={colors.dataActivity} /> : null}
        </View>
      );
    case "week_bars":
      return (
        <View style={box}>
          <BarChart
            bars={card.days.map((d) => ({
              at: Date.parse(`${d.date}T12:00:00`),
              value: d.kcal ?? 0,
              label: d.kcal === null ? "–" : formatInt(d.kcal),
              sub: d.onTarget === null ? "not logged" : d.onTarget ? "on target" : "off",
              highlight: d.onTarget === true,
            }))}
            color={colors.surfaceHighest}
            highlightColor={colors.primary}
            describe={(b) => `${formatInt(b.value)} kcal`}
            accessibilityLabel="Calories this week, on-target days highlighted"
          />
        </View>
      );
    case "trend_line": {
      const down = (card.weeklyChangeKg ?? 0) < 0;
      return (
        <View style={[box, styles.row]}>
          <Text variant="headline-md" tabular>
            {card.trendKg === null ? "–" : `${card.trendKg.toFixed(1)} kg`}
          </Text>
          {card.weeklyChangeKg !== null ? (
            <View style={styles.row}>
              <Icon name={down ? "arrow_downward" : "arrow_upward"} size={16} color={colors.textSecondary} />
              <Text variant="label" color="textSecondary" tabular>
                {`${Math.abs(card.weeklyChangeKg).toFixed(1)} kg this week`}
              </Text>
            </View>
          ) : null}
        </View>
      );
    }
    case "plan_preview":
      return (
        <View style={box}>
          <View style={styles.row}>
            <Badge label={DAY_TYPE_LABEL[card.dayType]} tone="lilac" />
            <Text variant="label" tabular>
              {`${formatInt(card.kcal)} kcal · ${formatInt(card.proteinG)} g protein`}
            </Text>
          </View>
          {card.items.map((i) => (
            <Text key={i} variant="caption" color="textSecondary">
              {i}
            </Text>
          ))}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  box: { padding: 12, gap: 6 },
  rings: { flexDirection: "row", justifyContent: "space-around" },
  ring: { alignItems: "center", gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
