// LA2/LA3 · Brief a day (D73): say or type what's coming up for any of the next 7 days → the parsed day as editable chips
// (blocks, whereabouts, meal access, flags) → the one optional question → pick the day's numbers (Plan A keeps the week
// even, Plan B catches up faster, the usual numbers, or your own) with how they're counted and "Start fresh" → the plan
// and the "this week" strip → Accept.
// Parsing needs the network; when it fails the chips start empty so the day can be set by hand, never by a guess.
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { Button, Card, Chip, Header, IconButton, ListItem, NumberStepper, Screen, Text, TextField, useToast } from "@/core/ui";
import { parseBriefText, parseBriefVoice } from "@/features/life/api";
import { briefFor, saveBrief } from "@/features/life/briefs";
import { clearAiWeek } from "@/features/life/aiPlanner";
import { ACCESS_LABEL, ADJUST_CODES, adjustLines, BLOCK_LABEL, breakdownLines, DAY_TYPE_LABEL, FLAG_LABEL, itemTime, itemTitle, stepUpLine, weekdayShort, WHEREABOUTS_LABEL, whyText } from "@/features/life/copy";
import { clearFreshStart, startFresh, useActiveFacts } from "@/features/life/memory";
import { useDayPlan } from "@/features/life/planner";
import { minuteLabel } from "@/features/life/standing";
import { WeekStrip } from "@/features/life/WeekStrip";
import { MEAL_LABEL } from "@/features/food/format";
import { VOICE_RECORDING } from "@/features/log/parse";
import { useProfile } from "@/features/users/api";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate, MEAL_TYPES } from "@shared/domain/food";
import { BLOCK_KINDS, DAY_FLAGS, MEAL_ACCESS, validateDayFacts, WHEREABOUTS, type Block, type BlockKind, type DayFacts } from "@shared/domain/life";
import { planDay } from "@shared/domain/planDay";
import { addDays } from "@shared/domain/progress";
import { chosenLimits, weekDates, type DayOption } from "@shared/domain/week";

type Pick = "even" | "faster" | "usual" | "custom";
const asTargets = (o: DayOption): NonNullable<DayFacts["targets"]> => ({ kcal: o.kcal, proteinG: o.proteinG, ...(o.steps != null ? { steps: o.steps } : {}) });
const sameAs = (t: DayFacts["targets"], o: DayOption) => !!t && t.kcal === o.kcal && t.proteinG === o.proteinG && (t.steps ?? null) === o.steps;
const optionLine = (o: DayOption, usual: DayOption) => {
  const d = (v: number, u: number, unit: string) => (v === u ? "" : ` (${v > u ? "+" : "−"}${Math.abs(v - u).toLocaleString("en-IN")}${unit})`);
  return [
    `${o.proteinG} g protein${d(o.proteinG, usual.proteinG, " g")}`,
    `${o.kcal.toLocaleString("en-IN")} kcal${d(o.kcal, usual.kcal, "")}`,
    o.steps != null ? `${o.steps.toLocaleString("en-IN")} steps${d(o.steps, usual.steps ?? o.steps, "")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const EMPTY: DayFacts = { blocks: [], whereabouts: "home", mealAccess: {}, flags: [] };

export default function BriefDay() {
  const params = useLocalSearchParams<{ date?: string; text?: string }>();
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);
  const online = useNetwork((s) => s.online);
  const toast = useToast();
  const today = localDate(new Date());
  const days = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(today, i)), [today]);
  const initial = params.date && days.includes(params.date) ? params.date : addDays(today, 1);
  const [date, setDate] = useState(initial);
  // A brief already saved for the date opens as chips; switching dates starts from that date's brief.
  const [text, setText] = useState(() => params.text ?? (userId ? (briefFor(userId, initial)?.rawText ?? "") : ""));
  const [facts, setFacts] = useState<DayFacts | null>(() => (userId ? (briefFor(userId, initial)?.facts ?? null) : null));
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [adding, setAdding] = useState<{ kind: BlockKind; from: number; to: number } | null>(null);
  const active = useActiveFacts(userId, date);
  const known = active.texts;
  const preview = useDayPlan(date, { save: "never", facts: facts ?? undefined });
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const autoParsed = useRef(false);

  const pickDate = (d: string) => {
    const saved = userId ? briefFor(userId, d) : null;
    setDate(d);
    setFacts(saved?.facts ?? null);
    setText(saved?.rawText ?? "");
    setQuestion(null);
    setAnswer("");
    setAdding(null);
  };

  const run = async (fn: () => ReturnType<typeof parseBriefText>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.transcript) setText(res.transcript);
      // Numbers already picked for the day survive a re-read.
      setFacts((prev) => (prev?.targets ? { ...res.facts, targets: prev.targets } : res.facts));
      setQuestion(res.question);
    } catch (e) {
      // D72/LA2: no guessing. Start from empty chips the user can set.
      setFacts((f) => f ?? EMPTY);
      toast({ kind: "error", message: `${describeError(e).title}. Set the day with the chips below.` });
    } finally {
      setBusy(false);
    }
  };
  const ctx = { forDate: date, profile: profile.data, facts: known };
  const parseText = (t = text) => userId && t.trim() && run(() => parseBriefText(userId, t.trim(), ctx));

  // The coach's "Plan Saturday" arrives with the words already filled in.
  useEffect(() => {
    if (params.text && !autoParsed.current && online && userId) {
      autoParsed.current = true;
      void parseText(params.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.text, online, userId]);

  const toggleVoice = async () => {
    if (!userId) return;
    if (!recording) {
      const p = (await getRecordingPermissionsAsync()).granted ? { granted: true } : await requestRecordingPermissionsAsync();
      if (!p.granted) return toast({ kind: "error", message: "Microphone access is off. Type the brief instead." });
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      return;
    }
    setRecording(false);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (uri) void run(() => parseBriefVoice(userId, uri, ctx));
  };

  const f = facts;
  const set = (patch: Partial<DayFacts>) => f && setFacts(validateDayFacts({ ...f, ...patch }));
  const accept = () => {
    if (!userId || !f) return;
    saveBrief(userId, date, text, f, "confirmed");
    preview.accept();
    // D85: the AI re-plans the week around the new brief; the guarded plan replaces this one when it arrives.
    void preview.replan();
    toast({ kind: "success", message: `${date === today ? "Today" : weekdayShort(date)} is planned.` });
    router.back();
  };
  const plan = preview.plan;
  const input = preview.input;
  const options = plan?.options ?? null;

  // The choices, and each one's meals (the usual meals and suggestions planned for that day's numbers).
  const choices = useMemo(() => {
    if (!options || !input || !f) return [];
    const list: { key: Pick; label: string; value: DayOption }[] = [{ key: "even", label: "Plan A · keep the week even", value: options.even }];
    if (options.faster) list.push({ key: "faster", label: "Plan B · catch up faster", value: options.faster });
    if (!list.some((c) => c.value.kcal === options.usual.kcal && c.value.proteinG === options.usual.proteinG && c.value.steps === options.usual.steps))
      list.push({ key: "usual", label: "My usual numbers", value: options.usual });
    return list.map((c) => {
      const p = planDay({ ...input, facts: { ...f, targets: c.key === "even" ? undefined : asTargets(c.value) } });
      const meals = p.items.flatMap((i) =>
        i.kind === "meal" ? [`${itemTitle(i)}${i.options[0] ? ` → ${i.options[0].name} (${Math.round(i.options[0].macros.proteinG)} g)` : ""}`] : [],
      );
      return { ...c, meals, stepUp: stepUpLine(p) };
    });
  }, [options, input, f]);
  const picked: Pick = !f?.targets ? "even" : (choices.find((c) => c.key !== "even" && sameAs(f.targets, c.value))?.key ?? "custom");
  const [ownOpen, setOwnOpen] = useState(false);
  const row = input?.ledger.find((r) => r.date === date);
  const limits = row && plan ? chosenLimits({ ...row, dayType: plan.dayType }, input!.base.floorKcal, input!.base.goal) : null;
  const own = f?.targets ?? (options ? asTargets(options.even) : null);
  const setOwn = (patch: NonNullable<DayFacts["targets"]>) => own && set({ targets: { ...own, ...patch } });
  const breakdown = plan && input ? breakdownLines(plan.week, input.ledger, date, today) : [];
  const owes = !!plan && (plan.week.owed.proteinG > 0 || plan.week.owed.steps > 0 || plan.week.owed.kcal !== 0);
  const week = weekDates(date);
  const fresh = () => {
    if (!userId) return;
    startFresh(userId, date, { monday: week[0]!, sunday: week[6]!, label: date === today ? "today" : weekdayShort(date) });
    // The AI's week was planned around the old gaps; the rules plan takes over until the next re-plan.
    clearAiWeek(userId, date);
    toast({ kind: "success", message: "Fresh start: earlier gaps this week are let go." });
  };

  return (
    <Screen header={<Header title="Plan a day" onBack={() => router.back()} />}>
      <View style={styles.chips}>
        {days.map((d) => (
          <Chip key={d} label={d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : `${weekdayShort(d)} ${d.slice(8)}`} selected={d === date} onPress={() => pickDate(d)} />
        ))}
      </View>

      <Card>
        <Text variant="title">{`How's ${date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : weekdayShort(date)} looking?`}</Text>
        <TextField
          label="Your day"
          value={text}
          onChangeText={setText}
          placeholder="Expo 1 to 7, client dinner at 8"
          multiline
          accessibilityLabel="Describe the day"
        />
        <View style={styles.actions}>
          <Button label={busy ? "Reading…" : "Read my day"} loading={busy} disabled={!online || !text.trim() || busy} onPress={() => void parseText()} />
          <IconButton icon={recording ? "stop" : "mic"} accessibilityLabel={recording ? "Stop recording" : "Say it"} onPress={() => void toggleVoice()} disabled={!online || busy} />
          {!f ? <Button label="Set by hand" variant="ghost" onPress={() => setFacts(EMPTY)} /> : null}
        </View>
        {!online ? (
          <Text variant="caption" color="textSecondary">
            Offline: set the day by hand. Zorka still plans it.
          </Text>
        ) : null}
      </Card>

      {question ? (
        <Card>
          <Text variant="title">{question}</Text>
          <TextField label="Answer" value={answer} onChangeText={setAnswer} accessibilityLabel="Answer the question" />
          <Button label="Update" variant="secondary" disabled={!answer.trim() || busy} onPress={() => void parseText(`${text}\n${question} ${answer}`)} />
        </Card>
      ) : null}

      {f ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            The day
          </Text>
          {f.blocks.map((b: Block, i) => (
            <ListItem
              key={`${b.from}-${i}`}
              title={`${b.label ?? BLOCK_LABEL[b.kind]} · ${minuteLabel(b.from % 1440)}–${minuteLabel(b.to % 1440)}`}
              subtitle={`${BLOCK_LABEL[b.kind]}${b.canEat ? " · food there" : ""}`}
              trailing={<IconButton icon="close" accessibilityLabel="Remove" onPress={() => set({ blocks: f.blocks.filter((_, j) => j !== i) })} />}
            />
          ))}
          {adding ? (
            <View style={styles.add}>
              <View style={styles.chips}>
                {BLOCK_KINDS.filter((k) => k !== "sleep").map((k) => (
                  <Chip key={k} label={BLOCK_LABEL[k]} selected={adding.kind === k} onPress={() => setAdding({ ...adding, kind: k })} />
                ))}
              </View>
              <NumberStepper label="From" value={adding.from} min={0} max={1410} step={30} clock format={minuteLabel} onChange={(from) => setAdding({ ...adding, from })} />
              <NumberStepper label="To" value={adding.to} min={30} max={1439} step={30} clock format={minuteLabel} onChange={(to) => setAdding({ ...adding, to })} />
              <Button
                label="Add"
                variant="secondary"
                onPress={() => {
                  set({ blocks: [...f.blocks, { kind: adding.kind, from: adding.from, to: adding.to }] });
                  setAdding(null);
                }}
              />
            </View>
          ) : (
            <Button label="Add a busy time" variant="ghost" icon="add" onPress={() => setAdding({ kind: "work", from: 9 * 60, to: 18 * 60 })} />
          )}

          <Text variant="label">Where</Text>
          <View style={styles.chips}>
            {WHEREABOUTS.map((w) => (
              <Chip key={w} label={WHEREABOUTS_LABEL[w]} selected={f.whereabouts === w} onPress={() => set({ whereabouts: w })} />
            ))}
          </View>

          {MEAL_TYPES.map((slot) => (
            <View key={slot} style={styles.slot}>
              <Text variant="label">{MEAL_LABEL[slot]}</Text>
              <View style={styles.chips}>
                {MEAL_ACCESS.filter((a) => a !== "unknown").map((a) => (
                  <Chip
                    key={a}
                    label={ACCESS_LABEL[a]}
                    selected={f.mealAccess[slot] === a}
                    onPress={() => set({ mealAccess: { ...f.mealAccess, [slot]: f.mealAccess[slot] === a ? undefined : a } })}
                  />
                ))}
              </View>
            </View>
          ))}

          <Text variant="label">Anything else</Text>
          <View style={styles.chips}>
            {DAY_FLAGS.map((fl) => (
              <Chip
                key={fl}
                label={FLAG_LABEL[fl]}
                selected={f.flags.includes(fl)}
                onPress={() => set({ flags: f.flags.includes(fl) ? f.flags.filter((x) => x !== fl) : [...f.flags, fl] })}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {f && plan && options ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            {`${date === today ? "Today's" : date === addDays(today, 1) ? "Tomorrow's" : `${weekdayShort(date)}'s`} numbers`}
          </Text>
          <Text variant="caption" color="textSecondary">
            {`Usually ${optionLine(options.usual, options.usual)}.`}
          </Text>
          {choices.map((c) => (
            <View key={c.key} style={styles.choice}>
              <ListItem
                title={c.label}
                subtitle={optionLine(c.value, options.usual)}
                trailing={<Chip kind="choice" label={picked === c.key ? "Picked" : "Pick"} selected={picked === c.key} onPress={() => set({ targets: c.key === "even" ? undefined : asTargets(c.value) })} />}
                onPress={() => set({ targets: c.key === "even" ? undefined : asTargets(c.value) })}
              />
              {c.meals.map((m) => (
                <Text key={m} variant="caption" color="textSecondary">
                  {m}
                </Text>
              ))}
              {c.stepUp ? (
                <Text variant="caption" color="textSecondary">
                  {c.stepUp}
                </Text>
              ) : null}
            </View>
          ))}
          <Button label={picked === "custom" ? "My own numbers (picked)" : "Set my own numbers"} variant="ghost" onPress={() => setOwnOpen((o) => !o)} />
          {ownOpen && own && limits ? (
            <View style={styles.add}>
              <NumberStepper label="Protein" unit="g" value={own.proteinG ?? options.even.proteinG} min={limits.protein[0]} max={limits.protein[1]} step={5} onChange={(proteinG) => setOwn({ proteinG })} />
              <NumberStepper label="Calories" unit="kcal" value={own.kcal ?? options.even.kcal} min={limits.kcal[0]} max={limits.kcal[1]} step={50} onChange={(kcal) => setOwn({ kcal })} />
              {limits.steps && options.even.steps != null ? (
                <NumberStepper label="Steps" value={own.steps ?? options.even.steps} min={limits.steps[0]} max={limits.steps[1]} step={500} onChange={(steps) => setOwn({ steps })} />
              ) : null}
              <Text variant="caption" color="textSecondary">
                Kept inside safe limits. Whatever this day leaves or takes moves to the other days this week.
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {f && plan && breakdown.length ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            How this is counted
          </Text>
          {breakdown.map((b) => (
            <View key={b.metric} style={styles.slot}>
              <Text variant="label">{b.title}</Text>
              {b.lines.map((l) => (
                <Text key={l} variant="caption" color="textSecondary">
                  {l}
                </Text>
              ))}
            </View>
          ))}
          <Text variant="caption" color="textSecondary">
            {"Nothing carries into next week: what doesn't fit by Sunday is let go."}
          </Text>
          {active.freshFrom ? (
            <View style={styles.actions}>
              <Text variant="caption" color="textSecondary">
                {`Started fresh from ${active.freshFrom === today ? "today" : weekdayShort(active.freshFrom)}: earlier gaps this week are let go.`}
              </Text>
              <Button label="Undo" variant="ghost" onPress={() => userId && clearFreshStart(userId)} />
            </View>
          ) : owes ? (
            <Button label="Start fresh: back to my usual numbers" variant="secondary" onPress={fresh} />
          ) : null}
        </Card>
      ) : null}

      {f && plan ? (
        <>
          <Card>
            <Text variant="eyebrow" color="textSecondary">
              {`${DAY_TYPE_LABEL[plan.dayType]} · the plan`}
            </Text>
            <Text variant="title">
              {`${plan.targets.kcalRange ? `${plan.targets.kcalRange[0]}–${plan.targets.kcalRange[1]}` : plan.targets.kcal} kcal · ${plan.targets.proteinG} g protein${plan.targets.steps != null ? ` · ${plan.targets.steps.toLocaleString("en-IN")} steps` : ""}`}
            </Text>
            {(() => {
              const wd = plan.week.days.find((d) => d.date === date);
              const moved = wd ? adjustLines(wd, today) : [];
              return [
                ...moved.map((m) => (
                  <Text key={m} variant="body">
                    {m}
                  </Text>
                )),
                ...whyText(plan.why.filter((w) => !(moved.length && ADJUST_CODES.includes(w)))).map((w) => (
                  <Text key={w} variant="caption" color="textSecondary">
                    {w}
                  </Text>
                )),
              ];
            })()}
            {stepUpLine(plan) ? (
              <Text variant="caption" color="textSecondary">
                {stepUpLine(plan)}
              </Text>
            ) : null}
            {plan.items.map((item, i) => (
              <ListItem key={`${item.kind}-${item.at}-${i}`} title={itemTitle(item)} subtitle={itemTime(item)} />
            ))}
          </Card>
          <WeekStrip week={plan.week} today={today} />
          <Button label="Accept" onPress={accept} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  add: { gap: 8 },
  slot: { gap: 6 },
  choice: { gap: 2 },
});
