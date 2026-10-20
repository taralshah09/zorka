// S14 · Photo capture & review (P17). Built from DESIGN.md §6.4 (no export yet, D35). Uses the system
// camera / photo picker (expo-image-picker, D33) rather than an in-app viewfinder. States: choose,
// camera permission (S49), recognising, not recognised ("Couldn't tell. Try search?"), offline, error.
// UX F6: offline (or when the connection drops mid-read) the photo is kept and waits on Today, like a voice note;
// opened from there (`queued=<id>`) it's read at once.
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { File } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { ApiError, describeError } from "@/core/api/client";
import { Icon } from "@/core/icons/Icon";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { Button, ErrorState, Header, OfflineBanner, Screen, Skeleton, Text, useToast } from "@/core/ui";
import { draftActions } from "@/features/log/draft";
import { mealTypeParam, useFinishDraft } from "@/features/log/nav";
import { parsePhoto, preparePhoto } from "@/features/log/parse";
import { queuePhoto, useVoiceQueue } from "@/features/log/voiceQueue";
import { PermissionExplainer } from "@/features/permissions/PermissionExplainer";
import { useActiveUser } from "@/features/users/activeUser";
import { mealTypeForTime } from "@shared/domain/food";

type Phase = "choose" | "explain" | "denied" | "recognising" | "not_recognised" | "error";

export default function PhotoCapture() {
  const params = useLocalSearchParams<{ mealType?: string; queued?: string }>();
  const { colors, radius, layout } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const finish = useFinishDraft();
  const toast = useToast();
  const queue = useVoiceQueue(userId);
  const queuedNote = params.queued ? queue.find((n) => n.id === params.queued && n.kind === "photo") : undefined;
  const mealType = queuedNote?.mealType ?? mealTypeParam(params);
  const [phase, setPhase] = useState<Phase>("choose");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [cameraAsked, setCameraAsked] = useState<boolean | null>(null);
  const pendingCapture = useRef<ReturnType<typeof queuePhoto> | null>(null);

  useEffect(() => {
    ImagePicker.getCameraPermissionsAsync().then((p) => setCameraAsked(p.granted || !p.canAskAgain));
  }, []);

  const saveForLater = (uri: string) => {
    if (!userId) return;
    queuePhoto(userId, uri, mealType ?? mealTypeForTime(new Date()));
    toast({ kind: "info", message: "Photo saved. We'll read it when you're back online." });
    router.back();
  };

  const read = async (photo: { uri: string; base64: string }) => {
    if (!userId) return;
    setPhase("recognising");
    setPhotoUri(photo.uri);
    if (queuedNote && draftActions.resumeCapture(userId, queuedNote.id)) { finish("replace"); return; }
    const capture = queuedNote ?? (pendingCapture.current?.uri === photo.uri ? pendingCapture.current : null) ?? queuePhoto(userId, photo.uri, mealType ?? mealTypeForTime(new Date()));
    pendingCapture.current = capture;
    try {
      const { result, clientMs } = await parsePhoto(userId, photo.base64);
      if (useActiveUser.getState().userId !== userId) return;
      if (!result.items.length) {
        setPhase("not_recognised");
        return;
      }
      draftActions.startFromParse(result, { mealType: capture.mealType, photoUri: photo.uri, clientMs, loggedAt: capture.createdAt, captureId: capture.id, userId });
      finish("replace");
    } catch (e) {
      if (!queuedNote && e instanceof ApiError && (e.kind === "network" || e.kind === "timeout")) {
        toast({ kind: "info", message: "Photo saved on this phone. Estimate pending." });
        router.back();
        return;
      }
      setError(describeError(e));
      setPhase("error");
    }
  };

  const recognise = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!userId) return;
    setPhase("recognising");
    try {
      const photo = await preparePhoto(asset.uri, asset.width, asset.height);
      if (!online) {
        saveForLater(photo.uri);
        return;
      }
      await read(photo);
    } catch (e) {
      setError(describeError(e));
      setPhase("error");
    }
  };

  // A photo saved offline, opened from Today: read it straight away once online.
  const queuedRan = useRef(false);
  useEffect(() => {
    if (!queuedNote || queuedRan.current || !online) return;
    queuedRan.current = true;
    setPhotoUri(queuedNote.uri);
    new File(queuedNote.uri)
      .base64()
      .then((base64) => read({ uri: queuedNote.uri, base64 }))
      .catch((e: unknown) => {
        setError(describeError(e));
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedNote, online]);

  const takePhoto = async () => {
    const perm = await ImagePicker.getCameraPermissionsAsync();
    if (!perm.granted) {
      setPhase(perm.canAskAgain ? "explain" : "denied");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!res.canceled && res.assets[0]) void recognise(res.assets[0]);
  };

  const askCamera = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    setCameraAsked(true);
    if (p.granted) {
      setPhase("choose");
      void takePhoto();
    } else {
      setPhase("denied");
    }
  };

  // Android 13+ uses the system photo picker, which needs no permission.
  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!res.canceled && res.assets[0]) void recognise(res.assets[0]);
  };

  const toSearch = () => router.replace({ pathname: "/log/search", params: { mode: "new", mealType: mealType ?? "" } });
  const toType = () => router.replace({ pathname: "/log/type", params: { mealType: mealType ?? "" } });

  return (
    <Screen header={<Header title="Photo log" onBack={() => router.back()} />}>
      {phase === "explain" || phase === "denied" ? (
        <PermissionExplainer
          kind="camera"
          denied={phase === "denied"}
          onContinue={askCamera}
          onNotNow={() => setPhase("choose")}
        />
      ) : phase === "recognising" ? (
        <>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={[styles.photo, { borderRadius: radius.lg }]}
              accessibilityLabel="Your meal photo"
            />
          ) : (
            <Skeleton variant="card" height={260} />
          )}
          <View style={styles.row}>
            <Icon name="auto_awesome" size={20} color={colors.secondaryText} />
            <Text variant="headline-sm">Recognising…</Text>
          </View>
          <Skeleton variant="line" />
          <Skeleton variant="line" />
        </>
      ) : phase === "not_recognised" ? (
        <>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={[styles.photo, { borderRadius: radius.lg }]}
              accessibilityLabel="Your meal photo"
            />
          ) : null}
          <Text variant="headline-md">{"Couldn't tell. Try search?"}</Text>
          <Text variant="body" color="textSecondary">
            Mixed dishes are hard to read from a photo. Searching or typing is quicker here.
          </Text>
          <Button label="Search" icon="search" onPress={toSearch} fullWidth />
          <Button label="Type it instead" variant="secondary" icon="keyboard" onPress={toType} fullWidth />
          <Button label="Retake" variant="ghost" icon="photo_camera" onPress={() => setPhase("choose")} fullWidth />
        </>
      ) : phase === "error" && error ? (
        <>
          <ErrorState title={error.title} body={error.body} />
          <Button label="Try another photo" onPress={() => setPhase("choose")} fullWidth />
          <Button label="Search instead" variant="ghost" icon="search" onPress={toSearch} fullWidth />
        </>
      ) : (
        <>
          {!online ? <OfflineBanner mode="offline" /> : null}
          <View
            style={[
              styles.frame,
              {
                borderColor: colors.outline,
                borderRadius: radius.xl,
                padding: layout.heroPadding,
                backgroundColor: colors.surfaceLow,
              },
            ]}
          >
            <Icon name="restaurant" size={28} color={colors.textSecondary} />
            <Text variant="headline-sm">Fit the whole plate</Text>
            <Text variant="body" color="textSecondary" style={styles.textCenter}>
              {"Shoot from above, in good light. You'll check every item before saving."}
            </Text>
          </View>
          {!online ? (
            <Text variant="body" color="textSecondary">
              {"You're offline. Take the photo now: it's kept, and read when you're back online."}
            </Text>
          ) : null}
          <Button
            label="Take a photo"
            icon="photo_camera"
            onPress={cameraAsked === false ? () => setPhase("explain") : takePhoto}
            fullWidth
            glow
          />
          <Button
            label="Choose from gallery"
            variant="secondary"
            icon="photo_library"
            onPress={pickFromGallery}
            fullWidth
          />
          {!online ? (
            <Button label="Search instead" variant="ghost" icon="search" onPress={toSearch} fullWidth />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", aspectRatio: 4 / 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  frame: {
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    minHeight: 220,
    justifyContent: "center",
  },
  textCenter: { textAlign: "center" },
});
