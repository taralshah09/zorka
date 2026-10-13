// S16 · Confirm sheet (P12, P15–P18). Layout from the s16_confirm_sheet export: title card, oil/ghee
// question (P18), follow-up question (P17), item rows (uncertain = amber, brand §3.5), add item, totals,
// Save. Not shipped from the export: the "Desi Gut Balance" health-claim card and "High Accuracy 94%"
// (brand §11: no unverifiable claims), and emoji on the oil chips.
// Leaving with changes (header back, Android back, swipe) asks "Discard changes?" first (UX L6). Opened with
// `add=1` ("Add to {meal}" on Home, UX F8), search opens on top in add mode. Voice items the catalog doesn't have
// are looked up on the web in the background and shown as an "estimate" (UX L5); tapping one opens Create food.
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { Badge, Button, Dialog, EmptyState, Header, reactMascot, Screen, Text, useToast } from "@/core/ui";
import { FollowUpCard, FoodItemRow, MacroTotals, MealTypeSelector, OilGheePrompt } from "@/features/food/components";
import { formatKcal, formatPortion, MEAL_LABEL, stepQuantity } from "@/features/food/format";
import {
  draftActions,
  draftTotals,
  isDraftDirty,
  itemMacros,
  oilApplies,
  saveDraft,
  unmatchedItems,
  useDraft,
  type DraftItem,
} from "@/features/log/draft";
import { useAutoEstimates } from "@/features/log/estimates";
import { formatDayLong } from "@/features/targets/format";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";

const SOURCE_BADGE = { text: "AI read", voice: "AI read", photo: "AI read", search: null, repeat: "Repeat" } as const;

export default function ConfirmSheet() {
  const { colors, radius, layout } = useTheme();
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const draft = useDraft((s) => s.draft);
  const { profile, targets } = useTargets();
  const promptOn = !!profile.data?.oilGheePrompt;
  const params = useLocalSearchParams<{ add?: string }>();
  const navigation = useNavigation();
  const online = useNetwork((s) => s.online);
  const looking = useAutoEstimates(userId, draft, online);
  // Set while leaving on purpose (save, or "Discard"), so the guard below lets the screen go.
  const leaving = useRef(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (leaving.current) return;
        if (!isDraftDirty()) {
          draftActions.clear();
          return;
        }
        e.preventDefault();
        setPendingLeave(() => () => navigation.dispatch(e.data.action));
      }),
    [navigation],
  );

  // "Add to {meal}": open search once, on top of the meal being edited.
  const addOpened = useRef(false);
  useEffect(() => {
    if (params.add === "1" && !addOpened.current) {
      addOpened.current = true;
      router.push({ pathname: "/log/search", params: { mode: "add" } });
    }
  }, [params.add]);

  if (!draft || !userId) {
    return (
      <Screen header={<Header title="Check and save" onBack={() => router.back()} />}>
        <EmptyState icon="restaurant" title="Nothing to check" actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const totals = draftTotals(draft, promptOn);
  const showOil = oilApplies(draft, promptOn);
  const normalKcal = showOil ? draftTotals({ ...draft, oilLevel: "normal" }, promptOn).kcal : totals.kcal;
  const unmatched = unmatchedItems(draft);
  const uncertain = draft.items.filter((i) => i.uncertain && i.food).length;
  const at = new Date(draft.loggedAt);
  const clock = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  // A meal for an earlier day (picked on Today) shows its day too.
  const time = localDate(at) === localDate(new Date()) ? clock : `${formatDayLong(at)} · ${clock}`;
  const badge = SOURCE_BADGE[draft.source];
  const meal = MEAL_LABEL[draft.mealType];

  const openItem = (item: DraftItem) => {
    if (item.estimate) {
      // Check the web's numbers in Create food (the lookup is cached, so it opens filled in).
      router.push({
        pathname: "/log/create-food",
        params: { mode: "replace", key: item.key, name: item.query, lookup: "1" },
      });
    } else if (!item.food && !item.snapshot) {
      router.push({ pathname: "/log/search", params: { mode: "replace", key: item.key, q: item.query } });
    } else {
      router.push({ pathname: "/log/edit-item", params: { key: item.key } });
    }
  };

  const removeItem = (item: DraftItem, name: string) => {
    const prev = draft;
    draftActions.removeItem(item.key);
    toast({ kind: "info", message: `Removed ${name}`, onUndo: () => draftActions.restore(prev) });
  };

  const save = () => {
    const editing = !!draft.mealId;
    saveDraft(userId, promptOn);
    reactMascot("happy");
    toast({ kind: "success", message: editing ? `${meal} updated` : `${meal} saved · ${formatKcal(totals.kcal)}` });
    // Navigate first; clearing the draft re-renders this screen, which is gone by then.
    leaving.current = true;
    router.dismissTo("/(tabs)/today");
    draftActions.clear();
  };

  const discard = () => {
    const go = pendingLeave;
    setPendingLeave(null);
    leaving.current = true;
    go?.();
    draftActions.clear();
  };

  const saveHint =
    draft.items.length === 0
      ? "Add at least one item."
      : looking.size
        ? "Looking up the rest…"
        : unmatched.length
          ? `Fix or remove ${unmatched.length === 1 ? `"${unmatched[0]!.query}"` : `${unmatched.length} items`} to save.`
          : null;

  return (
    <Screen header={<Header title="Check and save" onBack={() => router.back()} />}>
      <View
        style={[
          styles.titleCard,
          { backgroundColor: colors.surfaceLow, borderRadius: radius.lg, padding: layout.cardPadding },
        ]}
      >
        <Text variant="headline-md" accessibilityRole="header">{`${meal} — check and save`}</Text>
        <View style={styles.titleMeta}>
          <Icon name="schedule" size={16} color={colors.textSecondary} />
          <Text variant="caption" color="textSecondary">
            {time}
          </Text>
          {badge ? (
            <Badge label={badge} tone="lilac" icon={draft.source === "repeat" ? "replay" : "auto_awesome"} />
          ) : null}
          {__DEV__ && draft.parseMs !== null ? (
            <Text variant="caption" color="textTertiary">{`read in ${(draft.parseMs / 1000).toFixed(1)} s`}</Text>
          ) : null}
        </View>
        <MealTypeSelector value={draft.mealType} onChange={draftActions.setMealType} />
      </View>

      {draft.photoUri ? (
        <Image
          source={{ uri: draft.photoUri }}
          style={[styles.photo, { borderRadius: radius.lg }]}
          accessibilityLabel="Your meal photo"
        />
      ) : null}

      {draft.transcript ? <Text variant="body" color="textSecondary">{`You said: "${draft.transcript}"`}</Text> : null}

      {draft.followUp ? (
        <FollowUpCard
          question={draft.followUp.question}
          options={draft.followUp.options}
          answered={draft.followUp.answered}
          onAnswer={draftActions.answerFollowUp}
        />
      ) : null}

      {showOil ? (
        <OilGheePrompt value={draft.oilLevel} onChange={draftActions.setOil} deltaKcal={totals.kcal - normalKcal} />
      ) : null}

      <View style={styles.listHead}>
        <Text variant="eyebrow" color="textSecondary" style={styles.flex}>
          {`Items (${draft.items.length})`}
        </Text>
        {uncertain ? <Text variant="caption" color="warn">{`${uncertain} to check`}</Text> : null}
      </View>

      {draft.items.map((item) => {
        const m = itemMacros(draft, item, promptOn);
        const unmatchedItem = !item.food && !item.snapshot;
        const name = item.food?.name ?? item.snapshot?.name ?? item.query;
        const lookingUp = looking.has(item.key);
        const step = (dir: 1 | -1) => {
          const q = item.food ? stepQuantity(item.quantity, item.unit, dir) : null;
          return q === null ? null : () => draftActions.setQuantity(item.key, q);
        };
        return (
          <FoodItemRow
            key={item.key}
            name={name}
            diet={item.estimate && !item.estimate.dietKnown ? null : (item.food?.diet ?? item.snapshot?.diet ?? null)}
            portion={formatPortion(item.quantity, item.unit)}
            kcal={m.kcal}
            proteinG={m.proteinG}
            state={unmatchedItem && !lookingUp ? "unmatched" : item.uncertain || lookingUp ? "uncertain" : "ok"}
            note={
              lookingUp
                ? "Looking it up…"
                : unmatchedItem
                  ? `Couldn't find "${item.query}"`
                  : item.estimate
                    ? "Estimate from the web · tap to check"
                    : item.reasons.includes("vague_quantity")
                      ? "How much? Tap to fix"
                      : undefined
            }
            onPress={() => openItem(item)}
            onRemove={() => removeItem(item, name)}
            onStep={item.food ? { down: step(-1), up: step(1) } : undefined}
          />
        );
      })}

      <Button
        label="Add another item"
        variant="secondary"
        icon="add_circle"
        onPress={() => router.push({ pathname: "/log/search", params: { mode: "add" } })}
        fullWidth
      />

      <MacroTotals
        totals={totals}
        caption={targets ? `${Math.round((totals.kcal / targets.kcal) * 100)}% of today's target` : undefined}
      />

      <Button
        label={`Save ${meal.toLowerCase()} · ${formatKcal(totals.kcal)}`}
        icon="check"
        onPress={save}
        disabled={!!saveHint}
        accessibilityHint={saveHint ?? undefined}
        glow
        fullWidth
        size="lg"
      />
      {saveHint ? (
        <Text variant="caption" color="warn" style={styles.center}>
          {saveHint}
        </Text>
      ) : null}

      <Dialog
        visible={!!pendingLeave}
        title="Discard changes?"
        body={draft.mealId ? "Your edits to this meal won't be saved." : "This meal won't be logged."}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={discard}
        onCancel={() => setPendingLeave(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center" },
  titleCard: { gap: 10 },
  titleMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  photo: { width: "100%", aspectRatio: 4 / 3 },
  listHead: { flexDirection: "row", alignItems: "center", marginTop: 4 },
});
