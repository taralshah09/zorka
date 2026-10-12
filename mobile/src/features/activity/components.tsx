import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/core/theme";
import { Card, ProgressRing, Text } from "@/core/ui";
import { MOVE_GOAL } from "@shared/domain/activity";
import { cachedSteps, type HealthState } from "./health";
import { dayCredit } from "./store";

export { RouteMap } from "./RouteMap";
export function ActivityRings({ steps, stepGoal, points }: { steps: number | null; stepGoal: number; points: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.rings}>
      <View style={styles.ring}>
        <ProgressRing
          progress={(steps ?? 0) / stepGoal}
          size="M"
          color={colors.dataActivity}
          accessibilityLabel={`${steps ?? "No data"} of ${stepGoal} steps`}
        >
          <Text variant="title" tabular>
            {steps?.toLocaleString() ?? "—"}
          </Text>
          <Text variant="unit" color="textSecondary">
            steps
          </Text>
        </ProgressRing>
        <Text variant="caption" color="textSecondary">{`Goal ${stepGoal.toLocaleString()}`}</Text>
      </View>
      <View style={styles.ring}>
        <ProgressRing
          progress={points / MOVE_GOAL}
          size="M"
          color={colors.dataActivity}
          accessibilityLabel={`${points} of ${MOVE_GOAL} Move points`}
        >
          <Text variant="title" tabular>
            {points}
          </Text>
          <Text variant="unit" color="textSecondary">
            Move points
          </Text>
        </ProgressRing>
        <Text variant="caption" color="textSecondary">{`Goal ${MOVE_GOAL}`}</Text>
      </View>
    </View>
  );
}
export function ActivityStrip({
  userId,
  day,
  stepGoal,
  healthState,
}: {
  userId: string | null;
  day: string;
  stepGoal: number;
  healthState: HealthState;
}) {
  const cache = cachedSteps(userId, day);
  const credit = dayCredit(userId, day);
  return (
    <Card onPress={() => router.push("/activity/steps")} accessibilityLabel="Open steps and Move points">
      <Text variant="title">Steps & Move points</Text>
      <ActivityRings steps={cache?.steps ?? null} stepGoal={stepGoal} points={credit.points} />
      <Text variant="caption" color="textSecondary">
        {healthState === "ready"
          ? "Health Connect steps · completed activities"
          : "Connect Health Connect to see your steps"}
      </Text>
      {credit.kcal > 0 ? (
        <Text variant="label" color="primaryText">{`+${credit.kcal} estimated kcal in the day's budget`}</Text>
      ) : null}
    </Card>
  );
}
export function HourlyBars({ values }: { values: number[] }) {
  const { colors, radius } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View style={styles.hourly} accessible accessibilityLabel={values.map((v, i) => `${i}:00 ${v} steps`).join(", ")}>
      {values.map((v, i) => (
        <View key={i} style={styles.barSlot}>
          <View
            style={{
              height: Math.max(3, (v / max) * 80),
              backgroundColor: v ? colors.dataActivity : colors.surfaceHigh,
              borderRadius: radius.sm,
              width: "100%",
            }}
          />
          <Text variant="unit" color="textSecondary">
            {i % 6 === 0 ? i : " "}
          </Text>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  rings: { flexDirection: "row", justifyContent: "space-around", gap: 16, marginVertical: 16 },
  ring: { alignItems: "center", gap: 8 },
  hourly: { height: 112, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  barSlot: { flex: 1, gap: 4, alignItems: "center" },
});
