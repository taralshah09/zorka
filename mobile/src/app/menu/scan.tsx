// LA7 · Menu scan: shoot every page of the menu (or pick several from the gallery), remove or retake a page, Done.
// Pages are resized on the phone before they're read; the photos are never uploaded for keeps or saved on the server.
// A menu scanned in the last 30 days can be reopened straight away ("Same place as last Friday?").
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";

import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { Button, Card, Header, IconButton, ListItem, OfflineBanner, Screen, Text, useToast } from "@/core/ui";
import { MAX_SCAN_PAGES, recentMenus, scanActions, useMenuScan, type ScanPage } from "@/features/menu/store";
import { useActiveUser } from "@/features/users/activeUser";
import { weekdayShort } from "@/features/life/copy";

const asPage = (a: ImagePicker.ImagePickerAsset): ScanPage => ({ uri: a.uri, width: a.width, height: a.height });

export default function MenuScan() {
  const { radius } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const pages = useMenuScan((s) => s.pages);
  const toast = useToast();
  const saved = useMemo(() => (userId ? recentMenus(userId) : []), [userId]);

  const shoot = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return toast({ kind: "error", message: "Camera access is off. Pick the pages from the gallery." });
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!res.canceled && res.assets[0]) scanActions.addPages([asPage(res.assets[0])]);
  };
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_SCAN_PAGES - pages.length,
    });
    if (!res.canceled) scanActions.addPages(res.assets.map(asPage));
  };

  return (
    <Screen header={<Header title="Scan the menu" onBack={() => { scanActions.reset(); router.back(); }} />}>
      {!online ? <OfflineBanner mode="offline" /> : null}
      <Text variant="body" color="textSecondary">
        {"Take a photo of every page. Zorka reads the dishes and suggests what fits your day. Photos aren't kept."}
      </Text>

      {pages.length ? (
        <ScrollView horizontal contentContainerStyle={styles.strip} showsHorizontalScrollIndicator={false}>
          {pages.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={styles.thumbWrap}>
              <Image source={{ uri: p.uri }} style={[styles.thumb, { borderRadius: radius.md }]} accessibilityLabel={`Page ${i + 1}`} />
              <IconButton icon="close" accessibilityLabel={`Remove page ${i + 1}`} onPress={() => scanActions.removePage(i)} />
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.actions}>
        <Button label={pages.length ? "Next page" : "Take a photo"} icon="photo_camera" onPress={() => void shoot()} disabled={pages.length >= MAX_SCAN_PAGES} />
        <Button label="Add from gallery" icon="photo_library" variant="secondary" onPress={() => void pick()} disabled={pages.length >= MAX_SCAN_PAGES} />
      </View>
      <Text variant="caption" color="textSecondary">{`${pages.length} of up to ${MAX_SCAN_PAGES} pages`}</Text>
      <Button
        label="Done, read the menu"
        disabled={!pages.length || !online}
        onPress={() => {
          scanActions.start();
          router.replace("/menu/picks");
        }}
      />

      {saved.length ? (
        <Card>
          <Text variant="eyebrow" color="textSecondary">
            Same place as before?
          </Text>
          {saved.map((m) => (
            <ListItem
              key={m.id}
              icon="history"
              title={m.restaurant ?? "A menu you scanned"}
              subtitle={`${weekdayShort(m.scannedAt.slice(0, 10))} ${m.scannedAt.slice(0, 10)} · ${m.dishes.length} dishes`}
              chevron
              onPress={() => {
                scanActions.open(m);
                router.replace("/menu/picks");
              }}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8 },
  thumbWrap: { alignItems: "center", gap: 4 },
  thumb: { width: 96, height: 128 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
