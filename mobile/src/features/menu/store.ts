// LA7 · Menu scans on the phone. The scan in progress (pages, what each page read) lives in memory; finished scans keep
// only their dishes (never the photos) in the local `menus` table for 30 days, so a return visit opens instantly
// ("Same place as last Friday?"). Phone only in v1.
import { randomUUID } from "expo-crypto";
import { create } from "zustand";

import type { MenuReadDish } from "@/core/api/types";
import { getDb } from "@/core/storage/db";
import type { MenuDish } from "@shared/domain/menu";

export const MENU_KEEP_DAYS = 30;
export const MAX_SCAN_PAGES = 12;

export type ScanPage = { uri: string; width: number; height: number };
export type PageState = { status: "waiting" | "reading" | "done" | "unreadable" | "error"; dishes: MenuDish[]; message?: string };

type Session = {
  pages: ScanPage[];
  results: PageState[];
  restaurant: string | null;
  /** A saved menu reopened from the list: no pages to read. */
  savedId: string | null;
};

export const useMenuScan = create<Session>(() => ({ pages: [], results: [], restaurant: null, savedId: null }));

export const scanActions = {
  reset: () => useMenuScan.setState({ pages: [], results: [], restaurant: null, savedId: null }),
  addPages(pages: ScanPage[]) {
    useMenuScan.setState((s) => ({ pages: [...s.pages, ...pages].slice(0, MAX_SCAN_PAGES) }));
  },
  removePage(index: number) {
    useMenuScan.setState((s) => ({ pages: s.pages.filter((_, i) => i !== index) }));
  },
  start() {
    useMenuScan.setState((s) => ({ results: s.pages.map(() => ({ status: "waiting", dishes: [] })), savedId: null }));
  },
  setResult(index: number, r: PageState, restaurant?: string | null) {
    useMenuScan.setState((s) => {
      const results = [...s.results];
      results[index] = r;
      return { results, restaurant: s.restaurant ?? restaurant ?? null };
    });
  },
  retake(index: number, page: ScanPage) {
    useMenuScan.setState((s) => {
      const pages = [...s.pages];
      pages[index] = page;
      const results = [...s.results];
      results[index] = { status: "waiting", dishes: [] };
      return { pages, results };
    });
  },
  open(saved: SavedMenu) {
    useMenuScan.setState({ pages: [], results: [{ status: "done", dishes: saved.dishes }], restaurant: saved.restaurant, savedId: saved.id });
  },
};

/** One page's AI dishes → MenuDish, with stable ids per page. */
export const toMenuDishes = (page: number, dishes: readonly MenuReadDish[]): MenuDish[] =>
  dishes.map((d, i) => ({
    id: `${page}-${i}`,
    page,
    name: d.name,
    gloss: d.gloss,
    section: d.section,
    price: d.price ?? undefined,
    veg: d.veg,
    tags: d.tags,
    est: d.est,
  }));

export type SavedMenu = { id: string; restaurant: string | null; dishes: MenuDish[]; scannedAt: string };

export function saveMenu(userId: string, restaurant: string | null, dishes: MenuDish[]): void {
  if (!dishes.length) return;
  const db = getDb();
  db.runSync(`DELETE FROM menus WHERE scanned_at < ?`, new Date(Date.now() - MENU_KEEP_DAYS * 86_400_000).toISOString());
  db.runSync(
    `INSERT INTO menus (id, user_id, restaurant, dishes, scanned_at) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    userId,
    restaurant,
    JSON.stringify(dishes),
    new Date().toISOString(),
  );
}

export function recentMenus(userId: string): SavedMenu[] {
  const since = new Date(Date.now() - MENU_KEEP_DAYS * 86_400_000).toISOString();
  return getDb()
    .getAllSync<{ id: string; restaurant: string | null; dishes: string; scanned_at: string }>(
      `SELECT * FROM menus WHERE user_id = ? AND scanned_at >= ? ORDER BY scanned_at DESC LIMIT 10`,
      userId,
      since,
    )
    .map((r) => {
      let dishes: MenuDish[] = [];
      try {
        dishes = JSON.parse(r.dishes) as MenuDish[];
      } catch {
        dishes = [];
      }
      return { id: r.id, restaurant: r.restaurant, dishes, scannedAt: r.scanned_at };
    })
    .filter((m) => m.dishes.length);
}
