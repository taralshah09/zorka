// AB4 · Where an action sends the user (an `open`, "start a walk", Change on an approval). Inside Zorka that's a router
// push. From the bubble over another app (a headless task, no navigator) it opens Zorka at the same route through a
// deep link (scheme "zorka", app.json). The phone still picks every route; an action only names a screen (UX N1).
import { router, type Href } from "expo-router";
import { AppState } from "react-native";

import { ZorkaOverlay } from "../../../modules/zorka-overlay";

let uiMounted = false;
/** The root layout calls this: Zorka's screens (and so the router) exist in this JS runtime. */
export function markUiMounted(mounted: boolean) {
  uiMounted = mounted;
}

/** "/(tabs)/progress" → "zorka://progress"; `{ pathname, params }` → a query string. Route groups are dropped. */
export function hrefToUrl(href: Href): string {
  const raw = typeof href === "string" ? href : href.pathname;
  const params = typeof href === "string" ? {} : ((href.params ?? {}) as Record<string, unknown>);
  const [path, query] = raw.split("?");
  const clean = path!
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .join("/");
  // By hand: React Native's URLSearchParams is incomplete on Hermes.
  const pairs = (query ?? "").split("&").filter(Boolean);
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null) pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  const qs = pairs.join("&");
  return `zorka://${clean}${qs ? `?${qs}` : ""}`;
}

export function goTo(href: Href) {
  if (uiMounted && AppState.currentState === "active") {
    router.push(href);
    return;
  }
  ZorkaOverlay?.openUrl(hrefToUrl(href));
}
