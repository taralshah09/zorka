// Entry route: S00 splash while the active user's profile loads, then Today — or the S01
// profile picker on first launch, or onboarding (S02–S09, P09) when the profile isn't set up.
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";

import { useActiveUser } from "@/features/users/activeUser";
import { useProfile } from "@/features/users/api";
import { SplashView } from "@/features/users/SplashView";

/** Don't hold the splash longer than this, even on a slow network (the cached profile shows). */
const MAX_SPLASH_MS = 1500;

export default function Index() {
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), MAX_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (!userId) return <Redirect href="/profiles" />;
  if (profile.isFetching && !timedOut) return <SplashView />;
  // Offline with no cached profile: Today shows the error state with a retry.
  if (profile.data && !profile.data.onboardedAt) return <Redirect href="/onboarding" />;
  return <Redirect href="/today" />;
}
