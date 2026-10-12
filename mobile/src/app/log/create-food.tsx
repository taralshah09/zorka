// S20 · Create food (P13). Built from DESIGN.md §6.4 (no export yet, D35): name, diet tag, serving
// (e.g. "1 piece = 60 g"), kcal / P / C / F for that serving, Save. The food stays in the user's own
// account (visible only to them) and works offline at once.
// Voice (lookup=1): the food wasn't in the list, so its nutrition is looked up on the web and pre-fills the form; the
// person checks and edits it before saving.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import type { DietPref, FoodLookupResult } from "@/core/api/types";
import { Icon } from "@/core/icons/Icon";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { Button, Chip, Header, ListItem, Screen, Text, TextField, Toggle, Card, dietLabel } from "@/core/ui";
import { unitName } from "@/features/food/format";
import { createFood } from "@/features/food/catalog";
import { useFoodLookup } from "@/features/food/lookup";
import { passParams, type PickParams } from "@/features/log/nav";
import { useActiveUser } from "@/features/users/activeUser";
import type { FoodUnit } from "@shared/domain/food";

const DIETS: DietPref[] = ["veg", "eggetarian", "jain", "non_veg"];
const SERVINGS: FoodUnit[] = ["piece", "katori", "bowl", "plate_full", "glass", "serving", "g"];

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) ? n : null;
};

export default function CreateFood() {
  const params = useLocalSearchParams<PickParams & { name?: string; lookup?: string }>();
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const asked = params.lookup === "1";
  const lookup = useFoodLookup(userId, params.name ?? "", asked && online);
  const [name, setName] = useState(params.name ?? "");
  const [diet, setDiet] = useState<DietPref>("veg");
  const [homeCooked, setHomeCooked] = useState(true);
  const [unit, setUnit] = useState<FoodUnit>("piece");
  const [grams, setGrams] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [tried, setTried] = useState(false);

  // Fill in what the web lookup found, once, without overwriting anything typed while it loaded.
  const [filled, setFilled] = useState(false);
  const found = lookup.data?.food;
  if (found && !filled) {
    setFilled(true);
    const keep = (prev: string, n: number) => (prev.trim() ? prev : String(n));
    setName((prev) => prev.trim() || found.name);
    if (found.diet) setDiet(found.diet);
    setHomeCooked(found.homeCooked);
    setUnit(found.serving.unit);
    setGrams((prev) => keep(prev, found.serving.grams));
    setKcal((prev) => keep(prev, found.kcal));
    setProtein((prev) => keep(prev, found.proteinG));
    setCarbs((prev) => keep(prev, found.carbsG));
    setFat((prev) => keep(prev, found.fatG));
  }

  const g = unit === "g" ? 100 : num(grams);
  const k = num(kcal);
  const p = num(protein) ?? 0;
  const c = num(carbs) ?? 0;
  const f = num(fat) ?? 0;
  const liquid = unit === "glass";

  const errors = {
    name: !name.trim() ? "Give it a name" : undefined,
    grams: g === null || g <= 0 || g > 2000 ? "How much is one serving, in grams?" : undefined,
    kcal: k === null || k < 0 || k > 5000 ? "Calories for one serving" : undefined,
  };
  const valid = !errors.name && !errors.grams && !errors.kcal;
  // Sanity check, not a block: protein/carbs ×4 + fat ×9 should be near the calories.
  const atwater = 4 * p + 4 * c + 9 * f;
  const mismatch = k !== null && k > 0 && (p || c || f) && Math.abs(atwater - k) > Math.max(40, k * 0.3);

  const save = () => {
    setTried(true);
    if (!valid || !userId) return;
    const food = createFood(userId, {
      name,
      diet,
      category: liquid ? "drink" : homeCooked ? "home_meal" : "snack",
      homeCooked,
      liquid,
      serving: { unit, grams: g! },
      kcal: k!,
      proteinG: p,
      carbsG: c,
      fatG: f,
    });
    router.replace({ pathname: "/log/food/[id]", params: { id: food.id, ...passParams(params) } });
  };

  return (
    <Screen header={<Header title="Create a food" onBack={() => router.back()} />}>
      {asked ? (
        <LookupNotice
          name={params.name ?? ""}
          online={online}
          loading={lookup.isFetching}
          result={lookup.data}
          error={lookup.error}
          onRetry={() => void lookup.refetch()}
        />
      ) : null}

      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Mom's besan ladoo"
        error={tried ? errors.name : undefined}
      />

      <Text variant="eyebrow" color="textSecondary">
        Diet
      </Text>
      <View style={styles.wrap}>
        {DIETS.map((d) => (
          <Chip key={d} kind="choice" diet={d} label={dietLabel(d)} selected={diet === d} onPress={() => setDiet(d)} />
        ))}
      </View>

      <Card flush>
        <ListItem
          title="Home-cooked"
          subtitle="Gets the oil/ghee question when that's on"
          trailing={<Toggle value={homeCooked} onValueChange={setHomeCooked} accessibilityLabel="Home-cooked" />}
        />
      </Card>

      <Text variant="eyebrow" color="textSecondary">
        One serving is
      </Text>
      <View style={styles.wrap}>
        {SERVINGS.map((u) => (
          <Chip
            key={u}
            kind="choice"
            label={u === "g" ? "100 g" : `1 ${unitName(u)}`}
            selected={unit === u}
            onPress={() => setUnit(u)}
          />
        ))}
      </View>
      {unit !== "g" ? (
        <TextField
          label={`1 ${unitName(unit)} weighs about`}
          unit={liquid ? "ml" : "g"}
          keyboardType="decimal-pad"
          value={grams}
          onChangeText={setGrams}
          placeholder={liquid ? "250" : "60"}
          error={tried ? errors.grams : undefined}
        />
      ) : null}

      <Text variant="eyebrow" color="textSecondary">
        {unit === "g" ? "Per 100 g" : `Per 1 ${unitName(unit)}`}
      </Text>
      <TextField
        label="Calories"
        unit="kcal"
        keyboardType="decimal-pad"
        value={kcal}
        onChangeText={setKcal}
        error={tried ? errors.kcal : undefined}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="Protein" unit="g" keyboardType="decimal-pad" value={protein} onChangeText={setProtein} />
        </View>
        <View style={styles.flex}>
          <TextField label="Carbs" unit="g" keyboardType="decimal-pad" value={carbs} onChangeText={setCarbs} />
        </View>
        <View style={styles.flex}>
          <TextField label="Fat" unit="g" keyboardType="decimal-pad" value={fat} onChangeText={setFat} />
        </View>
      </View>
      {mismatch ? (
        <Text variant="caption" color="warn">
          {`Protein, carbs and fat add up to about ${Math.round(atwater)} kcal. Check the numbers.`}
        </Text>
      ) : null}

      <Button label="Save food" icon="check" onPress={save} fullWidth glow />
    </Screen>
  );
}

/** "Not in the list" + where the numbers came from, so the person knows to check them. */
function LookupNotice({
  name,
  online,
  loading,
  result,
  error,
  onRetry,
}: {
  name: string;
  online: boolean;
  loading: boolean;
  result: FoodLookupResult | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const source = result?.found ? result.source : null;
  const body = !online
    ? "You're offline, so we couldn't look it up. Fill in the numbers below."
    : loading
      ? "Looking up its nutrition online…"
      : source
        ? "We filled this in from the web. Check the numbers and edit anything before you save."
        : error
          ? `Couldn't look it up: ${describeError(error).body} Fill in the numbers below.`
          : "Couldn't find its nutrition online. Fill in the numbers below.";

  return (
    <Card>
      <View style={styles.noticeHead}>
        <Icon name="search" size={20} color={colors.warn} />
        <Text variant="title" style={styles.flex}>{`"${name}" isn't in our food list`}</Text>
      </View>
      <View style={styles.noticeBody}>
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        <Text variant="body" color="textSecondary" style={styles.flex}>
          {body}
        </Text>
      </View>
      {source ? (
        <Text
          variant="caption"
          color="textTertiary"
          numberOfLines={1}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(source.url)}
        >
          {`Source: ${source.title || source.url}`}
        </Text>
      ) : null}
      {error && !loading && online ? <Button label="Try again" variant="ghost" icon="refresh" onPress={onRetry} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  noticeHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  noticeBody: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
});
