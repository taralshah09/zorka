// UX L5 · Voice items the catalog doesn't have get the web's estimate inline on the confirm sheet, instead of
// Create food opening once per item. Each one is looked up in the background (same query and cache as Create
// food's lookup, so opening the form later is instant); a found estimate fills the item, marked "estimate" and
// still to check. Nothing found (or offline): the item stays unmatched and the user fixes it by tapping.
import { useQueries } from "@tanstack/react-query";
import { useEffect } from "react";

import { foodFromServing } from "@/features/food/catalog";
import { foodLookupQuery } from "@/features/food/lookup";
import { draftActions, type Draft } from "@/features/log/draft";

/** Keys of the items still being looked up. */
export function useAutoEstimates(userId: string | null, draft: Draft | null, online: boolean): Set<string> {
  const pending = (draft?.autoAdd ?? [])
    .map((key) => draft?.items.find((i) => i.key === key))
    .filter((i) => !!i && !i.food && !i.snapshot && !!i.query.trim())
    .map((i) => ({ key: i!.key, name: i!.query }));

  const results = useQueries({
    queries: pending.map((p) => ({ ...foodLookupQuery(userId, p.name), enabled: online && !!userId })),
  });

  const settled = results.map((r) => (r.isSuccess ? r.data : r.isError ? "error" : null));
  const signature = JSON.stringify(settled.map((r) => (r === null ? 0 : r === "error" ? 1 : r.found ? 2 : 3)));
  useEffect(() => {
    settled.forEach((r, i) => {
      const p = pending[i];
      if (!p || r === null) return;
      const found = r === "error" ? null : r.food;
      if (!found) {
        draftActions.dropAutoAdd(p.key);
        return;
      }
      const unit = found.serving.unit;
      const liquid = unit === "glass";
      const food = foodFromServing({
        name: found.name,
        diet: found.diet ?? "veg",
        category: liquid ? "drink" : found.homeCooked ? "home_meal" : "snack",
        homeCooked: found.homeCooked,
        liquid,
        serving: { unit, grams: unit === "g" ? 100 : found.serving.grams },
        kcal: found.kcal,
        proteinG: found.proteinG,
        carbsG: found.carbsG,
        fatG: found.fatG,
      });
      draftActions.applyEstimate(p.key, food, !!found.diet);
    });
    // `signature` changes exactly when a lookup settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return new Set(online ? pending.filter((_, i) => settled[i] === null).map((p) => p.key) : []);
}
