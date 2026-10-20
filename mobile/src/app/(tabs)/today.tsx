// S10 Today Home, as a personal assistant. The coach has already read the day (targets, meals, steps, streak, time of
// day; situation.ts decides the one situation that matters), so Home leads with a brief: the coach's line and the one
// action that follows. Below it, only what needs the user ("Needs you": the weekly check-in, voice notes waiting), one
// glance card with kcal, protein, steps and water, and today's meals. The full dashboards and past days live on /day.
// States: loading skeleton, error (offline with no cached profile), not set up yet. P36: a notification tap that
// cold-started the app is routed here. P39: a streak milestone or all goals hit opens the celebration (S47) once.
// Welcome back (S48) after 5 days away is the brief's own situation; its action dismisses it. No bell (brand §8).
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
import { lineFacts, situationFor } from "@/features/gap/situation";
import { useRecordVisit, useWelcomeBack } from "@/features/gap/welcomeBack";
import { queuedHref, queuedLabel, removeVoice, restoreVoice, useVoiceQueue } from "@/features/log/voiceQueue";
import { deleteMeal, useDayMeals, type Meal } from "@/features/meals/store";
import { consumePendingRoute } from "@/features/nudges/NudgePlanner";
import { checkinCopy } from "@/features/progress/copy";
import { useProgress } from "@/features/progress/hooks";
import { AppHeader } from "@/features/shell/AppHeader";
import { formatDayLong, greeting } from "@/features/targets/format";
import { BriefCard, GlanceCard, NeedsYouRow, TodayMeals } from "@/features/today/Brief";
import { NudgePromptCard } from "@/features/today/FlowBCards";
import { consumedFrom } from "@/features/today/TodayCards";
import { useActiveUser } from "@/features/users/activeUser";
import { logGlass, useGlasses } from "@/features/water/store";
import { runMemoryJob } from "@/features/life/memory";
import { PlanCard } from "@/features/life/PlanCard";
import { useDayPlan } from "@/features/life/planner";
import { WeekStrip } from "@/features/life/WeekStrip";
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
  const waterGoal = clampWaterGoal(profile.data?.waterGoalGlasses);
  const name = profile.data?.displayName;
  const coach = profile.data?.coach ?? null;
  const dg = useDayGap(clock);
  const welcome = useWelcomeBack(userId, today, streak);
  // LA3: today's plan (saved when its inputs change), and LA5's once-a-day memory job.
  const dayPlan = useDayPlan(today);
  useEffect(() => {
    if (userId && targets) runMemoryJob(userId, today, targets.proteinG);
  }, [userId, today, targets]);
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
  const needsYou = !!pending || !!voice;

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
                router.push(action.href);
              }}
              onAsk={() =>
                router.navigate({
                  pathname: "/coach",
                  params: { about: coach ? coachLine(coach, situation, facts) : action.title },
                })
              }
            />
          ) : null}
          {dayPlan.plan ? (
            <PlanCard plan={dayPlan.plan} nowMinute={minuteOfDay(now)} accepted={!!dayPlan.stored?.acceptedAt} onAccept={dayPlan.accept} />
          ) : null}
          {priority === "prepared" && prepared ? <Card>
            <Text variant="caption">{today} · {MEAL_LABEL[mealType]} · Saved by you</Text>
            <Button label="Change portion" variant="secondary" onPress={() => {
              if (!userId) return;
              draftActions.startFromMeal({ id: "", userId, mealType, source: "repeat", loggedAt: logTime().toISOString(), localDate: today, oilLevel: null, photoUri: null, items: prepared.items, synced: false } as Meal, (id) => getFood(userId, id));
              draftActions.makeNew();
              router.push("/log/confirm");
            }} />
            <Button label="Not now" variant="ghost" onPress={() => setDismissedSuggestions((list) => [...list, suggestionKey])} />
          </Card> : null}
          {draft && !draft.resumeChosen ? <NeedsYouRow icon="restaurant" title={`${MEAL_LABEL[draft.mealType]} draft saved`} subtitle={`${localDate(new Date(draft.loggedAt))} · continue whenever you're ready`} onPress={() => { draftActions.chooseResume(); router.push("/log/confirm"); }} /> : null}
          {dg ? <Text variant="caption" color="textSecondary">{coverageText(dg.coverage, meals.length)}</Text> : null}
          {welcome.show && welcome.restart.kind === "refresh" ? <Card>
            <Text variant="title">Does your old routine still fit?</Text>
            <Text variant="body">Your earlier records are still here. Nothing to backfill.</Text>
            <Button label="Keep it · start with today" variant="secondary" onPress={welcome.dismiss} />
            <Button label="Review routine" variant="ghost" onPress={() => { welcome.dismiss(); router.push("/train/prepare"); }} />
            <Button label="Review goal" variant="ghost" onPress={() => { welcome.dismiss(); router.push("/settings"); }} />
          </Card> : null}

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
            </View>
          ) : null}

          <GlanceCard
            targets={{ ...targets, kcal: targets.kcal + credit.kcal }}
            consumed={consumed}
            glasses={glasses}
            waterGoal={waterGoal}
            onAddGlass={() => {
              if (!userId) return;
              logGlass(userId, today);
              toast({ kind: "info", message: `Glass logged · ${glasses + 1} of ${waterGoal}` });
            }}
          />

          {dayPlan.plan ? <WeekStrip week={dayPlan.plan.week} today={today} /> : null}

          <TodayMeals meals={meals} now={now} />

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
});
