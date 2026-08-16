# Curiosity World Guided Voice Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-link-ready Moon exploration in which the existing Agent team generates a bounded story, a runtime guide speaks to the child, accepts voice or button answers, reacts to deterministic page events, restores progress, and produces evidence-based parent review.

**Architecture:** Extend the existing versioned artifact pipeline with one story artifact and a separate runtime guidance protocol. Keep scientific behavior and stage transitions deterministic in the iframe/host state machine; the guide model may select only validated narration, feedback, hints, and legal stage advancement. Reuse the repository's ASR/TTS routes behind Curiosity-specific adapters so the child surface has no provider or API-key configuration.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod 4, IndexedDB/Dexie, existing Curiosity World ASR/TTS providers, Vitest, Playwright.

## Global Constraints

- The first complete guided slice is `relative-motion.moon-following.v1`; balance and light remain runnable but do not receive deep voice treatment in this plan.
- Narration is the primary child information channel; synchronized captions are secondary.
- The main path must not require reading complete Chinese characters or pinyin.
- The guide cannot alter knowledge rules, physics, completion conditions, or jump to an illegal stage.
- Raw child audio is not persisted by default; only recording status, accepted transcript, and its stage binding may become evidence.
- Public visitors must not configure an API key or open model settings to use the main path.
- Fail fast on ASR, TTS, guide-schema, version, or stage errors; do not substitute fabricated success.
- Do not add avatars, lip sync, 3D, generated video, open-ended child chat, points, rankings, or long-term ability profiles.
- Each functional task uses red-green-refactor TDD and ends in its own commit.

---

### Task 1: Story and Guidance Contracts

**Files:**
- Modify: `lib/curiosity/agent-contracts.ts`
- Modify: `lib/curiosity/agent-routing.ts`
- Modify: `tests/curiosity/agent-contracts.test.ts`
- Modify: `tests/curiosity/agent-routing.test.ts`
- Modify: `tests/curiosity/fixture.ts`

**Interfaces:**
- Produces: `StoryDesignArtifactV1`, `GuidanceTurnRequestV1`, `GuidanceTurnResponseV1`, `ChildVoiceEventV1` and their strict Zod schemas.
- Produces: roles `curiosity.story-designer` and `curiosity.exploration-guide` with explicit model routes.
- Consumes: existing artifact envelope, knowledge family, task kind, role route, and thinking configuration.

- [ ] **Step 1: Write failing contract tests**

Add tests that parse a four-stage Moon story and reject unknown fields, direct-answer hints, duplicate stage IDs, missing knowledge references, illegal `advanceTo`, mismatched version/stage bindings, and raw-audio payloads. The valid response shape must be:

```ts
{
  schemaVersion: '1.0',
  experienceId: 'cur_moon_demo',
  versionId: 'ver_moon_demo_1',
  stageId: 'predict',
  triggeredByEventIds: ['evt_voice_1'],
  narration: '你觉得谁移动得更快？',
  feedbackKind: 'observation',
  hintLevel: 0,
  advanceTo: 'explore'
}
```

Assert `CURIOSITY_AGENT_ROLES` contains both new roles and that `getCuriosityRoleStage()` maps them to dedicated stage identifiers.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `pnpm vitest run tests/curiosity/agent-contracts.test.ts tests/curiosity/agent-routing.test.ts`

Expected: FAIL because the story/guidance schemas and roles do not exist.

- [ ] **Step 3: Implement strict schemas and cross-field validation**

Define three to four ordered story stages with `id`, `kind`, `openingNarration`, `prompt`, `allowedEventTypes`, three bounded hints, and `completionCondition`. Add refinements that require unique IDs and only allow `advanceTo` to be the current or immediately following story stage. `ChildVoiceEventV1` contains `eventId`, bindings, `status`, optional `transcript`, confidence, and timestamp; it has no audio bytes or URL field.

- [ ] **Step 4: Run tests and type checking**

Run: `pnpm vitest run tests/curiosity/agent-contracts.test.ts tests/curiosity/agent-routing.test.ts && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit the contract slice**

```bash
git add lib/curiosity/agent-contracts.ts lib/curiosity/agent-routing.ts tests/curiosity/agent-contracts.test.ts tests/curiosity/agent-routing.test.ts tests/curiosity/fixture.ts
git commit -m "feat: define curiosity story guidance contracts"
```

### Task 2: Story Designer in the Generation Pipeline

**Files:**
- Modify: `lib/curiosity/agent-pipeline.ts`
- Modify: `lib/curiosity/server-model.ts`
- Modify: `lib/curiosity/jobs.ts`
- Modify: `components/curiosity/collaboration-progress.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/curiosity/agent-pipeline.test.ts`
- Modify: `tests/curiosity/server-model.test.ts`
- Modify: `tests/curiosity/ui.test.tsx`

**Interfaces:**
- Consumes: `StoryDesignArtifactV1` and route `curiosity.story-designer` from Task 1.
- Produces: pipeline stage `story_design`, `artifacts` containing the story, and persisted Agent run evidence.
- Preserves: deterministic compiler remains the only code/physics producer.

- [ ] **Step 1: Write failing pipeline and UI tests**

Extend the scripted model fixture with a valid story response. Assert execution order is `question_modeling → knowledge_design → interaction_design → story_design → deterministic_compile → quality_review`, story references the knowledge and interaction artifacts, invalid stories fail as `STORY_DESIGN_INVALID`, and the progress view renders “故事引导” without chat bubbles.

- [ ] **Step 2: Run focused tests and verify red**

Run: `pnpm vitest run tests/curiosity/agent-pipeline.test.ts tests/curiosity/server-model.test.ts tests/curiosity/ui.test.tsx`

Expected: FAIL because `story_design` is absent.

- [ ] **Step 3: Add the story role and artifact to generation**

Call the story model after interaction design with only question, knowledge, interaction, age, and the allowed stage kinds. Validate its strict output, wrap it in the versioned artifact envelope, create a succeeded/failed Agent run, include it in quality-review input, and expose its concise conclusion in `CollaborationProgress`.

- [ ] **Step 4: Run focused and Curiosity suites**

Run: `pnpm vitest run tests/curiosity/agent-pipeline.test.ts tests/curiosity/server-model.test.ts tests/curiosity/ui.test.tsx && pnpm vitest run tests/curiosity`

Expected: PASS.

- [ ] **Step 5: Commit the generation slice**

```bash
git add lib/curiosity/agent-pipeline.ts lib/curiosity/server-model.ts lib/curiosity/jobs.ts components/curiosity/collaboration-progress.tsx app/page.tsx tests/curiosity/agent-pipeline.test.ts tests/curiosity/server-model.test.ts tests/curiosity/ui.test.tsx
git commit -m "feat: generate bounded curiosity stories"
```

### Task 3: Deterministic Guided-Stage State Machine

**Files:**
- Create: `lib/curiosity/guidance.ts`
- Modify: `lib/curiosity/contracts.ts`
- Modify: `lib/curiosity/compiler.ts`
- Modify: `lib/curiosity/runtime.ts`
- Modify: `components/curiosity/runtime-frame.tsx`
- Create: `tests/curiosity/guidance.test.ts`
- Modify: `tests/curiosity/runtime.test.ts`

**Interfaces:**
- Produces: `createGuidanceState(story)`, `applyGuidanceTurn(state, response)`, and `deriveGuidanceRequest(state, events, voiceEvent)`.
- Produces: iframe messages for current stage and legal task events without granting the iframe network access.
- Consumes: Task 1 schemas and the active version's `StoryDesignArtifactV1`.

- [ ] **Step 1: Write failing state-machine tests**

Cover initial `predict` state, same-stage feedback, one-step advancement, rejection of skipped/backward/unknown stages, rejection of a response bound to another version, hint escalation from 0 through 2, and restoration from existing events. Assert the iframe reports button and slider events but never decides story advancement.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm vitest run tests/curiosity/guidance.test.ts tests/curiosity/runtime.test.ts`

Expected: FAIL because guidance state functions do not exist.

- [ ] **Step 3: Implement the pure deterministic reducer**

Use a serializable state:

```ts
export interface GuidanceState {
  storyArtifactId: string;
  stageId: string;
  hintLevel: 0 | 1 | 2;
  completedStageIds: string[];
  lastTriggerEventIds: string[];
}
```

Validate every transition with `GuidanceTurnResponseV1`; do not silently clamp or repair invalid output. Extend iframe event messages only with declared task/stage identifiers and keep `sandbox="allow-scripts"` unchanged.

- [ ] **Step 4: Run tests and type checking**

Run: `pnpm vitest run tests/curiosity/guidance.test.ts tests/curiosity/runtime.test.ts && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit the state-machine slice**

```bash
git add lib/curiosity/guidance.ts lib/curiosity/contracts.ts lib/curiosity/compiler.ts lib/curiosity/runtime.ts components/curiosity/runtime-frame.tsx tests/curiosity/guidance.test.ts tests/curiosity/runtime.test.ts
git commit -m "feat: control curiosity guided stages"
```

### Task 4: Runtime Exploration Guide API

**Files:**
- Create: `app/api/curiosity/guidance/route.ts`
- Create: `lib/curiosity/guidance-service.ts`
- Modify: `lib/curiosity/server-model.ts`
- Create: `tests/curiosity/guidance-api.test.ts`
- Modify: `tests/curiosity/server-model.test.ts`

**Interfaces:**
- Consumes: `GuidanceTurnRequestV1`, active story artifact, knowledge artifact, and `curiosity.exploration-guide` model route.
- Produces: a strictly validated `GuidanceTurnResponseV1` or stable `GUIDANCE_*` error.
- Security: request contains no arbitrary prompt, provider secret, raw audio, or unbounded conversation history.

- [ ] **Step 1: Write failing service and route tests**

Test a valid observation response, a retry request after low-confidence speech, and rejection for invalid schema, unknown stage, version mismatch, stale event binding, direct knowledge-boundary violation, and unavailable model. Verify no fallback response is returned.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm vitest run tests/curiosity/guidance-api.test.ts tests/curiosity/server-model.test.ts`

Expected: FAIL because the route and service do not exist.

- [ ] **Step 3: Implement bounded guide execution**

Build the model prompt from the current stage, allowed hints, knowledge vocabulary, forbidden explanations, and recent validated events. Parse strict JSON, then run deterministic binding/transition validation from Task 3. Return `GUIDANCE_MODEL_INVALID`, `GUIDANCE_STAGE_CONFLICT`, `GUIDANCE_KNOWLEDGE_VIOLATION`, or `MODEL_UNAVAILABLE` without substitute narration.

- [ ] **Step 4: Run focused tests and lint**

Run: `pnpm vitest run tests/curiosity/guidance-api.test.ts tests/curiosity/server-model.test.ts && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit the runtime Agent slice**

```bash
git add app/api/curiosity/guidance/route.ts lib/curiosity/guidance-service.ts lib/curiosity/server-model.ts tests/curiosity/guidance-api.test.ts tests/curiosity/server-model.test.ts
git commit -m "feat: guide live curiosity exploration"
```

### Task 5: Curiosity Voice Input and Narration

**Files:**
- Create: `lib/curiosity/voice-client.ts`
- Create: `components/curiosity/voice-guide.tsx`
- Modify: `app/api/generate/tts/route.ts`
- Create: `app/api/curiosity/transcribe/route.ts`
- Modify: `components/curiosity/runtime-frame.tsx`
- Create: `tests/curiosity/voice-client.test.ts`
- Modify: `tests/curiosity/ui.test.tsx`
- Create: `tests/curiosity/voice-api.test.ts`

**Interfaces:**
- Produces: `speakGuidance(text, signal)`, `recordChildAnswer()`, and `transcribeChildAnswer(blob, bindings)`.
- UI produces: speak/replay/skip controls, push-to-talk recording, transcript confirmation, and explicit failed states.
- Consumes: existing managed TTS/ASR provider configuration; client does not submit secrets.

- [ ] **Step 1: Write failing voice adapter, API, and component tests**

Test narration success with an object URL that is revoked after playback, cancellation on stage change/unmount, push-to-talk permission requested only after click, transcript confirmation before guidance submission, retry on `ASR_UNCLEAR`, explicit `TTS_FAILED`, and absence of provider/API-key controls. Assert no raw audio appears in returned evidence.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm vitest run tests/curiosity/voice-client.test.ts tests/curiosity/voice-api.test.ts tests/curiosity/ui.test.tsx`

Expected: FAIL because Curiosity voice files do not exist.

- [ ] **Step 3: Implement the smallest managed voice path**

Reuse `/api/generate/tts` server resolution with a Curiosity server-owned voice selection and add a multipart transcription route backed by the existing ASR adapter. The experience first shows a single “开始探索” button so narration starts from a valid browser user gesture. `VoiceGuide` then shows the narration as a caption and exposes large 44px controls labelled “重听”“跳过”“按住说话” and “重新说一次”.

- [ ] **Step 4: Run focused tests, Curiosity tests, and type checking**

Run: `pnpm vitest run tests/curiosity/voice-client.test.ts tests/curiosity/voice-api.test.ts tests/curiosity/ui.test.tsx && pnpm vitest run tests/curiosity && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit the voice slice**

```bash
git add lib/curiosity/voice-client.ts components/curiosity/voice-guide.tsx app/api/generate/tts/route.ts app/api/curiosity/transcribe/route.ts components/curiosity/runtime-frame.tsx tests/curiosity/voice-client.test.ts tests/curiosity/voice-api.test.ts tests/curiosity/ui.test.tsx
git commit -m "feat: add curiosity voice guidance"
```

### Task 6: Integrate the Moon Guided Loop and Preset Questions

**Files:**
- Modify: `components/curiosity/home-view.tsx`
- Modify: `app/page.tsx`
- Modify: `app/experience/[id]/page.tsx`
- Modify: `components/curiosity/runtime-frame.tsx`
- Modify: `lib/curiosity/knowledge/relative-motion.ts`
- Modify: `lib/curiosity/compiler.ts`
- Modify: `tests/curiosity/ui.test.tsx`
- Modify: `tests/curiosity/knowledge-families.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5 pipeline, guide API, state machine, and voice controls.
- Produces: one complete Moon loop with prediction, exploration, transfer, explanation, and completion.
- Produces: clickable presets that fill the existing question field without auto-submitting.

- [ ] **Step 1: Write failing integration/component tests**

Assert the three preset cards fill the question through `onChange`, the Moon stage begins with narration, voice and click prediction both trigger guidance, slider input triggers observation feedback, transfer/explanation advance only after legal events, and completion is impossible before required stages.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm vitest run tests/curiosity/ui.test.tsx tests/curiosity/knowledge-families.test.ts tests/curiosity/guidance.test.ts`

Expected: FAIL because presets and the host guide loop are not connected.

- [ ] **Step 3: Wire the child experience loop**

Let `CuriosityExperiencePage` own restored guidance state, call `/api/curiosity/guidance` after accepted voice or iframe events, validate the response, speak it, and send legal stage commands to the iframe. Keep visual response deterministic and immediate; guide network latency must not block slider/button feedback.

- [ ] **Step 4: Run Curiosity tests and build**

Run: `pnpm vitest run tests/curiosity && pnpm build`

Expected: PASS.

- [ ] **Step 5: Commit the complete child loop**

```bash
git add components/curiosity/home-view.tsx app/page.tsx 'app/experience/[id]/page.tsx' components/curiosity/runtime-frame.tsx lib/curiosity/knowledge/relative-motion.ts lib/curiosity/compiler.ts tests/curiosity/ui.test.tsx tests/curiosity/knowledge-families.test.ts
git commit -m "feat: run moon voice exploration loop"
```

### Task 7: Persist Guidance Evidence and Parent Review

**Files:**
- Modify: `lib/curiosity/repository.ts`
- Modify: `lib/curiosity/runtime.ts`
- Modify: `components/curiosity/parent-review.tsx`
- Modify: `app/experience/[id]/page.tsx`
- Modify: `tests/curiosity/repository.test.ts`
- Modify: `tests/curiosity/runtime.test.ts`
- Modify: `tests/curiosity/ui.test.tsx`

**Interfaces:**
- Produces: persisted `GuidanceState` and accepted `ChildVoiceEventV1` records keyed by experience/version/stage.
- Produces: parent facts that distinguish “孩子说了什么”“孩子操作了什么”“来自知识包的建议”.
- Consumes: validated state/events only; raw audio never enters IndexedDB.

- [ ] **Step 1: Write failing persistence and summary tests**

Cover saving/restoring current stage, idempotent voice-event append, collision rejection, version isolation, refresh restoration, and parent summary evidence IDs. Assert transcript text is labelled as speech recognition rather than an inferred belief or ability.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm vitest run tests/curiosity/repository.test.ts tests/curiosity/runtime.test.ts tests/curiosity/ui.test.tsx`

Expected: FAIL because guidance state and voice evidence are not persisted.

- [ ] **Step 3: Add the Dexie schema and evidence rendering**

Create a new Dexie version with `guidanceStates: '&[experienceId+versionId]'` and `voiceEvents: '&eventId, [experienceId+versionId], stageId, occurredAt'`. Parse every read and write with Task 1 schemas. Restore the guide before rendering the next narration and render speech/operation/knowledge sections separately.

- [ ] **Step 4: Run repository, UI, and Curiosity suites**

Run: `pnpm vitest run tests/curiosity/repository.test.ts tests/curiosity/runtime.test.ts tests/curiosity/ui.test.tsx && pnpm vitest run tests/curiosity`

Expected: PASS.

- [ ] **Step 5: Commit the evidence slice**

```bash
git add lib/curiosity/repository.ts lib/curiosity/runtime.ts components/curiosity/parent-review.tsx 'app/experience/[id]/page.tsx' tests/curiosity/repository.test.ts tests/curiosity/runtime.test.ts tests/curiosity/ui.test.tsx
git commit -m "feat: preserve curiosity voice evidence"
```

### Task 8: Browser Journey, Public Configuration, and Release Gate

**Files:**
- Modify: `e2e/tests/curiosity-moon-spike.spec.ts`
- Modify: `e2e/fixtures/mock-api.ts`
- Create: `docs/verification/curiosity-guided-voice-gate.md`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: deterministic browser evidence for preset input, Agent story generation, narration, mocked transcription, guided advancement, refresh recovery, and parent review.
- Produces: documented server-owned model/TTS/ASR variables with no browser secret requirement.
- Preserves: live provider verification is separate and must remain pending unless actually executed.

- [ ] **Step 1: Extend Playwright with failing guided-voice assertions**

Mock model, TTS, and ASR endpoints while keeping real UI/state behavior. Assert a visitor clicks the Moon preset, submits, sees `story_design`, enters the experience, sees/hears-ready narration state, submits the transcript “路灯变化更快”, moves the observer, receives contextual feedback, completes the story, reloads, and sees the restored parent evidence.

- [ ] **Step 2: Run the browser test and verify red**

Run: `pnpm exec playwright test e2e/tests/curiosity-moon-spike.spec.ts`

Expected: FAIL on the first missing guided-voice assertion.

- [ ] **Step 3: Finish public configuration and documentation**

Document exact server variables required for the default text model, TTS provider/voice, and ASR provider. The home page must not expose model settings on the public main path when server-managed configuration is present. Keep explicit errors when any required managed capability is absent.

- [ ] **Step 4: Run fresh release gates**

Run:

```bash
pnpm check
pnpm lint
pnpm check:i18n-keys
pnpm vitest run tests/curiosity
pnpm build
pnpm exec playwright test e2e/tests/curiosity-moon-spike.spec.ts
pnpm test
```

Expected: all Curiosity gates, build, lint, formatting, i18n, and E2E PASS. If unrelated legacy full-suite failures remain, record exact fresh counts and keep the overall engineering gate `FAIL`; do not relabel it as passed.

- [ ] **Step 5: Write the verification report and commit**

Record timestamp, branch, runtime versions, exact commands, exit codes, voice mocking boundary, public configuration boundary, full-suite status, and live-model/live-voice status in `docs/verification/curiosity-guided-voice-gate.md`.

```bash
git add e2e/tests/curiosity-moon-spike.spec.ts e2e/fixtures/mock-api.ts docs/verification/curiosity-guided-voice-gate.md .env.example README.md
git commit -m "test: gate curiosity guided voice experience"
```

### Task 9: Publish the Verified Candidate through Docker and Fixed ngrok

**Files:**
- Modify: `docs/verification/curiosity-guided-voice-gate.md`

**Interfaces:**
- Consumes: the exact commit that passed Task 8's Curiosity release gates.
- Produces: an HTTPS deployment URL and a post-deploy smoke-test record.
- Does not: push a different unverified working tree or expose server secrets to the browser bundle.

- [x] **Step 1: Resolve deployment readiness without changing state**

Run `git status --short`, inspect the production Docker container, fixed ngrok domain, and local server-managed environment-variable names without printing their values.

- [x] **Step 2: Build the exact release candidate locally**

Run: `docker build -t curiosity-world:openrouter-voice .`

Expected: PASS on the same commit that will be deployed.

- [x] **Step 3: Deploy through Docker and the fixed ngrok domain**

Run the image as `curiosity-world-local` with `restart=unless-stopped`, the named data volume, and `.env.local`. Publish port 3100 through the reserved domain `vannesa-overcomplacent-demurely.ngrok-free.dev`. Keep the tunnel alive with a user LaunchAgent; do not publish secrets to the browser bundle.

- [x] **Step 4: Smoke-test the public URL**

In a fresh browser context, verify HTTPS loads, the three presets render, the Moon preset submits, Agent progress reaches the story stage, “开始探索” enables real narration, deterministic interaction completes, refresh restores evidence, controlled revision creates a new immutable version, and no API key is requested from the visitor.

- [x] **Step 5: Record deployment evidence and commit**

Append the deployed commit, public URL, deployment timestamp, server capability status, and smoke-test result to `docs/verification/curiosity-guided-voice-gate.md`.

```bash
git add docs/verification/curiosity-guided-voice-gate.md
git commit -m "docs: record curiosity public deployment"
```
