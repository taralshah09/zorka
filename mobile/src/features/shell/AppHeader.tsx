// Tab-root header: logo lock-up + eyebrow · sync pill · profile avatar (opens S12 Settings).
import { router } from "expo-router";
import { Pressable } from "react-native";

import { SyncStatusPill } from "@/core/sync/SyncStatusPill";
import { Avatar, Header } from "@/core/ui";
import { useActiveUser } from "@/features/users/activeUser";
import { useProfile } from "@/features/users/api";

export function AppHeader({ eyebrow }: { eyebrow: string }) {
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);
  const name = profile.data?.displayName ?? "Profile";

  return (
    <Header
      eyebrow={eyebrow}
      right={
        <>
          <SyncStatusPill />
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings and profile"
            hitSlop={4}
          >
            <Avatar name={name} size={40} />
          </Pressable>
        </>
      }
    />
  );
}
