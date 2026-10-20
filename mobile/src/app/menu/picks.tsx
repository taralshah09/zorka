// LA7 · What to order. Pages are read two at a time and dishes appear as each page finishes; one bad page fails alone
// ("Page 4 was hard to read. Retake?"). The AI only read the menu: picks, combos, tweaks and "go easy on" come from
// shared/domain/menu.ts against what's left today. Every number is an estimate with its range. "I ordered this" opens
// the usual confirm sheet; "It's a treat" spreads the extra over the rest of the week through the ledger (planWeek).
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import type { ParsedItem, ParseResult } from "@/core/api/types";
import { Badge, Button, Card, Chip, Header, ListItem, Screen, Text } from "@/core/ui";
import { useActivityClock } from "@/features/activity/store";
import { foodFromServing, nutritionOf, useFoods } from "@/features/food/catalog";
import { useDayGap } from "@/features/gap/gap";
import { readMenuPage } from "@/features/life/api";
import { useDayPlan } from "@/features/life/planner";
import { draftActions } from "@/features/log/draft";
import { useFinishDraft } from "@/features/log/nav";
import { saveMenu, scanActions, toMenuDishes, useMenuScan, type ScanPage } from "@/features/menu/store";
import { useProfile } from "@/features/users/api";
import { useActiveUser } from "@/features/users/activeUser";
import { excluded, scoreCandidate } from "@shared/domain/eatOptions";
import { localDate, mealTypeForTime, portion } from "@shared/domain/food";
import { bestMatch } from "@shared/domain/foodMatch";
import { mergeMenuPages, menuToCandidates, rankMenu, type MenuIntent, type RankedDish, type TweakCode } from "@shared/domain/menu";
import { planWeek } from "@shared/domain/week";

/** D33-style resize for menus: longer edge 1600 px (small print needs more than a meal photo), JPEG 0.7. */
const MENU_MAX_EDGE = 1600;
const MENU_QUALITY = 0.7;
const AT_ONCE = 2;
const AVOID = ["no paneer", "no rice", "no bread", "no fried"];

async function pageBase64(p: ScanPage): Promise<string> {
  const ctx = ImageManipulator.manipulate(p.uri);
  if (Math.max(p.width, p.height) > MENU_MAX_EDGE) ctx.resize(p.width >= p.height ? { width: MENU_MAX_EDGE } : { height: MENU_MAX_EDGE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: MENU_QUALITY, format: SaveFormat.JPEG, base64: true });
  return saved.base64 ?? "";
}

const TWEAK_TEXT: Record<TweakCode, (names: string[]) => string> = {
  less_butter_cream: (n) => `Ask for less butter and cream in ${n.join(", ")}.`,
  pick_rice_or_bread: () => "Pick rice or roti, not both.",
  swap_bread: (n) => `${n[1]}, not ${n[0]}.`,
  swap_tandoor: (n) => `Try ${n[1]} instead of ${n[0]}.`,
  share_platter: (n) => `${n.join(", ")} is for sharing: numbers shown are half.`,
};

const range = (d: RankedDish) => `≈ ${d.range.kcal[0]}–${d.range.kcal[1]} kcal · ${d.range.proteinG[0]}–${d.range.proteinG[1]} g protein${d.price != null ? ` · ₹${Math.round(d.price)}` : ""}`;

export default function MenuPicks() {
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);
  const { pages, results, restaurant, savedId } = useMenuScan();
  const foods = useFoods(userId);
  const clock = useActivityClock();
  const dg = useDayGap(clock);
  const today = localDate(new Date(clock));
  const todayPlan = useDayPlan(today, { save: "never" });
  const finish = useFinishDraft();
  const [intent, setIntent] = useState<MenuIntent>("on_plan");
  const [sharing, setSharing] = useState(false);
  const [avoid, setAvoid] = useState<string[]>([]);
  const started = useRef(new Set<number>());
  const savedOnce = useRef(false);
  const diet = profile.data?.diet ?? "non_veg";

  // Read the pages, AT_ONCE at a time. A retaken page goes back to "waiting" and is read again.
  useEffect(() => {
    if (!userId) return;
    const reading = results.filter((r) => r.status === "reading").length;
    const next = results.map((r, i) => ({ r, i })).filter(({ r, i }) => r.status === "waiting" && !started.current.has(i)).slice(0, Math.max(0, AT_ONCE - reading));
    for (const { i } of next) {
      started.current.add(i);
      const page = pages[i];
      if (!page) continue;
      scanActions.setResult(i, { status: "reading", dishes: [] });
      void (async () => {
        try {
          const res = await readMenuPage(userId, await pageBase64(page), i + 1, profile.data?.diet ?? null);
          scanActions.setResult(i, res.unreadable ? { status: "unreadable", dishes: [] } : { status: "done", dishes: toMenuDishes(i + 1, res.dishes) }, res.restaurant);
        } catch (e) {
          scanActions.setResult(i, { status: "error", dishes: [], message: describeError(e).body });
        }
      })();
    }
  }, [results, pages, userId, profile.data?.diet]);

  const allDone = results.length > 0 && results.every((r) => r.status !== "waiting" && r.status !== "reading");
  const dishes = useMemo(() => mergeMenuPages(results.map((r) => r.dishes)), [results]);
  useEffect(() => {
    if (allDone && !savedId && !savedOnce.current && userId && dishes.length) {
      savedOnce.current = true;
      saveMenu(userId, restaurant, dishes);
    }
  }, [allDone, savedId, userId, dishes, restaurant]);

  const left = dg?.gap.remaining;
  // Before targets exist there's no gap; rank for an ordinary meal.
  const remaining = useMemo(() => left ?? { kcal: 600, proteinG: 30, carbsG: 60, fatG: 20 }, [left]);
  const picks = useMemo(() => {
    const match = (name: string) => {
      const m = bestMatch(name, foods);
      return m ? { macros: portion(nutritionOf(m.food), 1, m.food.defaultUnit).macros, score: m.score } : null;
    };
    return rankMenu({
      candidates: menuToCandidates(dishes, { match, sharing }),
      diet,
      budget: profile.data?.budget ?? null,
      remaining,
      intent,
      avoid,
      mealType: mealTypeForTime(new Date(clock)),
      rank: { excluded, scoreCandidate },
    });
  }, [dishes, foods, sharing, diet, profile.data?.budget, remaining, intent, avoid, clock]);

  // "It's a treat": today takes the extra as an event allowance; the ledger spreads it over the days left.
  const treatLine = useMemo(() => {
    const input = todayPlan.input;
    if (intent !== "treat" || !input || !picks.treatKcal) return null;
    const ledger = input.ledger.map((d) => (d.date === today ? { ...d, allowanceKcal: (todayPlan.plan?.targets.kcal ?? d.baseKcal) + picks.treatKcal } : d));
    const week = planWeek(ledger, today, input.base.floorKcal, input.sessionsTarget, { goal: input.base.goal });
    const later = week.days.filter((d) => d.date > today);
    const lighter = later.length ? Math.round(later.reduce((s, d) => s + (input.base.kcal - d.kcal), 0) / later.length) : 0;
    return lighter > 0 ? `Enjoy it. The rest of the week is about ${lighter} kcal lighter.` : "Enjoy it. Nothing left this week to spread it over, so it's simply let go.";
  }, [intent, todayPlan.input, todayPlan.plan, picks.treatKcal, today]);

  const order = (items: { dish: RankedDish; quantity: number }[]) => {
    if (!userId) return;
    const parsed: ParsedItem[] = items.map(({ dish, quantity }) => {
      const food = foodFromServing({
        name: dish.name,
        diet: dish.diet ?? "veg",
        category: "restaurant",
        homeCooked: false,
        liquid: false,
        serving: { unit: "serving", grams: 250 },
        kcal: Math.round(dish.macros.kcal),
        proteinG: Math.round(dish.macros.proteinG),
        carbsG: Math.round(dish.macros.carbsG),
        fatG: Math.round(dish.macros.fatG),
      });
      return {
        query: dish.name,
        food,
        matchScore: null,
        quantity,
        unit: "serving",
        grams: 250 * quantity,
        macros: { kcal: dish.macros.kcal * quantity, proteinG: dish.macros.proteinG * quantity, carbsG: dish.macros.carbsG * quantity, fatG: dish.macros.fatG * quantity },
        confidence: 0.6,
        uncertain: true,
        reasons: ["low_confidence"],
      };
    });
    const result: ParseResult = {
      source: "text",
      transcript: null,
      items: parsed,
      followUp: null,
      timings: { sttMs: null, aiMs: 0, matchMs: 0, totalMs: 0 },
      ai: { slot: "menu", model: "menu", attempts: 0 },
    };
    draftActions.startFromParse(result, { mealType: mealTypeForTime(new Date()), userId });
    finish("push");
  };

  const retake = async (i: number) => {
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    started.current.delete(i);
    scanActions.retake(i, { uri: res.assets[0].uri, width: res.assets[0].width, height: res.assets[0].height });
  };

  const byId = new Map(picks.picks.concat(picks.goEasy).map((d) => [d.dishId, d.name]));
  const candidatesById = new Map(menuToCandidates(dishes).map((c) => [c.dishId, c.name]));
  const nameOf = (id: string) => byId.get(id) ?? candidatesById.get(id) ?? "that dish";

  return (
    <Screen header={<Header title={restaurant ?? "What to order"} onBack={() => { scanActions.reset(); router.back(); }} />}>
      {results.map((r, i) =>
        r.status === "reading" || r.status === "waiting" ? (
          <Text key={i} variant="caption" color="textSecondary">{`Reading page ${i + 1}…`}</Text>
        ) : r.status === "unreadable" || r.status === "error" ? (
          <Card key={i}>
            <Text variant="body">{r.status === "unreadable" ? `Page ${i + 1} was hard to read.` : `Page ${i + 1} couldn't be read. ${r.message ?? ""}`}</Text>
            {!savedId ? <Button label="Retake" size="sm" variant="secondary" onPress={() => void retake(i)} /> : null}
          </Card>
        ) : null,
      )}

      <Text variant="label">{"What's this meal?"}</Text>
      <View style={styles.chips}>
        <Chip label="Stay on plan" selected={intent === "on_plan"} onPress={() => setIntent("on_plan")} />
        <Chip label="It's a treat" selected={intent === "treat"} onPress={() => setIntent("treat")} />
        <Chip label="Just me" selected={!sharing} onPress={() => setSharing(false)} />
        <Chip label="Sharing" selected={sharing} onPress={() => setSharing(true)} />
      </View>
      <View style={styles.chips}>
        {AVOID.map((a) => (
          <Chip key={a} label={a.charAt(0).toUpperCase() + a.slice(1)} selected={avoid.includes(a)} onPress={() => setAvoid((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]))} />
        ))}
      </View>
      <Text variant="caption" color="textSecondary">{`${Math.max(0, Math.round(remaining.kcal))} kcal and ${Math.max(0, Math.round(remaining.proteinG))} g protein left today. All numbers are estimates.`}</Text>
      {treatLine ? <Text variant="body">{treatLine}</Text> : null}

      {picks.picks.length ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            Good picks
          </Text>
          {picks.picks.map((d) => (
            <View key={d.dishId} style={styles.pick}>
              <ListItem title={d.name} subtitle={range(d)} trailing={d.estimate ? <Badge label="≈ estimate" tone="estimate" /> : undefined} />
              <Button label="I ordered this" size="sm" variant="secondary" onPress={() => order([{ dish: d, quantity: 1 }])} />
            </View>
          ))}
        </Card>
      ) : dishes.length ? (
        <Text variant="body">{"Nothing on this menu fits what's left today. A small portion of something you like is fine."}</Text>
      ) : null}

      {picks.combos.map((c, i) => (
        <Card key={i}>
          <Text variant="eyebrow" color="textSecondary">
            A full meal
          </Text>
          <Text variant="title">{c.items.map((x) => `${x.quantity > 1 ? `${x.quantity} ` : ""}${x.dish.name}`).join(" + ")}</Text>
          <Text variant="caption" color="textSecondary">{`≈ ${Math.round(c.macros.kcal)} kcal · ${Math.round(c.macros.proteinG)} g protein${c.price != null ? ` · ₹${Math.round(c.price)}` : ""}`}</Text>
          <Button label="I ordered this" size="sm" variant="secondary" onPress={() => order(c.items)} />
        </Card>
      ))}

      {picks.tweaks.length ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            When you order
          </Text>
          {picks.tweaks.map((t) => (
            <Text key={t.code} variant="body">
              {TWEAK_TEXT[t.code](t.dishIds.map(nameOf))}
            </Text>
          ))}
        </Card>
      ) : null}

      {picks.goEasy.length ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            Go easy on
          </Text>
          {picks.goEasy.map((d) => (
            <ListItem key={d.dishId} title={d.name} subtitle={range(d)} />
          ))}
        </Card>
      ) : null}

      {allDone && !dishes.length ? (
        <Button label="Scan again" onPress={() => { scanActions.reset(); router.replace("/menu/scan"); }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pick: { gap: 4 },
});
