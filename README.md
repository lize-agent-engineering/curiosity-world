# Curiosity World

Curiosity World turns open-ended questions from children aged 6–10 into reviewed, interactive exploration scenes. The only user parameter besides the question is target age.

The system uses one `CuriosityExperienceSpecV3`, nine controlled React scene types, a deterministic event protocol, and a generation-time reviewed narration library. The Web process only creates and reads jobs; an independent leased, CAS-protected `curiosity-worker` performs generation.

## Run locally

```bash
pnpm install
cp .env.example .env.local
pnpm dev
pnpm worker:curiosity
```

Docker Compose starts Web and worker services with a shared job volume.

## Gates

```bash
pnpm check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm check` is formatting only. The real-model gate executes 12 question classes five times each with a hard 120-second limit through `pnpm spike:curiosity:real`. Models are configured only through the worker's server-side `MODEL_ROUTES`/`DEFAULT_MODEL`.
