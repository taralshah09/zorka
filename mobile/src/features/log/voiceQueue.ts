// P16 offline voice: "Saved. We'll process it when you're back online." A voice note recorded without a
// connection is kept in the app's documents and listed on Today; once online the user opens it, it's
// read by the server and lands on the confirm sheet (nothing is ever saved without the user checking it).
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { useMemo } from "react";
import { create } from "zustand";

import { getDb } from "@/core/storage/db";
import type { MealType } from "@shared/domain/food";

export type VoiceNote = {
  id: string;
  userId: string;
  uri: string;
  mimeType: string;
  durationMs: number;
  mealType: MealType;
  createdAt: string;
};

const useVoiceVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useVoiceVersion.setState((s) => ({ v: s.v + 1 }));

export function queueVoice(
  userId: string,
  recordingUri: string,
  mimeType: string,
  durationMs: number,
  mealType: MealType,
): VoiceNote {
  const dir = new Directory(Paths.document, "voice-queue");
  if (!dir.exists) dir.create({ idempotent: true });
  const id = randomUUID();
  const kept = new File(dir, `${id}.m4a`);
  new File(recordingUri).copySync(kept);
  const note: VoiceNote = {
    id,
    userId,
    uri: kept.uri,
    mimeType,
    durationMs,
    mealType,
    createdAt: new Date().toISOString(),
  };
  getDb().runSync(
    `INSERT INTO voice_queue (id, user_id, uri, mime_type, duration_ms, meal_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    note.id,
    note.userId,
    note.uri,
    note.mimeType,
    note.durationMs,
    note.mealType,
    note.createdAt,
  );
  bump();
  return note;
}

export function removeVoice(note: VoiceNote) {
  try {
    const f = new File(note.uri);
    if (f.exists) f.delete();
  } catch {
    // The file may already be gone; the row is what matters.
  }
  getDb().runSync(`DELETE FROM voice_queue WHERE id = ?`, note.id);
  bump();
}

type Row = {
  id: string;
  user_id: string;
  uri: string;
  mime_type: string;
  duration_ms: number;
  meal_type: MealType;
  created_at: string;
};

export function useVoiceQueue(userId: string | null): VoiceNote[] {
  const v = useVoiceVersion((s) => s.v);
  return useMemo(() => {
    void v;
    if (!userId) return [];
    return getDb()
      .getAllSync<Row>(`SELECT * FROM voice_queue WHERE user_id = ? ORDER BY created_at`, userId)
      .map((r) => ({
        id: r.id,
        userId: r.user_id,
        uri: r.uri,
        mimeType: r.mime_type,
        durationMs: r.duration_ms,
        mealType: r.meal_type,
        createdAt: r.created_at,
      }));
  }, [userId, v]);
}
