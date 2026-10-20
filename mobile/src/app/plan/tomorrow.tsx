// LA2/LA3 · Plan a day (D73), in three numbered steps: 1 say or type what's coming up for any of the next 7 days →
// 2 check the parsed day (busy times, where you'll be, where you'll eat, flags) → 3 pick the day's numbers (keep the week
// even, catch up faster, the usual numbers, or your own; "How this is counted" and "Start fresh" fold under them) →
// the plan (targets, one or two reasons, the timed items) and the "this week" strip → Save.
// Parsing needs the network; when it fails the chips start empty so the day can be set by hand, never by a guess.
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Badge, Button, Card, Chip, Header, IconButton, NumberStepper, PressableScale, Screen, Text, TextField, useToast } from "@/core/ui";
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
  const { colors, radius } = useTheme();
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

  // The choices. The meals for the picked one are in the plan below, so each choice is just its numbers.
  const choices = useMemo(() => {
    if (!options) return [];
    const list: { key: Pick; label: string; hint: string; value: DayOption }[] = [{ key: "even", label: "Keep the week even", hint: "Recommended", value: options.even }];
    if (options.faster) list.push({ key: "faster", label: "Catch up faster", hint: "More today, less later", value: options.faster });
    if (!list.some((c) => c.value.kcal === options.usual.kcal && c.value.proteinG === options.usual.proteinG && c.value.steps === options.usual.steps))
      list.push({ key: "usual", label: "My usual numbers", hint: "Ignore the rest of the week", value: options.usual });
    return list;
  }, [options]);
  const picked: Pick = !f?.targets ? "even" : (choices.find((c) => c.key !== "even" && sameAs(f.targets, c.value))?.key ?? "custom");
  const [ownOpen, setOwnOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
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

  const dayWord = date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : weekdayShort(date);
  const planContext = (() => {
    if (!plan) return [];
    const wd = plan.week.days.find((d) => d.date === date);
    const moved = wd ? adjustLines(wd, today) : [];
    return [...moved, ...whyText(plan.why.filter((w) => !(moved.length && ADJUST_CODES.includes(w))))].slice(0, 2);
  })();
  const tip = plan ? stepUpLine(plan) : null;

  return (
    <Screen header={<Header title="Plan a day" onBack={() => router.back()} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow} style={styles.bleed}>
        {days.map((d) => (
          <Chip key={d} label={d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : `${weekdayShort(d)} ${d.slice(8)}`} selected={d === date} onPress={() => pickDate(d)} />
        ))}
      </ScrollView>

      <Card>
        <Text variant="eyebrow" color="textSecondary">
          1 · Describe it
        </Text>
        <Text variant="headline-sm">{`How's ${dayWord} looking?`}</Text>
        <TextField
          label="Your day"
          value={text}
          onChangeText={setText}
          placeholder="Expo 1 to 7, client dinner at 8"
          multiline
          accessibilityLabel="Describe the day"
        />
        <View style={styles.readRow}>
          <View style={styles.flex}>
            <Button label={busy ? "Reading…" : "Read my day"} loading={busy} disabled={!online || !text.trim() || busy} onPress={() => void parseText()} fullWidth />
          </View>
          <IconButton icon={recording ? "stop" : "mic"} accessibilityLabel={recording ? "Stop recording" : "Say it"} onPress={() => void toggleVoice()} disabled={!online || busy} />
        </View>
        {!f ? (
          <Text variant="label" color="primaryText" accessibilityRole="button" onPress={() => setFacts(EMPTY)} style={styles.center}>
            Or set the day by hand
          </Text>
        ) : null}
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
            2 · Check the day
          </Text>

          <View style={styles.section}>
            <Text variant="title">Busy times</Text>
            {!f.blocks.length && !adding ? (
              <Text variant="caption" color="textSecondary">
                Nothing blocked. The plan uses your usual day.
              </Text>
            ) : null}
            {f.blocks.map((b: Block, i) => (
              <View key={`${b.from}-${i}`} style={[styles.block, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}>
                <View style={styles.flex}>
                  <Text variant="label" numberOfLines={1}>
                    {b.label ?? BLOCK_LABEL[b.kind]}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {`${minuteLabel(b.from % 1440)}–${minuteLabel(b.to % 1440)} · ${BLOCK_LABEL[b.kind]}${b.canEat ? " · food there" : ""}`}
                  </Text>
                </View>
                <IconButton icon="close" accessibilityLabel={`Remove ${b.label ?? BLOCK_LABEL[b.kind]}`} onPress={() => set({ blocks: f.blocks.filter((_, j) => j !== i) })} />
              </View>
            ))}
            {adding ? (
              <View style={[styles.adder, { borderColor: colors.outline, borderRadius: radius.md }]}>
                <View style={styles.chips}>
                  {BLOCK_KINDS.filter((k) => k !== "sleep").map((k) => (
                    <Chip key={k} label={BLOCK_LABEL[k]} selected={adding.kind === k} onPress={() => setAdding({ ...adding, kind: k })} />
                  ))}
                </View>
                <NumberStepper label="From" value={adding.from} min={0} max={1410} step={30} clock format={minuteLabel} onChange={(from) => setAdding({ ...adding, from })} />
                <NumberStepper label="To" value={adding.to} min={30} max={1439} step={30} clock format={minuteLabel} onChange={(to) => setAdding({ ...adding, to })} />
                <View style={styles.readRow}>
                  <Button label="Cancel" variant="ghost" size="sm" onPress={() => setAdding(null)} />
                  <Button
                    label="Add"
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      set({ blocks: [...f.blocks, { kind: adding.kind, from: adding.from, to: adding.to }] });
                      setAdding(null);
                    }}
                  />
                </View>
              </View>
            ) : (
              <Button label="Add a busy time" variant="ghost" size="sm" icon="add" onPress={() => setAdding({ kind: "work", from: 9 * 60, to: 18 * 60 })} />
            )}
          </View>

          <View style={[styles.section, styles.divider, { borderTopColor: colors.outline }]}>
            <Text variant="title">{"Where you'll be"}</Text>
            <View style={styles.chips}>
              {WHEREABOUTS.map((w) => (
                <Chip key={w} label={WHEREABOUTS_LABEL[w]} selected={f.whereabouts === w} onPress={() => set({ whereabouts: w })} />
              ))}
            </View>
          </View>

          <View style={[styles.section, styles.divider, { borderTopColor: colors.outline }]}>
            <Text variant="title">{"Where you'll eat"}</Text>
            {MEAL_TYPES.map((slot) => (
              <View key={slot} style={styles.mealRow}>
                <Text variant="label" color="textSecondary" style={styles.mealLabel}>
                  {MEAL_LABEL[slot]}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.flex} contentContainerStyle={styles.chipLine}>
                  {MEAL_ACCESS.filter((a) => a !== "unknown").map((a) => (
                    <Chip
                      key={a}
                      label={ACCESS_LABEL[a]}
                      selected={f.mealAccess[slot] === a}
                      onPress={() => set({ mealAccess: { ...f.mealAccess, [slot]: f.mealAccess[slot] === a ? undefined : a } })}
                    />
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>

          <View style={[styles.section, styles.divider, { borderTopColor: colors.outline }]}>
            <Text variant="title">Anything else</Text>
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
          </View>
        </Card>
      ) : null}

      {f && plan && options ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            {`3 · Pick ${dayWord}'s numbers`}
          </Text>
          <Text variant="caption" color="textSecondary">
            {`Usually ${optionLine(options.usual, options.usual)}`}
          </Text>
          <View style={styles.options}>
            {choices.map((c) => {
              const on = picked === c.key;
              return (
                <PressableScale
                  key={c.key}
                  onPress={() => set({ targets: c.key === "even" ? undefined : asTargets(c.value) })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={`${c.label}. ${optionLine(c.value, options.usual)}`}
                  style={[
                    styles.option,
                    { borderRadius: radius.md, borderColor: on ? colors.primary : colors.outline, backgroundColor: on ? colors.surfaceHigh : "transparent" },
                  ]}
                >
                  <View style={styles.optionHead}>
                    <Text variant="label" style={styles.flex}>
                      {c.label}
                    </Text>
                    <Icon name={on ? "check_circle" : "add_circle"} size={20} color={on ? colors.primaryText : colors.textTertiary} />
                  </View>
                  <Text variant="caption" color="textTertiary">
                    {c.hint}
                  </Text>
                  <Text variant="body" color="textSecondary" tabular>
                    {optionLine(c.value, options.usual)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <Button label={picked === "custom" ? "My own numbers (picked)" : "Set my own numbers"} variant="ghost" size="sm" icon="tune" onPress={() => setOwnOpen((o) => !o)} />
          {ownOpen && own && limits ? (
            <View style={styles.adder}>
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

          {breakdown.length ? (
            <View style={[styles.section, styles.divider, { borderTopColor: colors.outline }]}>
              <PressableScale onPress={() => setHowOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: howOpen }} style={styles.optionHead}>
                <Text variant="label" color="textSecondary" style={styles.flex}>
                  How this is counted
                </Text>
                <Icon name="expand_more" size={20} color={colors.textSecondary} />
              </PressableScale>
              {howOpen ? (
                <>
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
                </>
              ) : null}
              {active.freshFrom ? (
                <View style={styles.readRow}>
                  <Text variant="caption" color="textSecondary" style={styles.flex}>
                    {`Started fresh from ${active.freshFrom === today ? "today" : weekdayShort(active.freshFrom)}: earlier gaps this week are let go.`}
                  </Text>
                  <Button label="Undo" variant="ghost" size="sm" onPress={() => userId && clearFreshStart(userId)} />
                </View>
              ) : owes ? (
                <Button label="Start fresh: back to my usual numbers" variant="secondary" size="sm" onPress={fresh} />
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      {f && plan ? (
        <>
          <Card>
            <View style={styles.optionHead}>
              <Text variant="eyebrow" color="textSecondary" style={styles.flex}>
                The plan
              </Text>
              {plan.dayType !== "normal" ? <Badge label={DAY_TYPE_LABEL[plan.dayType]} tone="lilac" /> : null}
            </View>
            <View style={styles.stats}>
              <View style={styles.flex}>
                <Text variant="headline-sm" tabular numberOfLines={1} adjustsFontSizeToFit>
                  {plan.targets.kcalRange ? `${plan.targets.kcalRange[0]}–${plan.targets.kcalRange[1]}` : plan.targets.kcal.toLocaleString("en-IN")}
                </Text>
                <Text variant="caption" color="textSecondary">
                  kcal
                </Text>
              </View>
              <View style={styles.flex}>
                <Text variant="headline-sm" tabular>{`${plan.targets.proteinG} g`}</Text>
                <Text variant="caption" color="textSecondary">
                  protein
                </Text>
              </View>
              <View style={styles.flex}>
                <Text variant="headline-sm" tabular>
                  {plan.targets.steps != null ? plan.targets.steps.toLocaleString("en-IN") : "—"}
                </Text>
                <Text variant="caption" color="textSecondary">
                  steps
                </Text>
              </View>
            </View>
            {planContext.map((t) => (
              <Text key={t} variant="caption" color="textSecondary">
                {t}
              </Text>
            ))}
            {tip ? (
              <View style={[styles.tip, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}>
                <Icon name="info" size={16} color={colors.textSecondary} />
                <Text variant="caption" color="textSecondary" style={styles.flex}>
                  {tip}
                </Text>
              </View>
            ) : null}
            <View style={styles.items}>
              {plan.items.map((item, i) => (
                <View key={`${item.kind}-${item.at}-${i}`} style={styles.item}>
                  <Text variant="label" color="textTertiary" tabular style={styles.time}>
                    {item.kind === "prep" && item.dayOffset === -1 ? "Eve" : minuteLabel(item.at)}
                  </Text>
                  <View style={styles.flex}>
                    <Text variant="label">{itemTitle(item)}</Text>
                    {item.kind === "prep" && item.dayOffset === -1 ? (
                      <Text variant="caption" color="textSecondary">
                        {itemTime(item)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
              {!plan.items.length ? (
                <Text variant="body" color="textSecondary">
                  Nothing timed. Eat and move as usual.
                </Text>
              ) : null}
            </View>
          </Card>
          <WeekStrip week={plan.week} today={today} />
          <Button label={`Save ${dayWord}'s plan`} icon="check_circle" onPress={accept} fullWidth />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center", paddingVertical: 4 },
  bleed: { flexGrow: 0 },
  dateRow: { gap: 8, paddingVertical: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipLine: { gap: 8, paddingRight: 8 },
  readRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  section: { gap: 8, marginTop: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 12 },
  block: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12, paddingVertical: 4 },
  adder: { gap: 8, padding: 12, borderWidth: 1 },
  mealRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mealLabel: { width: 72 },
  slot: { gap: 4 },
  options: { gap: 8, marginTop: 8 },
  option: { borderWidth: 1.5, padding: 12, gap: 2 },
  optionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  stats: { flexDirection: "row", gap: 12, marginVertical: 8 },
  tip: { flexDirection: "row", gap: 8, padding: 10, alignItems: "flex-start" },
  items: { marginTop: 4 },
  item: { flexDirection: "row", gap: 12, paddingVertical: 8, alignItems: "flex-start" },
  time: { width: 44 },
});
