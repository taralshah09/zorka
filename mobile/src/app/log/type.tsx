// S15 · Type a meal (P15). Built from DESIGN.md §6.4 (no export yet, D35): a multiline field, recent
// phrases as chips, Log. Text → AI → food DB → confirm sheet. Needs a connection; search works offline.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { kv } from "@/core/storage/kv";
import { Button, Chip, ErrorState, Header, OfflineBanner, Screen, Text, TextField } from "@/core/ui";
import { draftActions } from "@/features/log/draft";
import { mealTypeParam } from "@/features/log/nav";
import { parseText } from "@/features/log/parse";
import { useActiveUser } from "@/features/users/activeUser";

const phrasesKey = (userId: string) => `zorka.typedMeals.${userId}`;
const MAX_PHRASES = 6;

function readPhrases(userId: string | null): string[] {
  if (!userId) return [];
  try {
    return JSON.parse(kv.get(phrasesKey(userId)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export default function TypeMeal() {
  const params = useLocalSearchParams<{ mealType?: string }>();
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const phrases = readPhrases(userId);

  const submit = async () => {
    const t = text.trim();
    if (!t || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const { result, clientMs } = await parseText(userId, t);
      kv.set(phrasesKey(userId), JSON.stringify([t, ...phrases.filter((p) => p !== t)].slice(0, MAX_PHRASES)));
      if (result.items.length === 0) {
        setError({ title: "No food found in that", body: 'Try naming the dishes, like "2 roti, 1 katori dal".' });
        return;
      }
      draftActions.startFromParse(result, { mealType: mealTypeParam(params), clientMs });
      router.replace("/log/confirm");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header title="Type a meal" onBack={() => router.back()} />}>
      {!online ? <OfflineBanner mode="offline" /> : null}
      <TextField
        label="What did you eat?"
        placeholder="2 roti, 1 katori dal, paneer bhurji"
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        maxLength={500}
      />
      {phrases.length ? (
        <View style={styles.chips}>
          {phrases.map((p) => (
            <Chip key={p} label={p} onPress={() => setText(p)} />
          ))}
        </View>
      ) : null}

      {error ? (
        <ErrorState title={error.title} body={error.body} onRetry={online ? submit : undefined} retrying={busy} />
      ) : null}

      {online ? (
        <Button
          label={busy ? "Reading your meal…" : "Log"}
          icon="auto_awesome"
          onPress={submit}
          loading={busy}
          disabled={!text.trim()}
          glow
          fullWidth
        />
      ) : (
        <Text variant="body" color="textSecondary">
          Reading a typed meal needs a connection. Search works offline.
        </Text>
      )}
      <Button
        label="Search instead"
        variant="ghost"
        icon="search"
        onPress={() =>
          router.replace({ pathname: "/log/search", params: { mode: "new", mealType: params.mealType ?? "" } })
        }
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
