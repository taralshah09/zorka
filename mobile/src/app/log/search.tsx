// S18 · Food search (P12). Built from DESIGN.md §6.4 (no export yet, D35). Searches the on-device catalog,
// so it works offline. Tabs when the query is empty: Recent · My foods (P13). With no recents yet, Recent
// shows popular everyday foods that fit the user's diet. Each row shows the portion the user logged last time
// (or one default portion), and its "+" logs that portion straight away (UX L2). Saved meals ("Your usual")
// live on quick-log (UX L1).
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { Food } from "@/core/api/types";
import { useNetwork } from "@/core/network/network";
import { Button, EmptyState, ErrorState, Header, Screen, SegmentedControl, Skeleton, Text, TextField } from "@/core/ui";
import { FoodRow } from "@/features/food/components";
import { formatPortion } from "@/features/food/format";
import {
  myFoods,
  nutritionOf,
  popularFoods,
  recentFoods,
  refreshCatalog,
  searchFoods,
  useCatalogStatus,
  useFoods,
} from "@/features/food/catalog";
import { finishPick, passParams, useFinishDraft, type PickParams } from "@/features/log/nav";
import { lastPortions, useMealsVersion } from "@/features/meals/store";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { portion, unitOptions, type FoodUnit } from "@shared/domain/food";

type Tab = "recent" | "mine";

export default function FoodSearch() {
  const params = useLocalSearchParams<PickParams>();
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const catalog = useFoods(userId);
  const status = useCatalogStatus();
  const diet = useTargets().profile.data?.diet ?? null;
  const [q, setQ] = useState(params.q ?? "");
  const [tab, setTab] = useState<Tab>("recent");
  const finish = useFinishDraft();
  const mealsV = useMealsVersion((s) => s.v);
  const lastUsed = useMemo(() => {
    void mealsV;
    return userId ? lastPortions(userId) : new Map<string, { quantity: number; unit: FoodUnit }>();
  }, [userId, mealsV]);

  const empty = catalog.length === 0;

  // First open with nothing cached: fetch now instead of waiting for the next app start.
  useEffect(() => {
    if (empty && online && userId && !useCatalogStatus.getState().loading) {
      refreshCatalog(userId, true).catch(() => {});
    }
  }, [empty, online, userId]);

  const { title, list } = useMemo((): { title: string | null; list: Food[] } => {
    void catalog; // re-read when the cache changes
    if (!userId) return { title: null, list: [] };
    if (q.trim()) return { title: null, list: searchFoods(userId, q) };
    if (tab === "mine") return { title: null, list: myFoods(userId) };
    const recent = recentFoods(userId);
    return recent.length ? { title: null, list: recent } : { title: "Popular", list: popularFoods(userId, diet) };
  }, [userId, q, tab, catalog, diet]);

  const open = (id: string) => router.push({ pathname: "/log/food/[id]", params: { id, ...passParams(params) } });
  const create = () => router.push({ pathname: "/log/create-food", params: { ...passParams(params), name: q.trim() } });
  const retry = () => {
    if (userId) refreshCatalog(userId, true).catch(() => {});
  };

  return (
    <Screen header={<Header title="Food search" onBack={() => router.back()} />}>
      <TextField
        label="Search foods"
        placeholder="Roti, rajma, hakka noodles…"
        value={q}
        onChangeText={setQ}
        autoFocus={!empty}
        returnKeyType="search"
        autoCorrect={false}
      />

      {empty ? (
        !online ? (
          <EmptyState
            icon="cloud_off"
            title="Foods aren't downloaded yet"
            body="Connect once to download the food list. After that, search works offline."
          />
        ) : status.error && !status.loading ? (
          <ErrorState title={status.error.title} body={status.error.body} onRetry={retry} />
        ) : (
          <>
            <Text variant="body" color="textSecondary">
              Loading foods… After this, search works offline.
            </Text>
            <Skeleton variant="card" height={72} />
            <Skeleton variant="card" height={72} />
            <Skeleton variant="card" height={72} />
          </>
        )
      ) : (
        <>
          {!q.trim() ? (
            <SegmentedControl<Tab>
              accessibilityLabel="Food lists"
              segments={[
                { value: "recent", label: "Recent", icon: "history" },
                { value: "mine", label: "My foods", icon: "person" },
              ]}
              value={tab}
              onChange={setTab}
            />
          ) : null}

          {title ? (
            <Text variant="eyebrow" color="textSecondary">
              {title}
            </Text>
          ) : null}

          {list.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="body" color="textSecondary">
                {q.trim() ? `No match for "${q.trim()}".` : "Foods you create show up here."}
              </Text>
            </View>
          ) : (
            list.map((f) => {
              const n = nutritionOf(f);
              const last = lastUsed.get(f.id);
              const usual = last && unitOptions(n).some((u) => u.unit === last.unit) ? last : null;
              const quantity = usual?.quantity ?? 1;
              const unit = usual?.unit ?? f.defaultUnit;
              const p = portion(n, quantity, unit);
              const amount = `${formatPortion(quantity, unit)} · ${Math.round(p.grams)} ${f.liquid ? "ml" : "g"}`;
              return (
                <FoodRow
                  key={f.id}
                  name={f.name}
                  diet={f.diet}
                  category={f.category}
                  meta={usual ? `Last time: ${amount}` : amount}
                  kcal={p.macros.kcal}
                  badge={f.custom ? "Mine" : undefined}
                  onPress={() => open(f.id)}
                  onAdd={() => finishPick(f, quantity, unit, params, finish)}
                />
              );
            })
          )}

          <Button label="Can't find it? Create a food" variant="ghost" icon="add_circle" onPress={create} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: 24, alignItems: "center" },
});
