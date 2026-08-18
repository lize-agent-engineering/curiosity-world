# Curiosity World

A parent types in a question their child asked — "why does the moon follow us?"
— plus the child's age. Three agents plan, **write the code for**, and review a
page the child can actually play with: guess first, try it, then understand why.
Keep talking to change it; every round becomes a version you can roll back to,
branch from, or download and keep.

What changed from the first version: **questions are no longer limited to three
preset knowledge families, and the page is genuinely generated code** rather
than configuration poured into a fixed scene renderer.

## The loop

1. Write the child's question (or pick an example), set the age, and start.
2. The workbench shows plan / code / review as three named stages with the code
   being written line by line, and an iframe preview beside it.
3. Say what to change next: "he's only 6, make it more visual".
4. Switch between versions, roll back, or download the page to keep.

## How it works

| Role | Output | Shape |
| --- | --- | --- |
| `studio.planner` | the exploration, the causal points the child should end up understanding, and the common wrong explanations to avoid | strict JSON |
| `studio.coder` | create → a whole HTML document; modify → search/replace edit blocks | streamed text |
| `studio.reviewer` | `{verdict, findings[]}`, checking scientific correctness first | strict JSON |

**Quality is designed in four layers**, not hoped for:

1. **Domain prompts.** The coder is told what a children's exploration is: at
   least two interactions that change the state of the screen (page turning does
   not count), prediction before explanation, a transfer challenge, an ending,
   and a short note for the parent. The age sets the language budget — a 4-year
   old gets almost no text, a 12-year old can read full sentences.
2. **A design system and the sandbox's real constraints inside the prompt** —
   colour tokens, a 4px scale, interaction states, touch-first sizing, plus:
   modals are blocked, page-driven downloads are blocked, there is no network.
3. **A reviewer with teeth.** Wrong science is a blocker. It also checks whether
   the interaction is real, whether the answer was given away up front, and
   whether the language fits the age; findings are injected into the retry.
4. **Runtime errors fed back** from the previewed page into the next round.

**Modification prefers targeted edits.** Search/replace blocks must match
exactly once, may not overlap, and must change something; a mismatch falls back
to one full rewrite before it is called a failure, and the path taken is shown
with the diff.

**Trust boundary**: the client sends the question and at most a version id. The
current HTML is always read from the store by the worker. The preview iframe is
`sandbox="allow-scripts"` and deliberately never `allow-same-origin`.

**Extension**: the same engine with the domain guidance removed is a general app
generator (timers, dashboards, small games). It is kept as an entry on the home
page to show the pipeline is not welded to one scenario.

## Run locally

Node.js 20.9+ (the image uses Node 22), pnpm, and an OpenRouter API key.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
pnpm worker
```

`.env.local` needs at least `OPENROUTER_API_KEY`; model resolution reads
`DEFAULT_MODEL` and `MODEL_ROUTES` and fails explicitly with neither. The web
process does not generate anything — `pnpm worker` must run alongside it, and it
drives the Studio and Curiosity queues as two independent loops in one process.

## Gates

```bash
pnpm check      # formatting only
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e   # set CURIOSITY_E2E_PORT if 3002 is taken
```

The real-model gate:

```bash
STUDIO_SPIKE_CODERS='openrouter:z-ai/glm-5.2' pnpm spike:studio:real
```

Samples across app kinds, each run through create → modify. Pages and a report
land in `evidence/studio/`. The GO
thresholds are fixed in `lib/studio/spike.ts`: ≥80% valid on the first coding
attempt, ≥60% of modifications applied as targeted patches, ≥80% of
modifications succeeding at all, and a p95 create under 4 minutes.

## Deployment

```bash
docker compose up -d --build
```

Compose starts web and worker against the pinned `curiosity-world-data` volume,
which holds `data/studio/`, `data/studio-jobs/` and the Curiosity stores, so
replacing containers loses nothing. The web container publishes port 3000 on
host 3100 for ngrok; override with `CURIOSITY_HOST_PORT`.

`CURIOSITY_PUBLIC_MODE=1` exposes only the public surface: the home page,
`/studio`, `/curiosity`, experience pages, health, and the `/api/studio/` and
`/api/curiosity/` endpoints. Runtime configuration lives only in the deployment
machine's git-ignored `.env.local`.
