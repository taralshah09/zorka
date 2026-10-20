export type BriefPriority = "resume" | "continue" | "prepared" | "optional" | "finished";
/** Task priority is independent of calorie performance and streak attendance. */
export function briefPriority(input: { activeSession: boolean; chosenDraft: boolean; prepared: boolean; optional: boolean; finished: boolean }): BriefPriority {
  if (input.activeSession) return "resume";
  if (input.chosenDraft) return "continue";
  if (input.finished) return "finished";
  if (input.prepared) return "prepared";
  if (input.optional) return "optional";
  return "finished";
}
