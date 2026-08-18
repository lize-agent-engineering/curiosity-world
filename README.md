# Curiosity Studio — an agent-driven web app generator

Describe the app you want in one sentence and three agents build it: **planner**
writes the spec, **coder** writes the code, **reviewer** signs it off. The output
is a self-contained single-file HTML app, previewed instantly in an isolated
sandbox. Keep talking to modify it — every round becomes a version you can roll
back to, or branch from.

"Curiosity World" (science exploration for children aged 6–10) is kept as a
template card on the home page, running its own dedicated pipeline unchanged.

## The loop

1. Write a request on the home page (or pick an example) and start.
2. The workbench shows the conversation on the left — three named stages and the
   code as it is being written — and an iframe preview on the right.
3. Once the first version lands, say what to change next: "add a daily counter
   that survives a refresh".
4. The version dropdown switches the preview to any earlier version; rolling
   back moves the pointer without discarding anything.

## How it works

| Role | Output | Shape |
| --- | --- | --- |
| `studio.planner` | `{appName, appKind, summary, changeNote, features[], layout, interactions[], persistence}` | strict JSON |
| `studio.coder` | create → a whole HTML document; modify → search/replace edit blocks | streamed text |
| `studio.reviewer` | `{verdict, findings[]}` | strict JSON |

**Classification routes; it never gates.** The planner picks an `appKind` from
`tool / game / dashboard / content / form / creative / general`, which selects
the craft notes the coder receives. Anything unrecognized lands on `general`, so
a misclassification costs a less specific prompt — never a refusal.

**Quality is designed in four layers**, not hoped for:

1. **Kind-routed prompts** — a universal contract plus 10–20 lines of concrete
   guidance per kind (a game gets rAF loops, delta time, touch controls and
   `preventDefault`; a dashboard gets hand-drawn inline SVG charts, axes and
   empty states).
2. **A design system inside the prompt** — `:root` colour tokens, a 4px spacing
   scale, hover/focus-visible/active states, the system-ui stack, dark by
   default, plus the sandbox's real constraints: modals are blocked, page-driven
   downloads are blocked, there is no network.
3. **A reviewer with teeth** — it receives the HTML, the static validation report
   and the plan's feature list; its findings are injected into the retry round.
4. **Runtime errors fed back** — errors the previewed page actually threw
   (including the ones thrown while srcDoc parses, recovered via a replay
   handshake) are stored on the version and travel into the next round.

**Modification prefers targeted edits.** The coder emits search/replace blocks
that must match exactly once, may not overlap and must change something; there
is no fuzzy matching. A mismatch falls back to one full rewrite before it is
called a failure, and the path taken is recorded as `Version.editMode`
(create/patch/rewrite) and shown in the UI.

**Trust boundary**: the client sends a request string and at most a version id to
branch from. The current HTML is always read from the store by the worker; the
model only returns edit blocks. The preview iframe is `sandbox="allow-scripts"`
and deliberately never `allow-same-origin`.

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

One sample per app kind plus two deliberately odd requests, each run through
create → modify. Pages and a report land in `evidence/studio/`. The GO
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
