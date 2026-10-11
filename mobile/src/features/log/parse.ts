// AI parsing calls (P15–P17). Each returns the server's ParseResult plus the round-trip time measured on
// the phone (the P15 "under ~5 s" check). The server may try several AI keys, so timeouts are longer.
import { File, Paths, Directory } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { api } from "@/core/api/client";
import type { ParseResult } from "@/core/api/types";

export type Timed = { result: ParseResult; clientMs: number };

async function timed(fn: () => Promise<ParseResult>): Promise<Timed> {
  const t0 = Date.now();
  const result = await fn();
  const clientMs = Date.now() - t0;
  if (__DEV__) {
    console.log(
      `[parse] ${result.source}: ${clientMs} ms on phone · server ${result.timings.totalMs} ms (stt ${result.timings.sttMs ?? "-"}, ai ${result.timings.aiMs}) via ${result.ai.slot}`,
    );
  }
  return { result, clientMs };
}

export const parseText = (userId: string, text: string) =>
  timed(() =>
    api<ParseResult>(`/users/${userId}/meals/parse-text`, { method: "POST", body: { text }, timeoutMs: 25_000 }),
  );

/** Voice notes are m4a/AAC (D32). */
export const VOICE_MIME = "audio/mp4";

export async function parseVoice(userId: string, uri: string): Promise<Timed> {
  const audioBase64 = await new File(uri).base64();
  return timed(() =>
    api<ParseResult>(`/users/${userId}/meals/parse-voice`, {
      method: "POST",
      body: { audioBase64, mimeType: VOICE_MIME },
      timeoutMs: 45_000,
    }),
  );
}

/** D33: longest edge 1024 px, JPEG quality 0.7 (~150–300 KB). */
export const PHOTO_MAX_EDGE = 1024;
export const PHOTO_QUALITY = 0.7;

/** Resizes and compresses a picked photo, and keeps a copy in the app's documents (S21 shows it). */
export async function preparePhoto(
  uri: string,
  width: number,
  height: number,
): Promise<{ uri: string; base64: string }> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > PHOTO_MAX_EDGE) {
    ctx.resize(width >= height ? { width: PHOTO_MAX_EDGE } : { height: PHOTO_MAX_EDGE });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG, base64: true });
  const dir = new Directory(Paths.document, "meal-photos");
  if (!dir.exists) dir.create({ idempotent: true });
  const kept = new File(dir, `${Date.now()}.jpg`);
  new File(saved.uri).copySync(kept);
  return { uri: kept.uri, base64: saved.base64 ?? (await kept.base64()) };
}

export const parsePhoto = (userId: string, imageBase64: string) =>
  timed(() =>
    api<ParseResult>(`/users/${userId}/meals/parse-photo`, {
      method: "POST",
      body: { imageBase64, mimeType: "image/jpeg" },
      timeoutMs: 45_000,
    }),
  );
