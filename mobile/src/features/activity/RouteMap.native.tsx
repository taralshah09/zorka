import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, TurboModuleRegistry, View } from "react-native";
import type { CameraRef } from "@maplibre/maplibre-react-native";
import { useNetwork } from "@/core/network/network";
import { useTheme } from "@/core/theme";
import { Button, Text } from "@/core/ui";
import { routeBounds, routeGeometry } from "@shared/domain/activityMap";
import { RouteSketch } from "./RouteSketch";
import type { RouteMapProps } from "./RouteMap";

// Older development builds and Expo Go must still be able to open the recorder.
const nativeMaps: typeof import("@maplibre/maplibre-react-native") | null = (() => {
  if (!TurboModuleRegistry.get("MLRNLogModule")) return null;
  try {
    // Native imports must be deferred until the development build includes MapLibre.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@maplibre/maplibre-react-native");
  } catch {
    return null;
  }
})();

export function RouteMap(props: RouteMapProps) {
  const online = useNetwork((s) => s.online);
  return <StreetRouteMap key={String(online)} {...props} online={online} />;
}

function StreetRouteMap({ points, mode = "summary", online }: RouteMapProps & { online: boolean }) {
  const { colors, radius } = useTheme();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [follow, setFollow] = useState(mode !== "summary");
  const camera = useRef<CameraRef>(null);
  const framed = useRef(false);
  const geometry = useMemo(() => routeGeometry(points), [points]);
  const bounds = useMemo(() => routeBounds(points), [points]);
  const last = points.at(-1);
  const first = points[0];
  const latitude = last?.latitude;
  const longitude = last?.longitude;
  const available = online && !!nativeMaps && !failed;

  // A slow or unreachable style server must never leave an empty map indefinitely.
  useEffect(() => {
    if (!available || ready) return;
    const timer = setTimeout(() => setFailed(true), 20000);
    return () => clearTimeout(timer);
  }, [available, ready, attempt]);

  useEffect(() => {
    if (!ready || !available) return;
    if (follow && latitude !== undefined && longitude !== undefined) {
      camera.current?.easeTo({ center: [longitude, latitude], duration: 500 });
      framed.current = true;
    }
  }, [ready, available, follow, latitude, longitude]);

  useEffect(() => {
    if (ready && available && !follow && !framed.current && bounds) {
      camera.current?.fitBounds(bounds, { padding: { top: 40, bottom: 40, left: 40, right: 40 }, duration: 0 });
      framed.current = true;
    }
  }, [ready, available, follow, bounds]);

  if (!available || !nativeMaps) {
    return (
      <View style={styles.container}>
        <Text variant="caption" color="textSecondary">
          {!nativeMaps
            ? "Rebuild the app to enable street maps."
            : !online
              ? mode === "summary"
                ? "Offline — showing your saved GPS route."
                : "Offline — GPS works without street maps."
              : "Street map unavailable. GPS works without street maps."}
        </Text>
        <RouteSketch points={points} />
        {online && nativeMaps ? (
          <Button
            label="Retry street map"
            variant="ghost"
            onPress={() => {
              setFailed(false);
              setReady(false);
              framed.current = false;
              setAttempt((n) => n + 1);
            }}
          />
        ) : null}
      </View>
    );
  }

  const { Map, Camera, GeoJSONSource, Layer } = nativeMaps;
  const markerData: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: "FeatureCollection",
    features:
      first && last
        ? [
            {
              type: "Feature",
              properties: { kind: "start" },
              geometry: { type: "Point", coordinates: [first.longitude, first.latitude] },
            },
            {
              type: "Feature",
              properties: { kind: "end" },
              geometry: { type: "Point", coordinates: [last.longitude, last.latitude] },
            },
          ]
        : [],
  };
  return (
    <View style={styles.container}>
      <View style={[styles.viewport, { borderRadius: radius.lg, backgroundColor: colors.surfaceHigh }]}>
        <Map
          key={attempt}
          style={styles.map}
          mapStyle="https://tiles.openfreemap.org/styles/liberty"
          androidView="texture"
          logo={false}
          attribution
          compass
          touchPitch={false}
          onDidFinishRenderingMapFully={() => setReady(true)}
          onDidFailLoadingMap={() => setFailed(true)}
          onRegionWillChange={(event) => {
            if (event.nativeEvent.userInteraction) setFollow(false);
          }}
        >
          <Camera
            ref={camera}
            maxZoom={19}
            initialViewState={
              last ? { center: [last.longitude, last.latitude], zoom: 16 } : { center: [0, 0], zoom: 1 }
            }
          />
          {ready ? (
            <>
              <GeoJSONSource id="zorka-route" data={geometry}>
                <Layer
                  id="zorka-route-outline"
                  type="line"
                  layout={{ "line-cap": "round", "line-join": "round" }}
                  paint={{ "line-color": colors.ink, "line-width": 7, "line-opacity": 0.75 }}
                />
                <Layer
                  id="zorka-route-line"
                  type="line"
                  layout={{ "line-cap": "round", "line-join": "round" }}
                  paint={{ "line-color": colors.dataActivity, "line-width": 4 }}
                />
              </GeoJSONSource>
              <GeoJSONSource id="zorka-endpoints" data={markerData}>
                <Layer
                  id="zorka-endpoint-dots"
                  type="circle"
                  paint={{
                    "circle-radius": 7,
                    "circle-stroke-width": 2,
                    "circle-stroke-color": colors.ink,
                    "circle-color": ["match", ["get", "kind"], "start", colors.primary, colors.dataActivity],
                  }}
                />
              </GeoJSONSource>
            </>
          ) : null}
        </Map>
        {!ready ? (
          <View pointerEvents="none" style={[styles.loading, { backgroundColor: colors.surfaceHigh }]}>
            <Text variant="caption">Loading street map…</Text>
          </View>
        ) : null}
      </View>
      <Button
        label={mode === "summary" ? "Fit route" : follow ? "Following location" : "Recenter"}
        variant="ghost"
        disabled={!ready || !last}
        onPress={() => {
          if (mode === "summary" && bounds)
            camera.current?.fitBounds(bounds, { padding: { top: 40, bottom: 40, left: 40, right: 40 }, duration: 400 });
          else if (last) {
            setFollow(true);
            camera.current?.easeTo({ center: [last.longitude, last.latitude], zoom: 16, duration: 400 });
          }
        }}
      />
      <Text variant="caption" color="textSecondary">
        {points.length
          ? "Start: lime · Latest point: lilac · Drag or pinch to explore"
          : "Waiting for GPS — your route will appear here."}
      </Text>
      <Text variant="caption" color="textSecondary">
        <Text variant="caption" color="textSecondary" onPress={() => void Linking.openURL("https://openfreemap.org/")}>
          OpenFreeMap
        </Text>
        {" · "}
        <Text variant="caption" color="textSecondary" onPress={() => void Linking.openURL("https://openmaptiles.org/")}>
          © OpenMapTiles
        </Text>
        {" · "}
        <Text
          variant="caption"
          color="textSecondary"
          onPress={() => void Linking.openURL("https://www.openstreetmap.org/copyright")}
        >
          © OpenStreetMap contributors
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  viewport: { height: 300, overflow: "hidden" },
  map: { flex: 1 },
  loading: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
