# Curiosity World Moon Spike Implementation Plan

> **For agentic workers:** Execute inline with test-driven development. Do not
> expand beyond the single knowledge pack until the live Spike gate passes.

**Goal:** Deliver a runnable and revisable moon-following exploration with
deterministic science, traceable events, immutable local versions, and explicit
failure outside the supported boundary.

**Architecture:** Add a Curiosity-owned vertical slice that reuses Curiosity World model
resolution and sandbox hardening but does not reuse course domain models. Model
output is strict data; a deterministic compiler owns all executable behavior.

**Tech stack:** Next.js 16, React 19, TypeScript, Zod, Dexie, Vitest, Playwright.

## Global constraints

- Support only ages 6–10 and `relative-motion.moon-following.v1`.
- Fail fast for unsupported, unsafe, invalid, or broken output.
- Never generate arbitrary executable code with a model.
- Activate a candidate revision only after runtime readiness succeeds.
- Keep parent claims traceable to event ids.
- Use existing UI primitives; add no component framework.

## Tasks

1. Define strict domain schemas, the knowledge pack, scope classifier, and tests.
2. Define the deterministic compiler, runtime message protocol, reducer, and tests.
3. Define immutable repository contracts and an IndexedDB implementation with tests.
4. Add generation and revision jobs using existing model resolution with API tests.
5. Replace visible pages with parent, child, and review flows plus component tests.
6. Replace legacy main-path E2E tests and add the live-model evidence runner.
7. Run formatting, lint, unit, build, E2E, and live gates; keep the verdict explicit.

