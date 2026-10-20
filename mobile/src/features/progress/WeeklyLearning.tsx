import { router } from "expo-router";
import { Button, Card, NumberStepper, Text } from "@/core/ui";
import { kv } from "@/core/storage/kv";
import { useState } from "react";
import { useWeekStats } from "./hooks";
export function WeeklyLearning({ userId, end }: { userId: string | null; end: string }) {
  const stats = useWeekStats(userId, end);
  const key = `zorka.weeklyRhythm.${userId}`;
  const [rhythm, setRhythm] = useState(() => Number(kv.get(key)) || 2);
  const [open, setOpen] = useState(false);
  return <Card>
    <Text variant="headline-sm">Your recorded effort</Text>
    <Text variant="body">{`${stats.workouts} workouts and meals on ${stats.loggedDays} days in the 7 days ending ${end}.`}</Text>
    <Text variant="body" color="textSecondary">{`${stats.completeDays} days confirmed reasonably complete. ${stats.completeDays < 5 ? "Some records are partial or unknown; we do not have enough evidence to adjust intake targets." : "Completeness is your assessment; nutrition and energy estimates still have uncertainty."}`}</Text>
    <Text variant="body">{stats.workouts ? "Your recorded sessions are available to repeat with their previous numbers." : "Your earlier sessions are still here. Rest and a fresh start are available choices."}</Text>
    <Text variant="caption">{`${stats.lifetimeWorkouts} earlier and current sessions recorded through ${end}.`}</Text>
    <Button label={open ? "Keep this rhythm" : "Choose an optional weekly rhythm"} variant="ghost" onPress={() => setOpen(!open)} />
    {open ? <NumberStepper label="Sessions you would like to plan per week" min={1} max={7} value={rhythm} onChange={(value) => { setRhythm(value); if (userId) kv.set(key, String(value)); }} /> : null}
    <Button label="Review coverage" variant="secondary" onPress={() => router.push({ pathname: "/progress/records", params: { end } })} />
  </Card>;
}
