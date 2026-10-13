// S15 · Type a meal (P15). Built from DESIGN.md §6.4 (no export yet, D35): a multiline field, recent
// phrases as chips, Log. Text → AI → food DB → confirm sheet. Needs a connection; search works offline.
// UX N1: a coach button opens this with `text` and `auto=1`, and the meal is read straight away.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { kv } from "@/core/storage/kv";
import { Button, Chip, ErrorState, Header, OfflineBanner, Screen, Text, TextField } from "@/core/ui";
import { draftActions } from "@/features/log/draft";
import { mealTypeParam, useFinishDraft } from "@/features/log/nav";
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
  const params = useLocalSearchParams<{ mealType?: string; text?: string; auto?: string }>();
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const finish = useFinishDraft();
  const [text, setText] = useState(params.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const phrases = readPhrases(userId);

  const submit = async (value: string = text) => {
    const t = value.trim();
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
      finish("replace");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  // Read a coach-suggested meal once, as soon as the screen opens (offline it just waits, prefilled).
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || params.auto !== "1" || !params.text || !online || !userId) return;
    autoRan.current = true;
    void submit(params.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, userId]);

  return (
    <Screen header={<Header title="Type a meal" onBack={() => router.back()} />}>
      {!online ? <OfflineBanner mode="offline" /> : null}
      <TextField
        label="What did you eat?"
        placeholder="2 roti, 1 katori dal, paneer bhurji"
        value={text}
        onChangeText={setText}
        multiline
        autoFocus={!params.auto}
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
        <ErrorState
          title={error.title}
          body={error.body}
          onRetry={online ? () => void submit() : undefined}
          retrying={busy}
        />
      ) : null}

      {online ? (
        <Button
          label={busy ? "Reading your meal…" : "Read meal"}
          icon="auto_awesome"
          onPress={() => void submit()}
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
