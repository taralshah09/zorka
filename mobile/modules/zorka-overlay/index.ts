// The Zorka bubble's native module (Android only; docs/ASSISTANT_BAR_PLAN.md, D89). Loaded optionally: null on iOS, on
// web, in Expo Go and in a dev build made before this module existed, so callers hide the bubble settings there.
import { requireOptionalNativeModule } from "expo";

export type ZorkaOverlayModule = {
  /** "Display over other apps" is granted. */
  canDrawOverlays(): boolean;
  /** Opens Android's "Display over other apps" page for Zorka. */
  openOverlaySettings(): void;
  /** Starts the bubble service (foreground, with its notification). Needs canDrawOverlays(). */
  start(): void;
  stop(): void;
  isRunning(): boolean;
  /** Remembered across restarts: the boot receiver and the app's launch start the bubble when true. */
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** Shows a view model (overlayView.ts, JSON) in the bubble's card. */
  render(json: string): void;
  /** Opens Zorka at a deep link, from a headless task or the bubble. */
  openUrl(url: string): void;
};

export const ZorkaOverlay = requireOptionalNativeModule<ZorkaOverlayModule>("ZorkaOverlay");
