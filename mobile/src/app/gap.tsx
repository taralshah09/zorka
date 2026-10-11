// S41 Gap Closer (P31–P34). Remaining macros, then Eat / Move tabs. Eat: 3–5 ranked options (Your usual, Home,
// Zomato, Blinkit) filtered by diet with a one-tap Veg ↔ Non-veg switch (D56). Move: activity × duration, or easing
// tomorrow late at night (D57). Nearby search failing never hides the other options (D59).
// Layout follows the S41 Stitch export; no food photos (D15), no bell in the header (brand §8).
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Chip, EmptyState, Header, Screen, SegmentedControl, Skeleton, Text, useToast } from "@/core/ui";
import { CoachLine } from "@/features/coach/CoachLine";
import { coachLine } from "@/features/coach/lines";
import { useActivityClock } from "@/features/activity/store";
import { MEAL_LABEL } from "@/features/food/format";
import { draftActions } from "@/features/log/draft";
import { deleteMeal, repeatMeal } from "@/features/meals/store";
import { useStreak } from "@/features/progress/streak";
import { addEase, useUpcomingEases } from "@/features/gap/eases";
import { GapHeader, GapOptionCard, MoveOptionCard, NearbyNotice, moveTitle } from "@/features/gap/components";
import { useEatOptions, type EatOption } from "@/features/gap/eat";
import { currentMealType, useDayGap } from "@/features/gap/gap";
import { openNearby, useNearby } from "@/features/gap/nearby";
import { LocationSheet } from "@/features/gap/sheets";
import { lineFacts, movesFor, situationFor } from "@/features/gap/situation";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { dietForSwitch, switchSideFor } from "@shared/domain/eatOptions";
import { isLateNight, type MoveOption } from "@shared/domain/moveOptions";

type Tab = "eat" | "move";

export default function GapCloser() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const clock = useActivityClock();
  const userId = useActiveUser((s) => s.userId);
  const { profile } = useTargets();
  const dg = useDayGap(clock);
  const streak = useStreak(userId, clock);
  const toast = useToast();
  const profileDiet = profile.data?.diet ?? "non_veg";
  const [side, setSide] = useState<"veg" | "non_veg" | null>(null);
  const diet = dietForSwitch(profileDiet, side ?? switchSideFor(profileDiet));
  const [picked, setPicked] = useState<Tab | null>(params.tab === "move" || params.tab === "eat" ? params.tab : null);
  const [sheet, setSheet] = useState(false);
  const [eased, setEased] = useState(false);
  // Searching costs free-tier credits: only while there's something to close (D59).
  const nearby = useNearby(userId, diet, !!dg && (dg.gap.state === "under" || dg.gap.state === "on_track"));
  const nearbyOptions = nearby.state.status === "ready" ? nearby.state.result.options : [];
  const day = dg?.day ?? "";
  const eat = useEatOptions({
    userId,
    today: day,
    now: clock,
    gap: dg?.gap ?? null,
    diet,
    profileDiet,
    nearby: nearbyOptions,
  });
  const upcoming = useUpcomingEases(userId, day);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/today"));
  const header = <Header title="Close the gap" onBack={back} />;

  if (!dg) {
    return (
      <Screen header={header}>
        {profile.isPending ? (
          <>
            <Skeleton variant="card" height={160} />
            <Skeleton variant="card" height={120} />
          </>
        ) : (
          <EmptyState
            icon="tune"
            title="Set up your plan"
            body="Your gap is worked out from your daily targets."
            actionLabel="Set up my plan"
            onAction={() => router.push("/onboarding")}
          />
        )}
      </Screen>
    );
  }

  const gap = dg.gap;
  const late = isLateNight(dg.minute);
  const tab: Tab = picked ?? (gap.state === "over" ? "move" : "eat");
  const moves = movesFor(dg);
  const coach = profile.data?.coach;
  const facts = lineFacts(dg, streak);
  const situation = situationFor(dg, streak, false);
  const mealType = currentMealType(clock);

  const onEat = (o: EatOption) => {
    const a = o.action;
    if (a.kind === "repeat") {
      const copy = repeatMeal(a.meal, mealType);
      toast({
        kind: "success",
        message: `Logged as ${MEAL_LABEL[mealType].toLowerCase()}`,
        onUndo: () => deleteMeal(copy),
      });
    } else if (a.kind === "food") {
      draftActions.startWithFood(a.food, a.quantity, a.unit, mealType);
      router.push("/log/confirm");
    } else if (userId) {
      void openNearby(userId, a.option).then((ok) => {
        if (!ok)
          toast({ kind: "error", message: `Couldn't open ${a.option.source === "zomato" ? "Zomato" : "Blinkit"}` });
      });
    }
  };

  const ease = (perDay: number, days: number) => {
    if (!userId) return;
    addEase(userId, dg.day, perDay, days);
    setEased(true);
    toast({
      kind: "success",
      message: days > 1 ? `The next ${days} days ease by ${perDay} kcal` : `Tomorrow's target eases by ${perDay}`,
    });
  };

  const onMove = (o: MoveOption) => {
    if (o.kind === "ease") return ease(o.easePerDay, o.days);
    if (o.kind === "spread") ease(o.easePerDay, o.days);
    router.push({ pathname: "/activity/record", params: { kind: o.kind === "activity" ? o.activity : "walk" } });
  };

  const moveLabel = (o: MoveOption) =>
    o.kind === "ease"
      ? "Ease it"
      : o.kind === "activity" && o.activity === "ride"
        ? "Start ride"
        : o.kind === "activity" && o.activity === "run"
          ? "Start run"
          : "Start walk";

  return (
    <Screen header={header}>
      <Text variant="body" color="textSecondary">
        {late
          ? "Late evening. Gentle options only."
          : gap.state === "over"
            ? "Over today. Calm ways to balance it."
            : "Ways to close what's left today."}
      </Text>
      <GapHeader gap={gap} lateNight={late} />
      {coach ? <CoachLine coach={coach} line={coachLine(coach, situation, facts)} /> : null}

      <SegmentedControl
        accessibilityLabel="Eat or move"
        segments={[
          { value: "eat", label: tab === "eat" && eat.length ? `Eat (${eat.length})` : "Eat", icon: "restaurant" },
          { value: "move", label: "Move", icon: "directions_walk" },
        ]}
        value={tab}
        onChange={setPicked}
      />

      {tab === "eat" ? (
        <>
          <View style={styles.chips}>
            <Chip label="Veg" diet="veg" selected={diet === "veg" || diet === "jain"} onPress={() => setSide("veg")} />
            <Chip
              label="Non-veg"
              diet="non_veg"
              selected={diet === "eggetarian" || diet === "non_veg"}
              onPress={() => setSide("non_veg")}
            />
          </View>
          {gap.state === "over" ? (
            <NearbyNotice
              icon="info"
              title="You're over for today"
              body="No food suggestions while you're over. Move has calm ways to balance it."
              actionLabel="Move"
              onAction={() => setPicked("move")}
            />
          ) : gap.state === "done" ? (
            <NearbyNotice icon="check_circle" title="All goals hit" body="Nothing left to close today. Well done." />
          ) : eat.length ? (
            eat.map((o) => <GapOptionCard key={o.id} option={o} onAction={() => onEat(o)} />)
          ) : (
            <NearbyNotice
              icon="restaurant"
              title="Nothing fits right now"
              body="Log a few meals and your usuals show up here."
            />
          )}
          {gap.state !== "over" && gap.state !== "done" ? (
            nearby.state.status === "need_area" ? (
              <NearbyNotice
                icon="location_on"
                title="Find options near you"
                body="Zomato and Blinkit dishes for your area."
                actionLabel="Set area"
                onAction={() => setSheet(true)}
              />
            ) : nearby.state.status === "loading" ? (
              <Skeleton variant="card" height={96} />
            ) : nearby.state.status === "error" ? (
              <NearbyNotice
                icon="cloud_off"
                title="Couldn't load nearby options"
                body="Your other options still work. Try again in a bit."
                actionLabel="Retry"
                onAction={() => void nearby.retry()}
              />
            ) : (
              <NearbyNotice
                icon="location_on"
                title={nearbyOptions.length ? "Nearby options included" : "No nearby options fit"}
                body={`${nearby.pincode ? `Pincode ${nearby.pincode}` : "Your area"} · macros are AI estimates`}
                actionLabel="Change"
                onAction={() => setSheet(true)}
              />
            )
          ) : null}
        </>
      ) : moves.length ? (
        moves.map((o) => (
          <MoveOptionCard
            key={moveTitle(o)}
            option={o}
            actionLabel={moveLabel(o)}
            done={eased && (o.kind === "ease" || o.kind === "spread")}
            onAction={() => onMove(o)}
          />
        ))
      ) : (
        <NearbyNotice
          icon="bedtime"
          title={late ? "Rest up" : "Nothing to balance"}
          body={late ? "No late-night workouts. Tomorrow is a fresh start." : "You're not over today."}
        />
      )}
      {upcoming.length ? (
        <Text variant="caption" color="textSecondary">
          {`Eased: ${upcoming.map((u) => `${u.date.slice(5)} −${u.kcal} kcal`).join(" · ")}`}
        </Text>
      ) : null}

      <LocationSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        access={nearby.access}
        pincode={nearby.pincode}
        onAccess={(a) => void nearby.refreshAccess(a)}
        onPincode={nearby.setPin}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
