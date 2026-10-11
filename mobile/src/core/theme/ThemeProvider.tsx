// Theme provider — dark by default (D12), persisted Dark/Light choice (brand §3.4).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SystemUI from "expo-system-ui";

import { kv, KV_KEYS } from "@/core/storage/kv";
import { elevation, layout, motion, radius, space, type Elevation } from "./layout";
import { colorThemes, type ColorTokens, type ThemeName } from "./semantic";
import { typeScale } from "./typography";

export type Theme = {
  name: ThemeName;
  isDark: boolean;
  colors: ColorTokens;
  elevation: Elevation;
  type: typeof typeScale;
  radius: typeof radius;
  space: typeof space;
  layout: typeof layout;
  motion: typeof motion;
};

type ThemeContextValue = { theme: Theme; setThemeName: (name: ThemeName) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_THEME: ThemeName = "dark";

function readStoredTheme(): ThemeName {
  const stored = kv.get(KV_KEYS.theme);
  return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
}

export function buildTheme(name: ThemeName): Theme {
  return {
    name,
    isDark: name === "dark",
    colors: colorThemes[name],
    elevation: elevation[name],
    type: typeScale,
    radius,
    space,
    layout,
    motion,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>(readStoredTheme);

  const setThemeName = useCallback((next: ThemeName) => {
    kv.set(KV_KEYS.theme, next);
    setName(next);
  }, []);

  const value = useMemo(() => ({ theme: buildTheme(name), setThemeName }), [name, setThemeName]);

  // Root view background behind screens (avoids a white flash during transitions).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(value.theme.colors.bg).catch(() => {});
  }, [value.theme.colors.bg]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Renders its children in a fixed theme, whatever the app's choice (P38 share cards are always dark, brand §14). */
export function ThemeScope({ name, children }: { name: ThemeName; children: ReactNode }) {
  const parent = useContext(ThemeContext);
  const value = useMemo(
    () => ({ theme: buildTheme(name), setThemeName: parent?.setThemeName ?? (() => {}) }),
    [name, parent?.setThemeName],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx.theme;
}

export function useThemeControls(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeControls must be used inside <ThemeProvider>");
  return ctx;
}
