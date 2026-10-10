// Semantic colour tokens — BRAND_GUIDELINES.md §3.2, §3.3, §3.6.
import { palette as p } from "./primitives";

export type ThemeName = "dark" | "light";

export type ColorTokens = {
  bg: string;
  surfaceLowest: string;
  surfaceLow: string;
  surface: string;
  surfaceHigh: string;
  surfaceHighest: string;
  outline: string;
  outlineSoft: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  ink: string;
  primary: string;
  primaryShade: string;
  primaryText: string;
  secondary: string;
  secondaryText: string;
  tertiary: string;
  tertiaryText: string;
  streak: string;
  warn: string;
  warnContainer: string;
  error: string;
  errorContainer: string;
  veg: string;
  nonveg: string;
  dockBg: string;
  dockIcon: string;
  dockActiveBg: string;
  dockFabBg: string;
  dockFabIcon: string;
  scrim: string;
  // §3.3 data colours
  dataKcal: string;
  dataProtein: string;
  dataCarbs: string;
  dataFat: string;
  dataActivity: string;
  // §7.3 hero gradient stops
  heroGradient: readonly [string, string, string];
  // §3.6 coach bubbles (light theme tint; dark uses surfaceHigh + accent edge)
  coachBubble: { lime: string; lilac: string; orchid: string };
};

export const dark: ColorTokens = {
  bg: p.obsidian[1],
  surfaceLowest: p.obsidian[0],
  surfaceLow: p.obsidian[2],
  surface: p.obsidian[3],
  surfaceHigh: p.obsidian[4],
  surfaceHighest: p.obsidian[5],
  outline: p.obsidian.outline,
  outlineSoft: "rgba(255,255,255,0.06)",
  textPrimary: p.text.darkPrimary,
  textSecondary: p.text.darkSecondary,
  textTertiary: p.text.darkTertiary,
  ink: p.ink,
  primary: p.lime.base,
  primaryShade: p.lime.shade,
  primaryText: p.lime.base,
  secondary: p.lilac.base,
  secondaryText: p.lilac.base,
  tertiary: p.orchid.base,
  tertiaryText: p.orchid.base,
  streak: p.flame.base,
  warn: p.amber.base,
  warnContainer: p.container.warnDark,
  error: p.coral.base,
  errorContainer: p.container.errorDark,
  veg: p.veg.base,
  nonveg: p.nonveg.base,
  dockBg: p.paper[0],
  dockIcon: p.text.darkTertiary,
  dockActiveBg: p.lilac.base,
  dockFabBg: p.ink,
  dockFabIcon: p.lime.base,
  scrim: "rgba(0,0,0,0.6)",
  dataKcal: p.lime.base,
  dataProtein: p.orchid.base,
  dataCarbs: p.lime.base,
  dataFat: p.lilac.base,
  dataActivity: p.lilac.base,
  heroGradient: [p.lime.base, p.lime.highlight, p.lime.shade],
  coachBubble: { lime: p.obsidian[4], lilac: p.obsidian[4], orchid: p.obsidian[4] },
};

export const light: ColorTokens = {
  bg: p.paper[1],
  surfaceLowest: p.paper[0],
  surfaceLow: p.paper[0],
  surface: p.paper.alt,
  surfaceHigh: p.paper[2],
  surfaceHighest: p.paper[3],
  outline: p.paper.outline,
  outlineSoft: "rgba(22,24,27,0.06)",
  textPrimary: p.ink,
  textSecondary: p.text.lightSecondary,
  textTertiary: p.text.lightTertiary,
  ink: p.ink,
  primary: p.lime.base,
  primaryShade: p.lime.shade,
  primaryText: p.lime.deep,
  secondary: p.lilac.base,
  secondaryText: p.lilac.deep,
  tertiary: p.orchid.base,
  tertiaryText: p.orchid.deep,
  streak: p.flame.shade,
  warn: p.amber.deep,
  warnContainer: p.container.warnLight,
  error: p.coral.deep,
  errorContainer: p.container.errorLight,
  veg: p.veg.shade,
  nonveg: p.nonveg.shade,
  dockBg: p.ink,
  dockIcon: p.text.darkSecondary,
  dockActiveBg: p.lilac.base,
  dockFabBg: p.lime.base,
  dockFabIcon: p.ink,
  scrim: "rgba(22,24,27,0.4)",
  dataKcal: p.lime.base,
  dataProtein: p.orchid.base,
  dataCarbs: p.lime.base,
  dataFat: p.lilac.base,
  dataActivity: p.lilac.base,
  heroGradient: [p.lime.base, p.lime.highlight, p.lime.shade],
  coachBubble: p.coachBubbleLight,
};

export const colorThemes: Record<ThemeName, ColorTokens> = { dark, light };

/** Splash / pre-theme background (brand §13 — always the default dark `bg`). */
export const SPLASH_BG = p.obsidian[1];
