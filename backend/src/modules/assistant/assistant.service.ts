// AB2 · One Assistant Bar turn (docs/ASSISTANT_BAR_PLAN.md "How a turn works", D91–D96). One round trip (D94):
//   1. speech-to-text with the personal vocabulary hint (voice only) → transcript + confidence
//   2. support check on the words (safety.ts): a fixed reply, nothing runs
//   3. learned aliases rewrite mis-heard words (D97), then the router names actions: by default an LLM with tools
//      (agent.ts, D100), which sees each call's check and can fix it; the one-shot JSON router when that fails
//   4. each action: strict schema, its span must be in what was said, then the shared turn rules (planTurn)
//   5. each action resolved by the existing parser: meal (P15), gym (P22), brief (LA2), facts (AB5)
//   6. confidence from the transcript and the match moves tiers up (D93)
//   7. the persona phrases a reply over the receipts only; the reply filter and number grounding can replace it
// Nothing is saved here. The phone checks every action again and runs it with its own stores (D96).
import {
  ambiguousMealTypes,
  applyAliases,
  factsForDayType,
  hasDevanagari,
  lowerConfidence,
  matchConfidence,
  mealTypeAt,
  minuteOf,
  numberInTranscript,
  numbersGrounded,
  OUT_OF_SCOPE_LINE,
  planTurn,
  quantityUnusual,
  spanInTranscript,
  tierFor,
  TURN_TEXT_MAX,
  type AssistantAction,
  type Confidence,
  type TurnContext,
} from "../../../../shared/domain/assistant.js";
import { answerFacts } from "../../../../shared/domain/assistantFacts.js";
import { UNIT_LABEL } from "../../../../shared/domain/food.js";
import type { Logger } from "pino";

import { notFound } from "../../http/errors.js";
import type { AiClient, AiMeta } from "../ai/ai.client.js";
import type { BriefsService } from "../briefs/briefs.service.js";
import { checkReply, needsSupport, SUPPORT_REPLY } from "../coach/safety.js";
import { routineFromSets, type GymParseService } from "../gymParse/gymParse.service.js";
import type { ParseService } from "../mealParse/parse.service.js";
import {
  AiPhrasing,
  AiRomanized,
  AiRouterOutput,
  RouterAction,
  type AskQuestion,
  type AssistantTurnBody,
  type AssistantTurnResult,
  type DropReason,
  type TurnItem,
} from "./assistant.schemas.js";
import { phrasingSystem, phrasingUser, receipt, templateReply } from "./facts.js";
import { runAgent, type Screen } from "./agent.js";
import { ROMANIZE_SYSTEM, ROUTER_SYSTEM_FOR, routerUser } from "./router.prompt.js";
import { vocabularyHint } from "./vocab.js";

/** A calorie-dense food logged with no amount is asked about (Tier rules: "no quantity on a calorie-dense item"). */
export const DENSE_KCAL_PER_100G = 250;
/** "did my usual", "same as always", "roz wala": the user's next routine, approved first. */
const USUAL_WORKOUT = /\b(usual|routine|same as (always|usual|last time)|roz wala|hamesha wala)\b/i;
/** A turn asked for more than one change to saved records (MAX_EDITS_PER_TURN). */
export const ONE_EDIT_LINE = "I change one saved thing at a time. Say the next one after this.";
/** Nothing usable came back. */
export const NOTHING_LINE = 'I couldn\'t find anything to do there. Try "log 2 rotis" or "how\'s my week?"';

export type AssistantDeps = {
  ai: AiClient;
  parse: ParseService;
  gymParse: GymParseService;
  briefs: BriefsService;
  userExists: (id: string) => Promise<boolean>;
  /** Refused and dropped turns are logged (words only, never audio) for the eval set (Guardrails 9). */
  logger?: Pick<Logger, "info">;
  /** D100 · "tools": the LLM with tools picks actions, the JSON router when it fails. "json": the JSON router only. */
  router?: "tools" | "json";
};

const kindOf = (raw: unknown): string | null =>
  raw && typeof raw === "object" && typeof (raw as { kind?: unknown }).kind === "string" ? (raw as { kind: string }).kind : null;

/** The router's action → the shared action shape: confidence from the transcript, a clock time as a minute. */
function toAction(a: RouterAction, confidence: Confidence): unknown {
  switch (a.kind) {
    case "log_meal":
    case "log_workout":
    case "log_weight":
    case "edit_meal":
      return { ...a, confidence };
    case "remind_me": {
      const { time, ...rest } = a;
      return { ...rest, minute: minuteOf(time) };
    }
    default:
      return a;
  }
}

/** Words each action carries that must have been said (D91, "Router disagreement"). */
function spansOf(a: RouterAction): string[] {
  switch (a.kind) {
    case "log_meal":
    case "log_workout":
    case "plan_meal":
    case "correct":
    case "exercise_ref":
    case "create_routine":
      return [a.span];
    case "edit_meal":
      return a.from ? [a.span, a.from] : [a.span];
    case "delete_entry":
      return a.span ? [a.span] : [];
    case "ask":
      return a.about ? [a.about] : [];
    case "set_amount":
      return a.food ? [a.food] : [];
    default:
      return [];
  }
}

/**
 * Where an action's words may come from. A `correct` restates the whole entry with the fix in it ("2 roti and dal"
 * after "no, dal not dahl"), so the entry it corrects counts as heard too.
 */
function heardFor(a: RouterAction, said: string, body: AssistantTurnBody): string {
  if (a.kind !== "correct") return said;
  const before = body.turn.previous?.actions[a.index]?.span;
  return before ? `${said} ${before}` : said;
}

export function assistantService(deps: AssistantDeps) {
  const { ai, parse, gymParse, briefs, userExists, logger, router = "tools" } = deps;

  async function resolveMeal(userId: string, words: string, item: TurnItem, ctx: TurnContext, minute: number): Promise<TurnItem> {
    const a = item.action;
    if (a.kind !== "log_meal" && a.kind !== "plan_meal" && a.kind !== "correct" && a.kind !== "edit_meal") return item;
    const parsed = await parse.parseForAssistant(userId, words);
    const items = parsed.items;
    const saidType = a.kind === "correct" ? undefined : a.mealType;
    // An edit's foods are what to put in; the phone finds the saved meal (by type, else the latest).
    const mealType = saidType ?? mealTypeAt(minute);
    const out: TurnItem = { ...item, resolved: { kind: "meal", items, mealType } };
    if (a.kind !== "log_meal") return out;

    // D93: the lower of what was heard and how well each food matched; an odd amount is never silent either. "Dal"
    // with no amount is a katori, not a doubt: only a calorie-dense food with no amount is asked about (below).
    const signals = items.map((i) => ({
      score: i.matchScore,
      runnerUp: i.runnerUp,
      uncertain: i.reasons.some((reason) => reason !== "vague_quantity"),
    }));
    let confidence = lowerConfidence(a.confidence, matchConfidence(signals));
    if (items.some((i) => quantityUnusual(i.quantity, i.unit))) confidence = lowerConfidence(confidence, "medium");
    const action: AssistantAction = { ...a, confidence, mealType };
    out.action = action;
    out.tier = tierFor(action, ctx);

    if (!items.length) {
      out.tier = "ask";
      out.ask = { question: "What did you have?", options: [] };
      return out;
    }
    const between = !saidType && (a.date === undefined || a.date === ctx.today) ? ambiguousMealTypes(minute) : null;
    if (between) {
      out.tier = "ask";
      out.ask = { question: "Which meal was that?", options: between.map((m) => ({ label: m[0]!.toUpperCase() + m.slice(1), patch: { mealType: m } })) };
      return out;
    }
    const vague = items.findIndex((i) => i.food && i.reasons.includes("vague_quantity") && i.food.per100g.kcal >= DENSE_KCAL_PER_100G);
    if (vague >= 0) {
      const food = items[vague]!.food!;
      const ask: AskQuestion = {
        question: `How much ${food.name.toLowerCase()}?`,
        options: food.units.slice(0, 4).map((u) => ({
          label: `1 ${u.label ?? UNIT_LABEL[u.unit].one}`,
          patch: { itemIndex: vague, quantity: 1, unit: u.unit },
        })),
      };
      out.tier = "ask";
      out.ask = ask;
    }
    return out;
  }

  async function resolveWorkout(userId: string, words: string, item: TurnItem, ctx: TurnContext): Promise<TurnItem> {
    const a = item.action;
    if (a.kind !== "log_workout" && a.kind !== "correct") return item;
    const { sets } = await gymParse.parseText(userId, words);
    const usual = !sets.length && USUAL_WORKOUT.test(words);
    const out: TurnItem = { ...item, resolved: { kind: "workout", sets, usual } };
    if (a.kind !== "log_workout") return out;
    const confidence = sets.length
      ? lowerConfidence(a.confidence, matchConfidence(sets.map((s) => ({ score: s.matchScore, runnerUp: null, uncertain: s.uncertain }))))
      : a.confidence;
    const action: AssistantAction = { ...a, confidence };
    out.action = action;
    out.tier = usual ? "approve" : sets.length ? tierFor(action, ctx) : "ask";
    if (!sets.length && !usual) out.ask = { question: "Which exercises did you do?", options: [] };
    return out;
  }

  async function resolve(userId: string, body: AssistantTurnBody, said: string, item: TurnItem, ctx: TurnContext): Promise<TurnItem> {
    const a = item.action;
    const minute = minuteOf(body.context.localTime);
    switch (a.kind) {
      case "log_meal":
      case "plan_meal":
        return resolveMeal(userId, a.span, item, ctx, minute);
      case "log_workout":
        return resolveWorkout(userId, a.span, item, ctx);
      case "edit_meal":
        // "Remove the rice": nothing to parse, the phone takes that food out of the saved meal.
        return a.mode === "remove" ? item : resolveMeal(userId, a.span, item, ctx, minute);
      case "correct": {
        const target = body.turn.previous?.actions[a.index];
        if (target?.kind === "log_meal" || target?.kind === "plan_meal") return resolveMeal(userId, a.span, item, ctx, minute);
        if (target?.kind === "log_workout") return resolveWorkout(userId, a.span, item, ctx);
        return item;
      }
      case "set_day": {
        // The brief parser reads what the day looks like ("wedding at 8"); the day type is then made to hold. If the
        // parser is down, the day type alone still re-plans the day.
        let base = null;
        let question: string | null = null;
        try {
          const parsed = await briefs.parse(userId, {
            text: (a.note ?? said).slice(0, 1000),
            forDate: a.date,
            today: ctx.today,
            localTime: body.context.localTime,
          });
          base = parsed.facts;
          question = parsed.question;
        } catch {
          base = null;
        }
        return { ...item, resolved: { kind: "day", facts: factsForDayType(a.dayType, base), dayType: a.dayType, question } };
      }
      case "ask": {
        const f = answerFacts(a.topic, body.facts, a.date, a.mealType, a.about);
        return { ...item, resolved: { kind: "answer", topic: f.topic, date: f.date, known: f.known, lines: f.lines, numbers: f.numbers, card: f.card } };
      }
      case "exercise_ref": {
        const found = await gymParse.findExercises(userId, a.span, body.vocab?.exercises ?? []);
        return { ...item, resolved: { kind: "exercises", ...found } };
      }
      case "create_routine": {
        // The gym parser reads "bench 3x10, incline press, flys" like logged sets; nothing is ticked, only targets kept.
        const { sets } = await gymParse.parseText(userId, a.span);
        const { exercises, unmatched } = routineFromSets(sets);
        const out: TurnItem = { ...item, resolved: { kind: "routine", name: a.name, exercises, unmatched } };
        if (!exercises.length) {
          out.tier = "ask";
          out.ask = { question: "Which exercises go in it?", options: [] };
        }
        return out;
      }
      default:
        return item;
    }
  }

  const log = (userId: string, what: string, extra: Record<string, unknown>) =>
    logger?.info({ assistant: { userId, ...extra } }, what);

  return {
    async turn(userId: string, body: AssistantTurnBody): Promise<AssistantTurnResult> {
      const started = Date.now();
      if (!(await userExists(userId))) throw notFound("User");
      const timings = { sttMs: null as number | null, routerMs: 0, resolveMs: 0, phraseMs: 0, totalMs: 0 };
      const done = (r: Omit<AssistantTurnResult, "timings">): AssistantTurnResult => ({
        ...r,
        timings: { ...timings, totalMs: Date.now() - started },
      });

      // 1. What was said.
      let text: string;
      let source: "voice" | "text";
      let confidence: Confidence;
      if (body.audioBase64) {
        const t0 = Date.now();
        const stt = await ai.transcribe({ base64: body.audioBase64, mimeType: body.mimeType! }, vocabularyHint(body.vocab));
        timings.sttMs = Date.now() - t0;
        text = stt.text.replace(/\s+/g, " ").trim().slice(0, TURN_TEXT_MAX);
        source = "voice";
        confidence = stt.confidence;
      } else {
        text = body.text!.replace(/\s+/g, " ").trim().slice(0, TURN_TEXT_MAX);
        source = "text";
        confidence = "high";
      }
      // Hindi in Devanagari is written in Roman letters first: everything after reads Roman script. A failed call keeps
      // the words as heard (the router still gets them).
      if (hasDevanagari(text)) {
        try {
          text = (await ai.json({ system: ROMANIZE_SYSTEM, user: text, schema: AiRomanized })).value.text.slice(0, TURN_TEXT_MAX);
        } catch {
          // keep `text`
        }
      }
      const heard = { text, source, confidence };
      const nothing = { items: [], dropped: [], ai: null };
      if (!text.replace(/[^a-z0-9]/gi, "")) return done({ heard, kind: "no_speech", ...nothing, reply: "", replyKind: "none" });

      // 2. Safety first, before any AI sees the words.
      if (needsSupport(text)) {
        log(userId, "assistant turn: support reply", { refused: "support" });
        return done({ heard, kind: "support", ...nothing, reply: SUPPORT_REPLY, replyKind: "support" });
      }

      // 3. Aliases, then the router.
      const said = applyAliases(text, body.vocab?.aliases ?? []);
      const ctx: TurnContext = {
        today: body.facts.today,
        lastWeightKg: body.turn.lastWeightKg,
        activityRunning: body.turn.activityRunning,
        previousActions: body.turn.previous?.actions.length ?? 0,
      };
      // 4. Schema, then the words (and a target's number) must be in what was said (D91, D99).
      const screen: Screen = (raw) => {
        const parsed = RouterAction.safeParse(raw);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          return { ok: false, kind: kindOf(raw), reason: "schema", why: `Not a valid call${issue ? `: ${issue.path.join(".") || "arguments"} ${issue.message}` : ""}.` };
        }
        const heardWords = heardFor(parsed.data, said, body);
        const unheardNumber = parsed.data.kind === "set_target" && !numberInTranscript(parsed.data.value, said);
        if (unheardNumber || spansOf(parsed.data).some((words) => !spanInTranscript(words, heardWords)))
          return { ok: false, kind: parsed.data.kind, reason: "span_not_heard", why: "Those words (or that number) aren't in what they said. Use their own words." };
        return { ok: true, action: toAction(parsed.data, confidence) };
      };
      const dropped: AssistantTurnResult["dropped"] = [];
      const candidates: unknown[] = [];
      const jsonRouter = async () => {
        const routed = await ai.json({ system: ROUTER_SYSTEM_FOR(body.facts.today), user: routerUser(body, said), schema: AiRouterOutput });
        for (const raw of routed.value.actions) {
          const s = screen(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
          if (s.ok) candidates.push(s.action);
          else dropped.push({ kind: s.kind, reason: s.reason });
        }
        return routed.meta;
      };
      const t0 = Date.now();
      let meta: AiMeta | null;
      if (router === "tools") {
        try {
          const agent = await runAgent({ ai, parse, userId, body, said, ctx, screen });
          candidates.push(...agent.candidates);
          dropped.push(...agent.dropped);
          meta = agent.meta;
        } catch (e) {
          // Every tool-calling attempt failed (limits, outage, a model that can't do tools): the JSON router runs.
          log(userId, "assistant turn: tool router failed, using JSON router", { error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
          candidates.length = 0;
          dropped.length = 0;
          // Keys benched by that failure can't serve the JSON router either: then the first error is the one to show.
          meta = await jsonRouter().catch(() => {
            throw e;
          });
        }
      } else meta = await jsonRouter();
      timings.routerMs = Date.now() - t0;
      const routerAi = meta ? { slot: meta.slot, model: meta.model, attempts: meta.attempts } : null;

      const planned = planTurn(candidates, ctx);
      for (const d of planned.dropped) dropped.push({ kind: kindOf(d.action), reason: d.reason as DropReason });

      // 5–6. Resolve with the existing parsers; confidence moves tiers up.
      const t1 = Date.now();
      const items = await Promise.all(
        planned.items.map((p) => resolve(userId, body, said, { action: p.action, tier: p.tier, resolved: null, ask: null, line: "" }, ctx)),
      );
      timings.resolveMs = Date.now() - t1;
      const receipts = items.map((i) => receipt(i, ctx.today));
      items.forEach((i, n) => (i.line = receipts[n]!.line));

      if (!items.length || items.every((i) => i.action.kind === "out_of_scope")) {
        log(userId, "assistant turn: nothing to do", { words: text.slice(0, 300), dropped });
        const redirect = items.length > 0;
        return done({
          heard,
          kind: "actions",
          items,
          dropped,
          reply: redirect ? OUT_OF_SCOPE_LINE : NOTHING_LINE,
          replyKind: redirect ? "redirect" : "template",
          ai: routerAi,
        });
      }
      if (dropped.length) log(userId, "assistant turn: actions dropped", { words: text.slice(0, 300), dropped });
      // One saved record changes per turn; say so instead of quietly skipping the rest.
      if (dropped.some((d) => d.reason === "too_many_edits"))
        items.push({ action: { kind: "clarify", question: ONE_EDIT_LINE, options: [] }, tier: "ask", resolved: null, ask: null, line: ONE_EDIT_LINE });

      // 7. Phrasing over the receipts only. Anything off falls back to the receipts as written.
      const template = templateReply(items);
      const numbers = receipts.flatMap((r) => r.numbers);
      const t2 = Date.now();
      let reply = template;
      let replyKind: AssistantTurnResult["replyKind"] = "template";
      // Something waits for OK or an answer: the receipts already ask it plainly, and a rephrase tends to say it's done
      // ("Rice was removed" for an edit still waiting).
      const waits = items.some((i) => i.tier === "approve" || i.tier === "ask");
      if (!waits)
        try {
          const phrased = await ai.json({ system: phrasingSystem(body.coach), user: phrasingUser(items.map((i) => i.line).filter(Boolean)), schema: AiPhrasing });
          const safe = checkReply(phrased.value.reply);
          if (safe && numbersGrounded(safe, numbers)) {
            reply = safe;
            replyKind = "ai";
          }
        } catch {
          // The receipts are already a full answer; a phrasing outage never fails the turn.
        }
      timings.phraseMs = Date.now() - t2;
      return done({ heard, kind: "actions", items, dropped, reply, replyKind, ai: routerAi });
    },
  };
}

export type AssistantService = ReturnType<typeof assistantService>;
