// Coach personas — IDEATION Flow B, DESIGN.md §6.2 S08 / §8.2, brand §3.6 accents.
// Final persona lines were approved at the P35 gate (D60); the per-situation lines live in lines.ts.
import type { CoachId } from "@/core/api/types";
import type { Accent } from "@/core/ui";

export type Persona = {
  id: CoachId;
  name: string;
  accent: Accent;
  vibe: string;
  /** S08 sample line in a chat bubble. */
  sample: string;
  /** S09 sign-off under the plan. */
  planLine: string;
};

export const PERSONAS: Record<CoachId, Persona> = {
  drill_sergeant: {
    id: "drill_sergeant",
    name: "Drill Sergeant",
    accent: "lime",
    vibe: "Firm and direct",
    sample: "62 g protein short. No excuses. Fix it.",
    planLine: "Plan's set. Now we execute.",
  },
  calm_mentor: {
    id: "calm_mentor",
    name: "Calm Mentor",
    accent: "lilac",
    vibe: "Steady and reassuring",
    sample: "One meal doesn't define a phase.",
    planLine: "Small steps, every day. You've got this.",
  },
  desi_legend: {
    id: "desi_legend",
    name: "Desi Legend",
    accent: "orchid",
    vibe: "Fiery and motivational",
    sample: "62 g protein baaki hai! Paneer, dal, eggs — chalo, finish strong tonight!",
    planLine: "Plan ready! Chalo, let's show them what you've got!",
  },
};

export const PERSONA_ORDER: readonly CoachId[] = ["drill_sergeant", "calm_mentor", "desi_legend"];
