// P22 · "Say a set" (S24 voice-add state). Hold to talk, release to add: same recording format as meal voice
// (D32), mic permission explained first (S49 gym variant). Offline, it hands over to typed entry instead of
// recording (D41), since a set is quicker to type than to queue.
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { File } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { BottomSheet, PressableScale, Text, useToast } from "@/core/ui";
import { VOICE_RECORDING } from "@/features/log/parse";
import { PermissionExplainer } from "@/features/permissions/PermissionExplainer";

const MAX_MS = 20_000;
const MIN_MS = 600;

type Perm = "unknown" | "granted" | "ask" | "denied";

const deleteFile = (uri: string | null) => {
  try {
    if (uri) new File(uri).delete();
  } catch {
    // Already gone.
  }
};

export function VoiceSetButton({
  busy,
  onRecorded,
  onOffline,
}: {
  /** A voice set is being read: the button shows a spinner state and ignores presses. */
  busy: boolean;
  onRecorded: (uri: string) => void;
  onOffline: () => void;
}) {
  const { colors, radius, elevation, isDark } = useTheme();
  const toast = useToast();
  const online = useNetwork((s) => s.online);
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const [perm, setPerm] = useState<Perm>("unknown");
  const [explain, setExplain] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const starting = useRef<Promise<void> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getRecordingPermissionsAsync()
      .then((p) => setPerm(p.granted ? "granted" : p.canAskAgain ? "ask" : "denied"))
      .catch(() => setPerm("ask"));
    return () => {
      if (ticker.current) clearInterval(ticker.current);
    };
  }, []);

  const start = () => {
    if (busy) return;
    if (!online) {
      onOffline();
      return;
    }
    if (perm !== "granted") {
      setExplain(true);
      return;
    }
    setElapsed(0);
    starting.current = (async () => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      ticker.current = setInterval(() => {
        const st = recorder.getStatus();
        if (!st.isRecording) return;
        setElapsed(st.durationMillis);
        if (st.durationMillis >= MAX_MS) void stop();
      }, 100);
    })();
  };

  const stop = async () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    await starting.current?.catch(() => {});
    starting.current = null;
    if (!recorder.isRecording) return;
    const duration = recorder.currentTime * 1000;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    setRecording(false);
    const uri = recorder.uri;
    if (!uri || duration < MIN_MS) {
      deleteFile(uri);
      toast({ kind: "info", message: "Keep holding while you talk." });
      return;
    }
    onRecorded(uri);
  };

  const ask = async () => {
    const p = await requestRecordingPermissionsAsync();
    setPerm(p.granted ? "granted" : "denied");
    setExplain(false);
  };

  const label = busy ? "Reading…" : recording ? `Listening… ${Math.floor(elapsed / 1000)} s` : "Say a set";
  return (
    <>
      <PressableScale
        onPressIn={start}
        onPressOut={() => void stop()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Hold to say a set"
        accessibilityHint='Hold and say it, like "bench 80 kilos, 8 reps". Release to add it.'
        style={[
          styles.button,
          {
            borderRadius: radius.full,
            backgroundColor: recording ? colors.primary : colors.surfaceHigh,
            borderColor: colors.primary,
          },
          recording && isDark ? { boxShadow: elevation.glow } : null,
        ]}
      >
        <Icon
          name={busy ? "hourglass_top" : "mic"}
          size={20}
          color={recording ? colors.ink : colors.primaryText}
          filled
        />
        <Text variant="label-lg" color={recording ? "ink" : "primaryText"} tabular>
          {label}
        </Text>
      </PressableScale>

      <BottomSheet visible={explain} onClose={() => setExplain(false)} size="medium">
        <View style={styles.sheet}>
          <PermissionExplainer
            kind="gym"
            denied={perm === "denied"}
            onContinue={ask}
            onNotNow={() => {
              setExplain(false);
              onOffline();
            }}
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderWidth: 1.5,
  },
  sheet: { flex: 1 },
});
