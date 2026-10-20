// LA1/LA5 · "What Zorka knows": standing life (edit any answer), what it has learned (active facts, each dismissable in one
// tap; "learned" ones were inferred), suggestions to confirm or dismiss, briefs for the coming days, and the evening
// brief prompt. A dismissed fact never comes back (memory.ts mergeFacts). Standing life is part of the profile (server).
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useNetwork } from "@/core/network/network";
import { Badge, Button, Card, Chip, Header, IconButton, ListItem, NumberStepper, Screen, Text, TextField, Toggle, useToast } from "@/core/ui";
import { useBriefsBetween } from "@/features/life/briefs";
import { DAY_TYPE_LABEL, weekdayShort } from "@/features/life/copy";
import { deleteFact, runMemoryJob, setFactStatus, updateFact, useFacts } from "@/features/life/memory";
import { BUDGET_OPTIONS, MEAL_SOURCE_OPTIONS, minuteLabel, standingFrom, WORK_PATTERN_OPTIONS } from "@/features/life/standing";
import { useTargets } from "@/features/targets/targets";
import { useUpdateProfile } from "@/features/users/api";
import { useActiveUser } from "@/features/users/activeUser";
import type { ProfileUpdate } from "@/core/api/types";
import { classifyDay } from "@shared/domain/dayType";
import { localDate } from "@shared/domain/food";
import type { MemoryFact } from "@shared/domain/memory";
import { DEFAULT_BRIEF_PROMPT_MINUTE } from "@shared/domain/nudges";
import { addDays } from "@shared/domain/progress";

function Choice<T extends string>({ title, options, value, onPick, disabled }: { title: string; options: { value: T; title: string }[]; value: T | null; onPick: (v: T | null) => void; disabled: boolean }) {
  return (
    <View style={styles.block}>
      <Text variant="label">{title}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip key={o.value} label={o.title} selected={value === o.value} disabled={disabled} onPress={() => onPick(value === o.value ? null : o.value)} />
        ))}
      </View>
    </View>
  );
}

export default function WhatZorkaKnows() {
  const userId = useActiveUser((s) => s.userId);
  const { profile, targets } = useTargets();
  const online = useNetwork((s) => s.online);
  const save = useUpdateProfile(userId);
  const toast = useToast();
  const facts = useFacts(userId);
  const today = localDate(new Date());
  const briefs = useBriefsBetween(userId, today, addDays(today, 7));
  const [editing, setEditing] = useState<{ fact: MemoryFact; text: string } | null>(null);
  const p = profile.data;
  const standing = standingFrom(p);
  const put = (u: ProfileUpdate) => save.mutate(u, { onError: () => toast({ kind: "error", message: "Couldn't save. Try again when you're online." }) });
  const active = facts.filter((f) => f.status === "active");
  const suggested = facts.filter((f) => f.status === "suggested");
  const prompt = p?.briefPromptMinute ?? null;

  return (
    <Screen header={<Header title="What Zorka knows" onBack={() => router.back()} />}>
      <Card>
        <Text variant="eyebrow" color="textSecondary">
          Your life
        </Text>
        {!online ? (
          <Text variant="caption" color="textSecondary">
            Connect to change these.
          </Text>
        ) : null}
        <Choice title="Meals come from" options={MEAL_SOURCE_OPTIONS} value={standing.mealSource} disabled={!online} onPick={(mealSource) => put({ mealSource })} />
        <Choice title="Food budget" options={BUDGET_OPTIONS} value={standing.budget} disabled={!online} onPick={(budget) => put({ budget })} />
        <Choice title="A typical day" options={WORK_PATTERN_OPTIONS} value={standing.workPattern} disabled={!online} onPick={(workPattern) => put({ workPattern })} />
        <View style={styles.block}>
          <Text variant="label">Kitchen and fridge</Text>
          <View style={styles.chips}>
            <Chip label="Can cook" selected={standing.hasKitchen === true} disabled={!online} onPress={() => put({ hasKitchen: standing.hasKitchen === true ? null : true })} />
            <Chip label="No kitchen" selected={standing.hasKitchen === false} disabled={!online} onPress={() => put({ hasKitchen: standing.hasKitchen === false ? null : false })} />
            <Chip label="Have a fridge" selected={standing.hasFridge === true} disabled={!online} onPress={() => put({ hasFridge: standing.hasFridge === true ? null : true })} />
            <Chip label="No fridge" selected={standing.hasFridge === false} disabled={!online} onPress={() => put({ hasFridge: standing.hasFridge === false ? null : false })} />
          </View>
        </View>
        <View style={styles.block}>
          <Text variant="label">Workouts a week</Text>
          <View style={styles.chips}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} label={String(n)} selected={standing.sessionsPerWeek === n} disabled={!online} onPress={() => put({ sessionsPerWeek: n })} />
            ))}
            <Chip label="Learn it" selected={standing.sessionsPerWeek === null} disabled={!online} onPress={() => put({ sessionsPerWeek: null })} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="title">Ask about tomorrow each evening</Text>
            <Text variant="caption" color="textSecondary">
              {prompt != null ? `At ${minuteLabel(prompt)}, outside quiet hours.` : "Off. You can still plan any day yourself."}
            </Text>
          </View>
          <Toggle value={prompt != null} disabled={!online} onValueChange={(on) => put({ briefPromptMinute: on ? DEFAULT_BRIEF_PROMPT_MINUTE : null })} accessibilityLabel="Evening brief prompt" />
        </View>
        {prompt != null ? (
          <NumberStepper label="Prompt time" value={prompt} min={17 * 60} max={23 * 60} step={15} clock format={minuteLabel} onChange={(m) => put({ briefPromptMinute: m })} />
        ) : null}
      </Card>

      <Card>
        <Text variant="eyebrow" color="textSecondary">
          The coming days
        </Text>
        {Array.from({ length: 8 }, (_, i) => addDays(today, i)).map((d) => {
          const b = briefs.get(d);
          return (
            <ListItem
              key={d}
              icon="calendar_month"
              title={`${i18nDay(d, today)}${b ? ` · ${DAY_TYPE_LABEL[classifyDay(b.facts, standing)]}` : ""}`}
              subtitle={b ? b.rawText || "Set by hand" : "Not planned yet: a usual day is assumed"}
              chevron
              onPress={() => router.push({ pathname: "/plan/tomorrow", params: { date: d } })}
            />
          );
        })}
      </Card>

      <Card>
        <Text variant="eyebrow" color="textSecondary">
          What Zorka has learned
        </Text>
        {active.length ? null : (
          <Text variant="body" color="textSecondary">
            Nothing yet. Patterns show up after about a week of logging.
          </Text>
        )}
        {active.map((f) =>
          editing?.fact.id === f.id ? (
            <View key={f.id} style={styles.block}>
              <TextField label="Fact" value={editing.text} onChangeText={(text) => setEditing({ fact: f, text })} />
              <View style={styles.chips}>
                <Button
                  label="Save"
                  size="sm"
                  disabled={!editing.text.trim()}
                  onPress={() => {
                    if (userId) updateFact(userId, f, { text: editing.text.trim() });
                    setEditing(null);
                  }}
                />
                <Button label="Cancel" size="sm" variant="ghost" onPress={() => setEditing(null)} />
              </View>
            </View>
          ) : (
            <ListItem
              key={f.id}
              title={f.text}
              subtitle={f.source === "inferred" ? "Learned from your logs" : f.source === "chat" ? "You told the coach" : "Yours"}
              trailing={
                <View style={styles.row}>
                  {f.source === "inferred" ? <Badge label="learned" tone="lilac" /> : null}
                  <IconButton icon="edit" accessibilityLabel="Edit" onPress={() => setEditing({ fact: f, text: f.text })} />
                  <IconButton
                    icon="close"
                    accessibilityLabel="Dismiss"
                    onPress={() => {
                      if (!userId) return;
                      if (f.source === "inferred") setFactStatus(userId, f, "dismissed");
                      else deleteFact(userId, f);
                    }}
                  />
                </View>
              }
            />
          ),
        )}
      </Card>

      {suggested.length ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            Is this right?
          </Text>
          {suggested.map((f) => (
            <View key={f.id} style={styles.block}>
              <Text variant="body">{f.text}</Text>
              <View style={styles.chips}>
                <Button label="Yes" size="sm" onPress={() => userId && setFactStatus(userId, f, "active")} />
                <Button label="No" size="sm" variant="ghost" onPress={() => userId && setFactStatus(userId, f, "dismissed")} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Button
        label="Look at my logs again"
        variant="secondary"
        icon="refresh"
        onPress={() => {
          if (!userId || !targets) return;
          const n = runMemoryJob(userId, today, targets.proteinG, true);
          toast({ message: n ? `${n} thing${n === 1 ? "" : "s"} updated.` : "Nothing new." });
        }}
      />
    </Screen>
  );
}

const i18nDay = (d: string, today: string) => (d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : `${weekdayShort(d)} ${d.slice(8)}`);

const styles = StyleSheet.create({
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
});
