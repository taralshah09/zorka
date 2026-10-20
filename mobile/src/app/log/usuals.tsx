import { router } from "expo-router";
import { Button, Card, Header, Screen, Text } from "@/core/ui";
import { useActiveUser } from "@/features/users/activeUser";
import { useUsualMeals, pinUsual, moveUsual, removeUsual } from "@/features/meals/usual";
import { MEAL_LABEL, formatPortion } from "@/features/food/format";
import { preferencesFor, savePreferences, usePreferencesVersion, type CaptureMethod } from "@/features/meals/preferences";
export default function Usuals() {
  const userId = useActiveUser((s) => s.userId);
  const list = useUsualMeals(userId);
  usePreferencesVersion((s) => s.v);
  const preference = preferencesFor(userId);
  return <Screen header={<Header title="Your usual meals" onBack={() => router.back()} />}>
    <Text variant="body">Saved by you. Editing a logged meal leaves these portions unchanged.</Text>
    {list.map((u) => <Card key={u.id}>
      <Text variant="title">{MEAL_LABEL[u.mealType]}</Text>
      <Text variant="body">{u.items.map((i) => `${formatPortion(i.quantity, i.unit)} ${i.name}`).join(" + ")}</Text>
      <Button label={u.pinned ? "Unpin" : "Pin for this meal"} variant="secondary" onPress={() => userId && pinUsual(userId, u.id, !u.pinned)} />
      <Button label="Move up" variant="ghost" onPress={() => userId && moveUsual(userId, u.id, -1)} />
      <Button label="Move down" variant="ghost" onPress={() => userId && moveUsual(userId, u.id, 1)} />
      <Button label="Remove shortcut" variant="ghost" onPress={() => userId && removeUsual(userId, u.id)} />
    </Card>)}
    {!list.length ? <Text variant="body">Save a logged meal as a usual from its detail screen.</Text> : null}
    <Text variant="title">Preferred capture method: {preference.capture ?? "Choose each time"}</Text>
    {(["voice", "photo", "type", "search"] as CaptureMethod[]).map((capture) => <Button key={capture} label={`Prefer ${capture}`} variant="secondary" onPress={() => userId && savePreferences(userId, { capture })} />)}
    <Button label="Reset remembered defaults" variant="secondary" onPress={() => userId && savePreferences(userId, { capture: null, routineId: null })} />
  </Screen>;
}
