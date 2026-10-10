---
name: ideation
description: Use when the user wants to "brainstorm", "explore ideas", "new feature", "what should I build next", "ideate", "feature ideas", or when they want to explore possibilities for a new or existing product. This is a divergent brainstorming skill that produces structured, actionable feature ideas.
---

# /ideation

You are running the `/ideation` skill. This is a **conversational**
brainstorming skill — every step requires user interaction. You must
never generate ideas or make selections without asking the user first.
The output is `IDEATION.md`, a structured document of explored ideas,
selected candidates, and parked alternatives that feeds directly into
`/spec`.

## Mindset

Be generative, not critical. Wild ideas are welcome here — critique
comes later during `/spec`. But "generative" does not mean
"unstructured": every idea must solve a concrete problem. If you
cannot name the problem, the idea is noise.

## Process

Follow these 6 steps in order. Do not skip or combine steps.

### Skill Parameters

Read and execute ALL [MANDATORY] sections in [GLOBAL-REFERENCE.md](GLOBAL-REFERENCE.md):

- `{PHASE_NAME}` = `ideation`
- `{OUTPUT_FILES}` = `["IDEATION.md"]`

### Step 1: Context Gathering

Before any brainstorming, understand what exists.

1. Check for an existing codebase in the working directory. If present, read key files (README,
   package.json, main entry points) to understand the product, its tech stack, and its users.
2. Check for a prior `IDEATION.md`. If it exists, read it — parked
   ideas from previous sessions may be relevant. Reference them explicitly when appropriate.
3. Check for existing specs or documentation (e.g., `SPEC.md`, `docs/`).
4. Summarize what you found to the user in 3-5 sentences. Ask them to confirm or correct your
   understanding.

If no codebase exists, tell the user you are starting from a blank slate and proceed to Step 2.

### Step 2: Problem Space Exploration

Ask the user about these areas (present them as a list, let the user respond to whichever resonate):

- **User friction**: What are the biggest pain points for your users right now?
- **Requests**: What have users or stakeholders asked for?
- **Competitive gaps**: What do competitors offer that you do not?
- **Tech debt blockers**: Is there technical debt preventing you from building what you want?
- **Adjacent problems**: Are there related problems your product could solve?

Do not rush this step. Ask follow-up questions. Dig into vague answers ("users want it to be
faster" — faster how? Which workflow? What is the current experience?). The quality of ideation
depends entirely on how deeply you understand the problem space.

Only move to Step 3 when you have a clear picture of at least 2-3 concrete problems or
opportunities. Confirm with the user: "I think the key problems/opportunities are X, Y, Z. Ready
to generate ideas?"

### Step 3: Idea Generation

Generate **5-8 feature ideas** based on the problem space from Step 2. Present each idea in this
format:

```text
### [Idea Name]
- **Description**: One sentence — what it does.
- **Problem**: Which problem from Step 2 this addresses.
- **Effort**: S / M / L
- **Impact**: S / M / L
- **Feasibility**: Brief technical feasibility notes (e.g., "requires new API endpoint",
  "can reuse existing auth system", "needs third-party integration").
- **Dependencies**: What existing features or infrastructure this depends on.
```

Effort/Impact scale:

- **S** = days of work / helps a subset of users
- **M** = 1-2 weeks / helps most users
- **L** = weeks-to-months / transformative for the product

Present all ideas at once, then ask: "Which of these resonate? Any I should drop, combine, or
rethink? Anything missing?" Incorporate feedback before proceeding.

**Critical**: Do not critique or filter ideas during this step. Present them all — filtering
happens in Step 4.

### Step 4: Prioritization

Present an effort/impact matrix to the user. Use a simple text table:

```text
              | Low Effort | Medium Effort | High Effort
--------------+------------+---------------+------------
High Impact   | [ideas]    | [ideas]       | [ideas]
Medium Impact | [ideas]    | [ideas]       | [ideas]
Low Impact    | [ideas]    | [ideas]       | [ideas]
```

Walk through the matrix with the user:

- **Low effort / High impact** = obvious wins, recommend these first.
- **High effort / High impact** = worth discussing — are they
  strategic enough to justify the cost?
- **Low impact (any effort)** = generally park these unless the user feels strongly.

Ask the user to select **1-3 ideas** to pursue. Confirm their selection explicitly before
proceeding.

### Step 5: Deep Dive

For each selected idea, flesh out the following collaboratively with the user:

- **User stories**: Concrete scenarios, not Agile boilerplate. Example: "A user with 50 dashboards
  opens the app and cannot find the one they need. They type 'revenue Q3' and the search returns
  the right dashboard in <1 second."
- **Technical approach sketch**: High-level how — not a full design. Example: "Add a search index
  over dashboard titles and tags, expose via `/api/search`, render results in a dropdown."
- **Risks and unknowns**: What could go wrong? What do you not know yet? Example: "Search
  performance with 10k+ dashboards is untested. May need Elasticsearch instead of DB queries."
- **Relationship to existing features**: Does this extend, replace, or conflict with anything?

Keep it lightweight. This is a sketch, not a spec — `/spec` handles detailed specification.

After each idea's deep dive, ask: "Does this capture it? Anything to add or change?"

### Step 6: Output

Write `IDEATION.md` in the working directory using the template below. Then update state tracking
(see State Tracking section). Tell the user: "IDEATION.md is ready. Run `/spec` to turn selected
ideas into a detailed specification."

## Output Template

Write `IDEATION.md` with exactly this structure:

```markdown
# Ideation: [Product Name] — [YYYY-MM-DD]

## Context

[2-4 sentences: current product state, what prompted this ideation session, key problems identified
in Step 2.]

## Ideas Explored

### [Idea Name]

- **Description**: ...
- **Problem**: ...
- **Effort**: S/M/L
- **Impact**: S/M/L
- **Feasibility**: ...
- **Dependencies**: ...

[Repeat for each idea from Step 3]

## Selected for Development

### [Selected Idea Name]

- **Scenarios**: [User stories from Step 5]
- **Technical approach**: [Sketch from Step 5]
- **Risks**: [From Step 5]
- **Next step**: Feed into `/spec`

[Repeat for each selected idea]

## Parked Ideas

[List ideas not selected, with one sentence each explaining why they were parked. These are
preserved for future ideation sessions.]
```

If the session ends before completion (user abandons, error, etc.), write a partial `IDEATION.md`
with whatever was produced. Add `status: incomplete` on the first line after the title so downstream
skills know the output is not finalized.

On failure, still write a partial `IDEATION.md` with `status: incomplete` (see Output Template).

## Settings

```yaml
settings:
  - name: idea_count
    type: number
    default: 7
    min: 3
    description: >
      Target number of feature ideas to generate in Step 3 (idea
      generation). The skill generates between idea_count-2 and
      idea_count+1 ideas.
  - name: max_selected_ideas
    type: number
    default: 3
    min: 1
    description: >
      Maximum number of ideas the user can select for deep dive in
      Step 4. Caps scope to keep the ideation session focused.
```

## Anti-Patterns

Do NOT do the following:

- **Premature critique**: Do not shoot down ideas during Step 3. Filtering happens in Step 4.
- **Skipping problem exploration**: Do not jump to idea generation without completing Step 2. The
  insight lives in understanding the problem space, not in generating solutions.
- **Ungrounded ideas**: Never propose an idea without tying it to a real problem from Step 2.
  "Wouldn't it be cool if..." without a problem statement is not an idea — it is noise.
- **Over-scoping the deep dive**: Step 5 is a sketch. If you are writing detailed API contracts or
  database schemas, you have gone too far. That is `/spec`'s job.
- **Ignoring prior work**: If `IDEATION.md` or a codebase exists, you must read and reference it.
  Do not brainstorm in a vacuum when context is available.
- **Monologue mode**: If you are generating output without asking the user questions, you are doing
  it wrong. Every step involves the user. Ask, listen, incorporate, then proceed.
