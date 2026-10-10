// Entry route: S00 splash while the active user's profile loads, then Today — or the S01
// profile picker on first launch. (Onboarding S02–S09 slots in here at P09.)
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
  return <Redirect href="/today" />;
}
