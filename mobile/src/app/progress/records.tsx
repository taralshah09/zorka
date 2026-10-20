import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, Header, Screen, Text } from "@/core/ui";
import { coverageFor, setCoverage, useCoverageVersion } from "@/features/meals/coverage";
import { mealsForDay, useMealsVersion } from "@/features/meals/store";
import { useVoiceQueue } from "@/features/log/voiceQueue";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";
import { addDays, datesBetween } from "@shared/domain/progress";

export default function ReviewRecords() {
  const userId = useActiveUser((s) => s.userId);
  const queue = useVoiceQueue(userId);
  useCoverageVersion((s) => s.v);
  useMealsVersion((s) => s.v);
  const params = useLocalSearchParams<{ end?: string }>();
  const today = localDate(new Date());
  const end = params.end && /^\d{4}-\d{2}-\d{2}$/.test(params.end) && params.end <= today ? params.end : today;
  return <Screen header={<Header title="Review meal records" onBack={() => router.back()} />}>
    <Text variant="body">Only confirm days that reasonably represent what you ate. Partial records still count as effort. You can leave any day unknown.</Text>
    {userId ? datesBetween(addDays(end, -6), end).reverse().map((day) => {
      const meals = mealsForDay(userId, day);
      const pending = queue.some((n) => localDate(new Date(n.createdAt)) === day);
      const complete = coverageFor(userId, day) === "complete";
      return <Card key={day}>
        <Text variant="title">{day} · {meals.length} meals recorded</Text>
        <Text variant="body" color="textSecondary">{meals.map((m) => m.items.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", ")).join("; ") || "No meals recorded"}</Text>
        {pending ? <Text variant="caption">Estimate pending. Review the capture first.</Text> : null}
        <Button label={complete ? "Mark as partial" : "These records are reasonably complete"} variant="secondary" disabled={!meals.length || pending} onPress={() => setCoverage(userId, day, complete ? "partial" : "complete")} />
      </Card>;
    }) : null}
    <Button label="Done" onPress={() => router.back()} />
  </Screen>;
}
