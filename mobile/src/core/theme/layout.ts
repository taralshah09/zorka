// Shape, space and depth — BRAND_GUIDELINES.md §6 and §7.
import type { ThemeName } from "./semantic";

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 28,
  "2xl": 32,
  full: 9999,
} as const;

/** 4 px base scale (§7.1). Index with the px value: space[16]. */
export const space = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
} as const;

export const layout = {
  screenMargin: 16,
  cardPadding: 16,
  heroPadding: 20,
  cardGap: 12,
  sectionGap: 24,
  headerHeight: 64,
  dockHeight: 68,
  dockOffset: 16,
  dockInnerPadding: 6,
  /** Scroll content bottom padding so nothing hides behind the dock. */
  dockClearance: 112,
  minTouch: 48,
} as const;

export type Elevation = { card: string; floating: string; glow: string | undefined };

/** RN `boxShadow` strings (supported on Android with the New Architecture). Glow is dark-only (§7.3). */
export const elevation: Record<ThemeName, Elevation> = {
  dark: {
    card: "0px 8px 24px -4px rgba(0,0,0,0.45)",
    floating: "0px 16px 36px -6px rgba(0,0,0,0.6)",
    glow: "0px 0px 24px 0px rgba(211,231,108,0.25)",
  },
  light: {
    card: "0px 8px 24px -4px rgba(22,24,27,0.08)",
    floating: "0px 16px 36px -6px rgba(22,24,27,0.16)",
    glow: undefined,
  },
};

/** Motion timings — brand §9. */
export const motion = {
  press: { scale: 0.97, duration: 120 },
  sheet: 250,
  ringFirst: 600,
  ringChange: 400,
  number: 400,
} as const;
