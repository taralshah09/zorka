// Floating dock (TabBar) — brand §7.1 and §8. Icon-only pill, 68 high, 16 above the nav inset.
// The tabs, with the (+) after `fabAfter` of them (Today · Train · (+) · Progress · Zorka; the bubble floats over every app). Active tab = 52 px dock-active-bg circle with an ink FILL-1
// icon. (+) = 56 px dock-fab-bg circle. Every tab has an accessibility label. No haptics on nav (§9).
import type { BottomTabBarProps } from "expo-router/tabs";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { PressableScale } from "./PressableScale";

const TAB_SIZE = 52;

export type DockTab ={ route: string; icon: IconName; label: string };

type Props = BottomTabBarProps & {
  tabs: readonly DockTab[];
  /** The (+) sits after this many tabs. */
  fabAfter: number;
  onFabPress: () => void;
};

export function Dock({ state, navigation, insets, tabs, fabAfter, onFabPress }: Props) {
  const { colors, radius, elevation, layout } = useTheme();
  const activeName = state.routes[state.index]?.name;

  const renderTab = (tab: DockTab) => {
    const route = state.routes.find((r) => r.name === tab.route);
    if (!route) return null;
    const focused = activeName === tab.route;
    return (
      <Pressable
        key={tab.route}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        style={styles.slot}
      >
        <View style={styles.tab}>
          {/* Always mounted with a fixed colour + exact radius; only opacity toggles. Flipping
              backgroundColor from transparent on a 9999-radius view renders square on Android. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: TAB_SIZE / 2, backgroundColor: colors.dockActiveBg, opacity: focused ? 1 : 0 },
            ]}
          />
          <Icon name={tab.icon} size={28} color={focused ? colors.ink : colors.dockIcon} filled={focused} />
        </View>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        { bottom: insets.bottom + layout.dockOffset, left: layout.screenMargin, right: layout.screenMargin },
      ]}
    >
      <View
        accessibilityRole="tablist"
        style={[
          styles.dock,
          {
            height: layout.dockHeight,
            padding: layout.dockInnerPadding,
            borderRadius: radius.full,
            backgroundColor: colors.dockBg,
            boxShadow: elevation.floating,
          },
        ]}
      >
        {tabs.slice(0, fabAfter).map(renderTab)}
        <View style={styles.slot}>
          <PressableScale
            onPress={onFabPress}
            accessibilityRole="button"
            accessibilityLabel="Quick log"
            style={[styles.fab, { borderRadius: radius.full, backgroundColor: colors.dockFabBg }]}
          >
            <Icon name="add" size={28} color={colors.dockFabIcon} />
          </PressableScale>
        </View>
        {tabs.slice(fabAfter).map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute" },
  dock: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slot: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48 },
  tab: { width: TAB_SIZE, height: TAB_SIZE, alignItems: "center", justifyContent: "center" },
  fab: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
});
