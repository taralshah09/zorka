// Toast — brand §8: floating surface-highest pill, icon + text + optional "Undo" in primary-text.
// Variants: success, info, error. One at a time; auto-hides after 3.5 s.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Text } from "./Text";

export type ToastKind = "success" | "info" | "error";
type ToastInput = { message: string; kind?: ToastKind; onUndo?: () => void };
type ToastState = ToastInput & { id: number };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((t: ToastInput) => setToast({ ...t, id: Date.now() }), []);
  const hide = useCallback(() => setToast(null), []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDone={hide} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

function ToastView({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  const { colors, radius, elevation, layout, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: motion.sheet, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: motion.sheet, useNativeDriver: true }).start(onDone);
    }, 3500);
    return () => clearTimeout(t);
  }, [anim, motion.sheet, onDone]);

  const kind = toast.kind ?? "success";
  const icon = kind === "success" ? "check_circle" : kind === "error" ? "error" : "info";
  const iconColor = kind === "success" ? colors.primaryText : kind === "error" ? colors.error : colors.secondaryText;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          bottom: insets.bottom + layout.dockOffset + layout.dockHeight + 12,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.pill,
          { backgroundColor: colors.surfaceHighest, borderRadius: radius.full, boxShadow: elevation.floating },
        ]}
      >
        <Icon name={icon} size={20} color={iconColor} filled />
        <Text variant="label" style={styles.flex} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.onUndo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            hitSlop={12}
            onPress={() => {
              toast.onUndo?.();
              onDone();
            }}
          >
            <Text variant="label-lg" color="primaryText">
              Undo
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 480,
  },
  flex: { flexShrink: 1 },
});
