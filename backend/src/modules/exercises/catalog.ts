// Turns the curated exercise rows (prisma/data/exercises.ts) into records. Used by the seed and tests.
import { EXERCISE_CATEGORIES, EXERCISE_TYPES, musclewikiUrl } from "../../../../shared/domain/gym.js";
import type { ExerciseRow } from "../../../prisma/data/exercises.js";
import { stableUuid } from "../../lib/stableId.js";

export type CatalogExercise = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  category: ExerciseRow[3];
  type: ExerciseRow[4];
  referenceUrl: string;
};

export const curatedExerciseId = (slug: string): string => stableUuid(`kimbo-exercise:${slug}`);

export function exercisesFromRows(rows: readonly ExerciseRow[]): CatalogExercise[] {
  const slugs = new Set<string>();
  const names = new Set<string>();
  return rows.map(([slug, name, aliases, category, type, mw]) => {
    if (slugs.has(slug)) throw new Error(`Duplicate exercise slug "${slug}"`);
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate exercise name "${name}"`);
    if (!EXERCISE_CATEGORIES.includes(category)) throw new Error(`${slug}: unknown category "${category}"`);
    if (!EXERCISE_TYPES.includes(type)) throw new Error(`${slug}: unknown type "${type}"`);
    if (!/^[a-z0-9-]+$/.test(mw)) throw new Error(`${slug}: bad MuscleWiki slug "${mw}"`);
    slugs.add(slug);
    names.add(name.toLowerCase());
    return { id: curatedExerciseId(slug), slug, name, aliases, category, type, referenceUrl: musclewikiUrl(mw) };
  });
}
