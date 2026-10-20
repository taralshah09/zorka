// LA2/LA7 · Server calls for the life plan. Both are reads only: nothing is saved on the server (the brief syncs once the
// user confirms it; menu photos are never kept).
import { File } from "expo-file-system";

import { api } from "@/core/api/client";
import type { BriefParseResult, DietPref, MenuReadResult, Profile } from "@/core/api/types";
import { localDate } from "@shared/domain/food";
import { VOICE_MIME } from "@/features/log/parse";

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

type BriefInput = { forDate: string; profile: Profile | null | undefined; facts: string[] };

function context(input: BriefInput) {
  const now = new Date();
  const p = input.profile;
  return {
    forDate: input.forDate,
    today: localDate(now),
    localTime: hhmm(now),
    standing: p ? { mealSource: p.mealSource ?? null, budget: p.budget ?? null, workPattern: p.workPattern ?? null } : undefined,
    recentFacts: input.facts.slice(0, 8).map((f) => f.slice(0, 200)),
  };
}

export const parseBriefText = (userId: string, text: string, input: BriefInput) =>
  api<BriefParseResult>(`/users/${userId}/brief/parse`, { method: "POST", body: { text, ...context(input) }, timeoutMs: 30_000 });

export async function parseBriefVoice(userId: string, uri: string, input: BriefInput): Promise<BriefParseResult> {
  const audioBase64 = await new File(uri).base64();
  return api<BriefParseResult>(`/users/${userId}/brief/parse`, {
    method: "POST",
    body: { audioBase64, mimeType: VOICE_MIME, ...context(input) },
    timeoutMs: 45_000,
  });
}

/** One menu page (already resized on the phone). */
export const readMenuPage = (userId: string, imageBase64: string, page: number, diet: DietPref | null) =>
  api<MenuReadResult>(`/users/${userId}/menu/read`, {
    method: "POST",
    body: { imageBase64, mimeType: "image/jpeg", page, diet },
    timeoutMs: 45_000,
  });
