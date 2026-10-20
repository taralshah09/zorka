// S13 · Voice capture (P16). Built from DESIGN.md §6.4 (no export yet, D35). Hold to talk, release to log:
// m4a → speech-to-text → the P15 pipeline → confirm sheet. States: permission (S49), ready, listening
// (live level bars), reading ("Reading your meal…"), no speech, saved offline (queued), error.
// Whisper isn't streaming, so the transcript shows on the confirm sheet, not live while talking.
// The mic starts once the hold ring around the button has filled (HOLD_MS); a shorter press is tap-to-start, and
// the next tap stops (UX L4). From the quick-log mic (`autostart=1`) it starts listening as soon as it can.
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { File } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ApiError, describeError } from "@/core/api/client";
import { Icon } from "@/core/icons/Icon";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { Button, ErrorState, Header, Screen, Text } from "@/core/ui";
import { draftActions } from "@/features/log/draft";
import { HoldToTalk } from "@/features/log/HoldToTalk";
import { mealTypeParam, useFinishDraft } from "@/features/log/nav";
import { parseVoice, VOICE_MIME, VOICE_RECORDING } from "@/features/log/parse";
import { queueVoice, useVoiceQueue, type VoiceNote } from "@/features/log/voiceQueue";
import { PermissionExplainer } from "@/features/permissions/PermissionExplainer";
import { useActiveUser } from "@/features/users/activeUser";
import { mealTypeForTime } from "@shared/domain/food";

const MAX_MS = 60_000;
const MIN_MS = 700;
const BARS = 28;

type Phase = "checking" | "explain" | "denied" | "ready" | "recording" | "reading" | "no_speech" | "queued" | "error";

const deleteFile = (uri: string | null) => {
  try {
    if (uri) new File(uri).delete();
  } catch {
    // Already gone.
  }
};

export default function VoiceCapture() {
  const params = useLocalSearchParams<{ mealType?: string; queued?: string; autostart?: string }>();
  const { colors, radius, elevation, isDark } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const queue = useVoiceQueue(userId);
  const finish = useFinishDraft();
  const mealType = mealTypeParam(params) ?? mealTypeForTime(new Date());

  const recorder = useAudioRecorder(VOICE_RECORDING);
  const [phase, setPhase] = useState<Phase>(params.queued ? "reading" : "checking");
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [elapsedMs, setElapsedMs] = useState(0);
  // Started with a tap (not a hold): the next tap stops.
  const [latched, setLatched] = useState(false);
  const autostarted = useRef(false);
  const starting = useRef<Promise<void> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTicker = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };
  useEffect(() => stopTicker, []);

  const read = useCallback(
    async (uri: string, note?: VoiceNote) => {
      if (!userId) return;
      setPhase("reading");
      if (note && draftActions.resumeCapture(userId, note.id)) { finish("replace"); return; }
      const capture = note ?? queueVoice(userId, uri, VOICE_MIME, elapsedMs, mealType);
      try {
        const { result, clientMs } = await parseVoice(userId, capture.uri);
        if (useActiveUser.getState().userId !== userId) return;
        if (!result.items.length) {
          setPhase("no_speech");
          return;
        }
        draftActions.startFromParse(result, { mealType: capture.mealType, clientMs, loggedAt: capture.createdAt, captureId: capture.id, userId });
        finish("replace");
      } catch (e) {
        // Lost the connection mid-way: keep the note for later instead of losing it.
        if (!note && e instanceof ApiError && (e.kind === "network" || e.kind === "timeout")) {
          deleteFile(uri);
          setPhase("queued");
          return;
        }
        setError(describeError(e));
        setPhase("error");
      }
    },
    [userId, mealType, elapsedMs, finish],
  );

  // A queued note opened from Today: read it straight away.
  const queuedNote = queue.find((n) => n.id === params.queued);
  const startedQueued = useRef(false);
  useEffect(() => {
    if (queuedNote && !startedQueued.current) {
      startedQueued.current = true;
      void read(queuedNote.uri, queuedNote);
    }
  }, [queuedNote, read]);

  // Permission check on first open (S49: explain before the system prompt).
  useEffect(() => {
    if (params.queued) return;
    getRecordingPermissionsAsync().then((p) => setPhase(p.granted ? "ready" : p.canAskAgain ? "explain" : "denied"));
  }, [params.queued]);

  const askPermission = async () => {
    const p = await requestRecordingPermissionsAsync();
    setPhase(p.granted ? "ready" : "denied");
  };

  const start = () => {
    setHint(null);
    setLevels(Array(BARS).fill(0));
    setElapsedMs(0);
    starting.current = (async () => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase("recording");
      // Poll the recorder: live level bars from metering (dBFS, about -60 … 0), elapsed time, and the
      // auto-stop at the limit (D32).
      stopTicker();
      ticker.current = setInterval(() => {
        const st = recorder.getStatus();
        if (!st.isRecording) return;
        const level = Math.max(0, Math.min(1, ((st.metering ?? -60) + 60) / 60));
        setLevels((l) => [...l.slice(1), level]);
        setElapsedMs(st.durationMillis);
        if (st.durationMillis >= MAX_MS) void stop();
      }, 80);
    })();
  };

  const stop = async () => {
    const tapped = latched;
    setLatched(false);
    stopTicker();
    await starting.current?.catch(() => {});
    starting.current = null;
    if (!recorder.isRecording) return;
    const duration = recorder.currentTime * 1000;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (!uri || duration < MIN_MS) {
      deleteFile(uri);
      setHint(tapped ? "Too short. Tap and say your meal." : "Keep holding while you talk.");
      setPhase("ready");
      return;
    }
    if (!online && userId) {
      queueVoice(userId, uri, VOICE_MIME, duration, mealType);
      deleteFile(uri);
      setPhase("queued");
      return;
    }
    void read(uri);
  };

  const startTapped = () => {
    setLatched(true);
    start();
  };

  // Quick log's mic: one tap there means "listen now", so start once the mic is ready (also right after the
  // permission ask).
  useEffect(() => {
    if (params.autostart && phase === "ready" && !autostarted.current) {
      autostarted.current = true;
      startTapped();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autostart, phase]);

  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <Screen header={<Header title="Voice log" onBack={() => router.back()} />} scroll={false}>
      {phase === "explain" || phase === "denied" ? (
        <PermissionExplainer
          kind="microphone"
          denied={phase === "denied"}
          onContinue={askPermission}
          onNotNow={() => router.replace({ pathname: "/log/type", params: { mealType } })}
        />
      ) : phase === "reading" ? (
        <View style={styles.center}>
          <View style={[styles.mic, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}>
            <Icon name="auto_awesome" size={28} color={colors.secondaryText} />
          </View>
          <Text variant="headline-md">Reading your meal…</Text>
          <Text variant="body" color="textSecondary">
            Usually a few seconds.
          </Text>
        </View>
      ) : phase === "queued" ? (
        <View style={styles.center}>
          <Icon name="cloud_off" size={28} color={colors.textSecondary} />
          <Text variant="headline-md" style={styles.textCenter}>
            {"Saved. We'll read it when you're back online."}
          </Text>
          <Text variant="body" color="textSecondary" style={styles.textCenter}>
            {"You'll find it on Today. Want to log it now instead?"}
          </Text>
          <Button
            label="Type instead"
            icon="keyboard"
            onPress={() => router.replace({ pathname: "/log/type", params: { mealType } })}
            fullWidth
          />
          <Button
            label="Search instead"
            variant="ghost"
            icon="search"
            onPress={() => router.replace({ pathname: "/log/search", params: { mode: "new", mealType } })}
            fullWidth
          />
          <Button label="Done" variant="ghost" onPress={() => router.back()} fullWidth />
        </View>
      ) : phase === "error" && error ? (
        <View style={styles.center}>
          <ErrorState title={error.title} body={error.body} />
          <Button label="Try again" onPress={() => setPhase("ready")} fullWidth />
          <Button
            label="Type instead"
            variant="ghost"
            icon="keyboard"
            onPress={() => router.replace({ pathname: "/log/type", params: { mealType } })}
            fullWidth
          />
        </View>
      ) : (
        <View style={styles.center}>
          {phase === "no_speech" ? (
            <Text variant="headline-sm" style={styles.textCenter}>
              {"We didn't catch that. Hold the button and try again, close to the phone."}
            </Text>
          ) : (
            <Text variant="headline-md" style={styles.textCenter}>
              {phase === "recording" ? "Listening…" : "What did you eat?"}
            </Text>
          )}
          <Text variant="body" color="textSecondary" style={styles.textCenter}>
            {phase === "recording"
              ? `${seconds} s · ${latched ? "tap to log" : "release to log"}`
              : 'Tap or hold the button and say it, like "2 roti, 1 katori rajma, a glass of chaas".'}
          </Text>

          <View style={styles.bars} accessible={false}>
            {levels.map((l, i) => (
              <View
                key={i}
                style={{
                  width: 4,
                  height: 6 + l * 54,
                  borderRadius: 2,
                  backgroundColor: phase === "recording" ? colors.primary : colors.outline,
                }}
              />
            ))}
          </View>

          <HoldToTalk
            onArmed={start}
            onRelease={() => void stop()}
            onTap={startTapped}
            latched={latched && phase === "recording"}
            disabled={phase === "checking"}
            accessibilityLabel={latched ? "Stop and log" : "Talk"}
            accessibilityHint={
              latched
                ? "Stops listening and reads your meal"
                : "Tap to start and tap again to stop, or hold while you talk"
            }
            style={[
              styles.mic,
              styles.micBig,
              { backgroundColor: colors.primary, borderRadius: radius.full },
              isDark || phase === "recording" ? { boxShadow: elevation.glow } : null,
            ]}
          >
            <Icon name={latched ? "stop" : "mic"} size={28} color={colors.ink} filled />
          </HoldToTalk>
          <Text variant="label" color={hint ? "warn" : "textSecondary"}>
            {hint ?? (phase === "recording" ? (latched ? "Tap to log" : "Release to log") : "Tap or hold to talk")}
          </Text>
          {!online ? (
            <Text variant="caption" color="textSecondary" style={styles.textCenter}>
              {"You're offline. Your voice note is saved and read when you're back online."}
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  textCenter: { textAlign: "center" },
  mic: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  micBig: { width: 112, height: 112 },
  bars: { flexDirection: "row", alignItems: "center", gap: 4, height: 64 },
});
