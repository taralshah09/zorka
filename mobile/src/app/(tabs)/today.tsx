// S10 Today Home, as a personal assistant. Read top to bottom it answers three questions: where do I stand (the hero:
// kcal left, protein, steps, water, and the day type when it isn't a usual day), what should I do now (the brief: the
// coach's line and the one action, or the usual meal ready to log), and what's the rest of my day (one timeline of
// logged meals and what's still planned). "Needs you" only shows what waits on the user (check-in, captures, a draft,
// a returning user's routine check). The week strip closes it. The full dashboards and past days live on /day.
// States: loading skeleton, error (offline with no cached profile), not set up yet. P36: a notification tap that
// cold-started the app is routed here. P39: a streak milestone or all goals hit opens the celebration (S47) once.
// Welcome back (S48) after 5 days away is the brief's own situation; its action dismisses it. No bell (brand §8).
import { randomUUID } from "expo-crypto";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { Button, Card, EmptyState, ErrorState, IconButton, Screen, Skeleton, Text, useToast } from "@/core/ui";
import { cachedSteps, useHealthSteps } from "@/features/activity/health";
import { activeActivity, dayCredit, useActivityClock } from "@/features/activity/store";
import { useActiveWorkout } from "@/features/gym/store";
import { draftActions, useDraft } from "@/features/log/draft";
import { getFood } from "@/features/food/catalog";
import { rankedUsuals, logUsual, useUsualMeals } from "@/features/meals/usual";
import { logTime } from "@/features/today/selectedDay";
import { briefPriority } from "@shared/domain/brief";
import { coverageText } from "@shared/domain/evidence";
import { useCelebrateOnFocus } from "@/features/celebrate/celebrations";
import { useTodayReactions } from "@/features/celebrate/todayReactions";
import { coachLine } from "@/features/coach/lines";
import { formatPortion, MEAL_LABEL } from "@/features/food/format";
import { useEatOptions } from "@/features/gap/eat";
import { useDayGap } from "@/features/gap/gap";
import { nextAction } from "@/features/gap/nextAction";
import { executeNow } from "@/features/assistant/executors";
import { removePlannedMeal, usePlannedMeals, type PlannedMeal } from "@/features/assistant/plannedMeals";
import { takeReplanRequest, useReplanVersion } from "@/features/assistant/replan";
import { DoneForYou } from "@/features/today/DoneForYou";
import { BubbleOfferCard } from "@/features/assistant/BubbleCards";
import { lineFacts, situationFor } from "@/features/gap/situation";
import { useRecordVisit, useWelcomeBack } from "@/features/gap/welcomeBack";
import { queuedHref, queuedLabel, removeVoice, restoreVoice, useVoiceQueue } from "@/features/log/voiceQueue";
import { deleteMeal, saveMeal, useDayMeals, type Meal } from "@/features/meals/store";
import { consumePendingRoute } from "@/features/nudges/NudgePlanner";
import { checkinCopy } from "@/features/progress/copy";
import { useProgress } from "@/features/progress/hooks";
import { AppHeader } from "@/features/shell/AppHeader";
import { formatDayLong, greeting } from "@/features/targets/format";
import { BriefCard, NeedsYouRow, TodayHero } from "@/features/today/Brief";
import { DayTimeline } from "@/features/today/DayTimeline";
import { NudgePromptCard } from "@/features/today/FlowBCards";
import { consumedFrom } from "@/features/today/TodayCards";
import { useActiveUser } from "@/features/users/activeUser";
import { logGlass, useGlasses } from "@/features/water/store";
import { runMemoryJob } from "@/features/life/memory";
import { dueForDailyReplan } from "@/features/life/aiPlanner";
import { DAY_TYPE_LABEL } from "@/features/life/copy";
import { useDayPlan } from "@/features/life/planner";
import { useStoredPlan } from "@/features/life/plans";
import { WeekStrip } from "@/features/life/WeekStrip";
import { useDayTargets, waterFor } from "@/features/life/dayTargets";
import { minuteOfDay } from "@shared/domain/gap";
import { localDate, mealTypeForTime } from "@shared/domain/food";
import { clampWaterGoal } from "@shared/domain/water";

export default function Today() {
  const clock = useActivityClock();
  const { profile, targets, streak, pending } = useProgress(clock);
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const toast = useToast();
  const now = new Date(clock);
  const today = localDate(now);
  useRecordVisit(userId, today);
  useHealthSteps(userId, today);
  const credit = dayCredit(userId, today);
  const meals = useDayMeals(userId, today);
  const voiceNotes = useVoiceQueue(userId);
  const draft = useDraft((s) => s.draft);
  const workout = useActiveWorkout(userId);
  const activity = activeActivity();
  const openActivity = activity?.userId === userId ? activity : null;
  const usuals = useUsualMeals(userId);
  const mealType = mealTypeForTime(now);
  const prepared = rankedUsuals(usuals, mealType)[0];
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  const loggedSuggestions = useRef(new Set<string>());
  const suggestionKey = `${userId}:${today}:${mealType}:${prepared?.id}`;
  const consumed = { ...consumedFrom(meals), steps: cachedSteps(userId, today)?.steps ?? null };
  const glasses = useGlasses(userId, today);
  // LA3: today's tracker follows today's plan; the planner itself reads the base targets.
  const dayTargets = useDayTargets(userId, today, targets);
  const dayPlanStored = useStoredPlan(userId, today);
  const waterGoal = waterFor(dayPlanStored, clampWaterGoal(profile.data?.waterGoalGlasses));
  const name = profile.data?.displayName;
  const coach = profile.data?.coach ?? null;
  const dg = useDayGap(clock);
  const welcome = useWelcomeBack(userId, today, streak);
  // LA3: today's plan (saved when its inputs change), and LA5's once-a-day memory job.
  const dayPlan = useDayPlan(today);
  useEffect(() => {
    if (userId && targets) runMemoryJob(userId, today, targets.proteinG);
  }, [userId, today, targets]);
  // D85: the AI re-plans the week once a day, on the first open with a network.
  const replanToday = dayPlan.replan;
  const canPlan = !!dayPlan.input;
  // AB3: the Assistant Bar changed a day (set_day): re-plan the week with the AI when online.
  const replanAsked = useReplanVersion((s) => s.v);
  useEffect(() => {
    if (userId && canPlan && online && takeReplanRequest(userId)) void replanToday();
    // replanToday changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, canPlan, online, replanAsked]);
  // AB3: meals the user told the bar they will have later. Tapping one on the timeline logs it.
  const planned = usePlannedMeals(userId, today);
  const logPlanned = (p: PlannedMeal) => {
    if (!userId || !p.items.length) return;
    const meal: Meal = {
      id: randomUUID(),
      userId,
      mealType: p.mealType,
      loggedAt: new Date().toISOString(),
      localDate: today,
      source: "text",
      oilLevel: null,
      photoUri: null,
      items: p.items.map((i) => ({ ...i, id: randomUUID() })),
      synced: false,
    };
    saveMeal(meal);
    removePlannedMeal(userId, today, p.id);
    toast({ kind: "success", message: `${MEAL_LABEL[p.mealType]} logged`, onUndo: () => deleteMeal(meal) });
  };
  useEffect(() => {
    if (userId && canPlan && online && dueForDailyReplan(userId, today)) void replanToday();
    // Once per day; replanToday changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, today, canPlan, online]);
  const eatOptions = useEatOptions({
    userId,
    today,
    now: clock,
    gap: dg?.gap ?? null,
    diet: profile.data?.diet ?? "non_veg",
    profileDiet: profile.data?.diet ?? "non_veg",
    nearby: [],
  });
  const situation = dg ? situationFor(dg, streak, welcome.show) : null;
  const facts = dg ? lineFacts(dg, streak) : null;
  let action = situation && facts ? nextAction(situation, facts, eatOptions.length, meals.length) : null;
  const finished = meals.some((m) => m.mealType === mealType) || dismissedSuggestions.includes(suggestionKey);
  const priority = briefPriority({ activeSession: !!workout || !!openActivity, chosenDraft: !!draft?.resumeChosen, prepared: !!prepared, optional: !!action?.cta, finished });
  if (action && priority === "resume") action = { eyebrow: "In progress", title: workout ? `${workout.name} is still open.` : "Your activity is still open.", icon: "play_arrow", tone: "default", cta: "Resume", href: workout ? "/train/workout" : { pathname: "/activity/live", params: { id: openActivity!.id } } };
  if (action && priority === "continue") action = { eyebrow: "Draft saved", title: `${MEAL_LABEL[draft!.mealType]} · ${localDate(new Date(draft!.loggedAt))} · ready to check`, icon: "restaurant", tone: "default", cta: "Continue draft", href: "/log/confirm" };
  if (action && priority === "prepared") action = { eyebrow: `Your usual ${MEAL_LABEL[mealType].toLowerCase()}?`, title: prepared.items.map((i) => `${formatPortion(i.quantity, i.unit)} ${i.name}`).join(" + "), icon: "restaurant", tone: "default", cta: "Log this", href: "/quick-log" };
  if (action && priority === "finished") action = { ...action, eyebrow: "Done for now", title: "Your work is saved. Nothing needs you now.", icon: "check_circle", tone: "success", cta: null, href: "/day" };
  // A notification tap that cold-started the app is routed once Today is showing (P36).
  useFocusEffect(useCallback(() => consumePendingRoute(), []));
  // P39: celebrate a streak milestone reached today, else all goals hit, once each (re-checked on focus, so it fires
  // when the user comes back from the log that did it).
  const milestone = streak?.milestoneToday ?? null;
  useCelebrateOnFocus(
    userId,
    milestone
      ? { key: `streak:${today}:${milestone}`, kind: "streak", value: String(milestone) }
      : dg?.coverage === "complete" && dg?.gap.state === "done"
        ? { key: `day:${today}`, kind: "day" }
        : null,
  );
  // Confetti once per single goal reached today, and a mascot eye-roll when over target or the streak is at risk.
  useTodayReactions(userId, today, dg, targets?.steps ?? null, situation);

  const voice = voiceNotes[0];
  const draftWaiting = !!draft && !draft.resumeChosen;
  const routineCheck = welcome.show && welcome.restart.kind === "refresh";
  const needsYou = !!pending || !!voice || draftWaiting || routineCheck;
  const plan = dayPlan.plan;

  return (
    <Screen withDock header={<AppHeader eyebrow="Today" />}>
      <NetworkBanner />

      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="headline-lg" accessibilityRole="header">
            {`${greeting(now)}${name ? `, ${name}` : ""}`}
          </Text>
          <Text variant="body" color="textSecondary">
            {formatDayLong(now)}
          </Text>
        </View>
      </View>

      {profile.isPending ? (
        <>
          <Skeleton variant="card" height={200} />
          <Skeleton variant="card" height={120} />
        </>
      ) : profile.isError && !profile.data ? (
        <ErrorState
          {...describeError(profile.error)}
          onRetry={() => profile.refetch()}
          retrying={profile.isRefetching}
        />
      ) : !targets ? (
        <EmptyState
          icon="tune"
          title="Set up your plan"
          body="Answer a few questions and get your daily calories, protein and steps."
          actionLabel="Set up my plan"
          onAction={() => router.push("/onboarding")}
        />
      ) : (
        <>
          {userId ? <DoneForYou userId={userId} today={today} /> : null}

          <TodayHero
            targets={{ kcal: (dayTargets ?? targets).kcal + credit.kcal, proteinG: (dayTargets ?? targets).proteinG, steps: plan ? plan.targets.steps : targets.steps }}
            consumed={consumed}
            glasses={glasses}
            waterGoal={waterGoal}
            onAddGlass={() => {
              if (!userId) return;
              logGlass(userId, today);
              toast({ kind: "info", message: `Glass logged · ${glasses + 1} of ${waterGoal}` });
            }}
            dayLabel={plan && plan.dayType !== "normal" ? DAY_TYPE_LABEL[plan.dayType] : null}
            kcalRange={plan?.targets.kcalRange}
            coverage={dg && meals.length ? coverageText(dg.coverage, meals.length) : null}
          />

          {action && situation && facts ? (
            <BriefCard
              coach={coach}
              line={priority === "optional" && coach && dg?.coverage === "complete" ? coachLine(coach, situation, facts) : null}
              action={action}
              note={
                welcome.show && welcome.freezeUsed
                  ? "A streak freeze covered the day you missed, so your streak is safe."
                  : undefined
              }
              onNotePress={welcome.show && welcome.freezeUsed ? () => router.push("/progress/streak") : undefined}
              onAction={() => {
                if (welcome.show) welcome.dismiss();
                if (priority === "prepared" && prepared && userId) {
                  if (loggedSuggestions.current.has(suggestionKey)) return;
                  loggedSuggestions.current.add(suggestionKey);
                  const saved = logUsual(userId, prepared, mealType, logTime());
                  toast({ kind: "success", message: `${MEAL_LABEL[mealType]} saved. You're done for now.`, onUndo: () => { deleteMeal(saved); loggedSuggestions.current.delete(suggestionKey); } });
                  return;
                }
                if (action.execute) executeNow(action.execute);
                else router.push(action.href);
              }}
              onAsk={() =>
                router.navigate({
                  pathname: "/coach",
                  params: { about: coach ? coachLine(coach, situation, facts) : action.title },
                })
              }
              extra={
                priority === "prepared" && prepared ? (
                  <View style={styles.choices}>
                    <Button label="Change portion" size="sm" variant="secondary" onPress={() => {
                      if (!userId) return;
                      draftActions.startFromMeal({ id: "", userId, mealType, source: "repeat", loggedAt: logTime().toISOString(), localDate: today, oilLevel: null, photoUri: null, items: prepared.items, synced: false } as Meal, (id) => getFood(userId, id));
                      draftActions.makeNew();
                      router.push("/log/confirm");
                    }} />
                    <Button label="Not now" size="sm" variant="ghost" onPress={() => setDismissedSuggestions((list) => [...list, suggestionKey])} />
                  </View>
                ) : undefined
              }
            />
          ) : null}

          {needsYou ? (
            <View style={styles.section}>
              <Text variant="eyebrow" color="textSecondary">
                Needs you
              </Text>
              {pending ? (
                <NeedsYouRow
                  icon="calendar_month"
                  title="Weekly check-in is ready"
                  subtitle={checkinCopy(pending, !!profile.data?.checkinDetailed).title}
                  onPress={() => router.push("/progress/checkin")}
                />
              ) : null}
              {voice ? (
                <NeedsYouRow
                  icon={
                    !online
                      ? "cloud_off"
                      : voice.kind === "photo"
                        ? "photo_camera"
                        : voice.kind === "text"
                          ? "keyboard"
                          : "mic"
                  }
                  title={queuedLabel(voiceNotes)}
                  subtitle={
                    online
                      ? `${MEAL_LABEL[voice.mealType]}${voice.text ? ` · "${voice.text}"` : ""} · ready to read and check`
                      : "We'll read it when you're back online."
                  }
                  onPress={online ? () => router.push(queuedHref(voice)) : undefined}
                  trailing={
                    <IconButton icon="close" accessibilityLabel="Dismiss capture" onPress={() => { removeVoice(voice, true); toast({ kind: "info", message: "Capture dismissed", onUndo: () => restoreVoice(voice) }); }} />
                  }
                />
              ) : null}
              {draftWaiting && draft ? (
                <NeedsYouRow
                  icon="restaurant"
                  title={`${MEAL_LABEL[draft.mealType]} draft saved`}
                  subtitle={`${localDate(new Date(draft.loggedAt))} · continue whenever you're ready`}
                  onPress={() => { draftActions.chooseResume(); router.push("/log/confirm"); }}
                />
              ) : null}
              {routineCheck ? (
                <Card>
                  <Text variant="title">Does your old routine still fit?</Text>
                  <Text variant="body" color="textSecondary">Your earlier records are still here. Nothing to backfill.</Text>
                  <Button label="Keep it · start with today" variant="secondary" onPress={welcome.dismiss} />
                  <View style={styles.choices}>
                    <Button label="Review routine" size="sm" variant="ghost" onPress={() => { welcome.dismiss(); router.push("/train/prepare"); }} />
                    <Button label="Review goal" size="sm" variant="ghost" onPress={() => { welcome.dismiss(); router.push("/settings"); }} />
                  </View>
                </Card>
              ) : null}
            </View>
          ) : null}

          <DayTimeline
            meals={meals}
            planned={planned}
            onLogPlanned={logPlanned}
            now={now}
            nowMinute={minuteOfDay(now)}
            plan={plan}
            eatenProteinG={consumed.proteinG}
            replanning={dayPlan.replanning}
            onReplan={
              plan && online
                ? () =>
                    void dayPlan.replan().then((ok) =>
                      toast(ok ? { kind: "success", message: "Re-planned by AI." } : { kind: "info", message: "AI couldn't re-plan right now. Keeping the current plan." }),
                    )
                : undefined
            }
          />

          {plan ? <WeekStrip week={plan.week} today={today} /> : null}

          <BubbleOfferCard />

          {userId ? <NudgePromptCard userId={userId} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  section: { gap: 8 },
  choices: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
