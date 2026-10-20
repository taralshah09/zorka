// P16 offline voice: "Saved. We'll process it when you're back online." A voice note recorded without a
// connection is kept in the app's documents and listed on Today; once online the user opens it, it's
// read by the server and lands on the confirm sheet (nothing is ever saved without the user checking it).
// UX F6: a photo or a typed meal made offline waits in the same queue (`kind`), and opens its own screen to be read.
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import type { Href } from "expo-router";
import { useMemo } from "react";
import { create } from "zustand";

import { getDb } from "@/core/storage/db";
import { logTime } from "@/features/today/selectedDay";
import type { MealType } from "@shared/domain/food";

export type QueuedKind = "voice" | "photo" | "text";

export type VoiceNote = {
  id: string;
  userId: string;
  kind: QueuedKind;
  /** The recording or the photo; '' for typed text. */
  uri: string;
  mimeType: string;
  durationMs: number;
  mealType: MealType;
  /** Typed meals only. */
  text: string | null;
  createdAt: string;
};

const useVoiceVersion = create<{ v: number }>(() => ({ v: 0 }));
const bump = () => useVoiceVersion.setState((s) => ({ v: s.v + 1 }));

function insert(note: VoiceNote): VoiceNote {
  getDb().runSync(
    `INSERT INTO voice_queue (id, user_id, uri, mime_type, duration_ms, meal_type, created_at, kind, text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    note.id,
    note.userId,
    note.uri,
    note.mimeType,
    note.durationMs,
    note.mealType,
    note.createdAt,
    note.kind,
    note.text,
  );
  bump();
  return note;
}

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
  return insert({
    id,
    userId,
    kind: "voice",
    uri: kept.uri,
    mimeType,
    durationMs,
    mealType,
    text: null,
    createdAt: logTime().toISOString(),
  });
}

/** `photoUri` is already kept in the app's documents (preparePhoto); it becomes the meal's photo once read. */
export const queuePhoto = (userId: string, photoUri: string, mealType: MealType): VoiceNote =>
  insert({
    id: randomUUID(),
    userId,
    kind: "photo",
    uri: photoUri,
    mimeType: "image/jpeg",
    durationMs: 0,
    mealType,
    text: null,
    createdAt: logTime().toISOString(),
  });

export const queueText = (userId: string, text: string, mealType: MealType, captureId?: string): VoiceNote => {
  const existing = captureId ? getCapture(userId, captureId) : null;
  if (existing) return existing;
  return insert({
    id: captureId ?? randomUUID(),
    userId,
    kind: "text",
    uri: "",
    mimeType: "text/plain",
    durationMs: 0,
    mealType,
    text,
    createdAt: logTime().toISOString(),
  });
};
export function getCapture(userId: string, id: string): VoiceNote | null {
  const r = getDb().getFirstSync<Row>(`SELECT * FROM voice_queue WHERE user_id = ? AND id = ?`, userId, id);
  return r ? { id: r.id, userId: r.user_id, kind: r.kind, uri: r.uri, mimeType: r.mime_type,
    durationMs: r.duration_ms, mealType: r.meal_type, text: r.text, createdAt: r.created_at } : null;
}

/**
 * Drops a queued item. Its file goes too, except a photo that was read: that file is now the meal's photo
 * (`keepFile`).
 */
export function removeVoice(note: VoiceNote, keepFile = false) {
  if (note.uri && !keepFile) {
    try {
      const f = new File(note.uri);
      if (f.exists) f.delete();
    } catch {
      // The file may already be gone; the row is what matters.
    }
  }
  getDb().runSync(`DELETE FROM voice_queue WHERE id = ?`, note.id);
  bump();
}

/** Recoverable dismissal: the source file remains available for Undo. */
export function restoreVoice(note: VoiceNote) {
  if (!getDb().getFirstSync(`SELECT id FROM voice_queue WHERE id = ?`, note.id)) insert(note);
}

/** The screen that reads a queued item. */
export const queuedHref = (note: VoiceNote): Href => ({
  pathname: note.kind === "photo" ? "/log/photo" : note.kind === "text" ? "/log/type" : "/log/voice",
  params: { queued: note.id },
});

/** How a queued item is named on Today. */
export function queuedLabel(notes: readonly VoiceNote[]): string {
  const kinds = new Set(notes.map((n) => n.kind));
  if (notes.length > 1)
    return kinds.size === 1 && kinds.has("voice")
      ? `${notes.length} voice notes to check`
      : `${notes.length} meals to check`;
  const n = notes[0];
  return n?.kind === "photo"
    ? "A meal photo to check"
    : n?.kind === "text"
      ? "A typed meal to check"
      : "A voice note to check";
}

type Row = {
  id: string;
  user_id: string;
  kind: QueuedKind;
  uri: string;
  mime_type: string;
  duration_ms: number;
  meal_type: MealType;
  text: string | null;
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
        kind: r.kind,
        uri: r.uri,
        mimeType: r.mime_type,
        durationMs: r.duration_ms,
        mealType: r.meal_type,
        text: r.text,
        createdAt: r.created_at,
      }));
  }, [userId, v]);
}
