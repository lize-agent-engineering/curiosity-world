# Curiosity World Moon Spike Design

## Goal

Turn a parent's question about why the moon appears to follow a moving observer
into a bounded, runnable exploration for children aged 6–10. The Spike proves a
structured-specification pipeline, deterministic interaction runtime, traceable
events, validated natural-language revisions, and local version recovery.

## Product boundary

- The only supported knowledge pack is `relative-motion.moon-following.v1`.
- Unsupported, unsafe, or age-out-of-range requests fail explicitly. They never
  fall back to a generic lesson.
- The model may author age-appropriate copy and select allow-listed task options.
  It may not author physics, coordinates, state machines, event code, or HTML.
- The visible application has three states: parent creation, child exploration,
  and parent review/revision. Classroom and lecture metaphors are not exposed.

## Architecture

The Curiosity vertical slice lives alongside retained Curiosity World infrastructure.
It reuses model resolution and the tested iframe error-capture approach, while
owning its schemas, knowledge pack, compiler, job API, persistence repository,
event reducer, and pages. Existing course `Scene` and `Stage` types are not used
as domain models.

Generation produces a strict `CuriosityExperienceSpecV1`. A deterministic
compiler embeds that specification into known HTML, CSS, and JavaScript. The
child iframe has only `allow-scripts`; it becomes playable only after a validated
`experience_ready` message. Runtime errors or readiness timeout fail the
candidate revision.

Revisions produce a strict `CuriosityPatchV1`. Applying a patch creates a
candidate specification, then reruns scope, knowledge, schema, event, compile,
and runtime checks. A failed candidate never replaces the active revision.

## Data and evidence

An IndexedDB-backed repository stores experience metadata, immutable revisions,
the active revision id, and deduplicated event envelopes. Parent summaries are
deterministic reductions of event data; each behavioral statement carries the
event ids that support it. No mastery score or ability label is produced.

## Validation

Unit and API tests cover strict schemas, scope rejection, deterministic compile,
patch restrictions, event authentication, summary traceability, persistence,
and failure atomicity. Playwright covers create, play, review, revise, version,
and reload. A separate live-model runner records the PRD's five generation,
five revision, and five rejection trials; without those results the verdict is
`VERIFICATION_FAILED`.

