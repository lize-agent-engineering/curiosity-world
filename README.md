# Curiosity World

Curiosity World turns open-ended questions from children aged 6–10 into reviewed, interactive exploration scenes. The only user parameter besides the question is target age.

The system uses one `CuriosityExperienceSpecV3`, nine controlled React scene types, a deterministic event protocol, and a generation-time reviewed narration library. The Web process only creates and reads jobs; an independent leased, CAS-protected `curiosity-worker` performs generation.

## Product loop

1. Ask a question.
2. Watch the agent team build the exploration, with live stage progress.
3. Predict what will happen.
4. Act in the controlled scene and observe the result.
5. Answer by voice or touch — a transcript is stored as an ID-carrying behaviour event.
6. Explain the discovery and review the evidence.
7. Revisit history, revise within the allowed patch set, or regenerate from another angle.

## Run locally

Requirements: Node.js 20.9+ (the container image uses Node 22), pnpm, and an OpenRouter API key.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
pnpm worker:curiosity
```

`.env.local` needs at least `OPENROUTER_API_KEY`. Model resolution reads `DEFAULT_MODEL` and `MODEL_ROUTES`; with neither set, requests fail explicitly. The voice loop additionally needs `CURIOSITY_TTS_*` and `CURIOSITY_ASR_*`. The Web process alone cannot generate: `pnpm worker:curiosity` must run alongside it.

## Gates

```bash
pnpm check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm check` is formatting only. The real-model gate executes 12 question classes five times each with a hard 10-minute limit through `pnpm spike:curiosity:real`. Models are configured only through the worker's server-side `MODEL_ROUTES`/`DEFAULT_MODEL`.

## Deployment

The release runs in Docker and is exposed through the configured fixed ngrok domain. Set `CURIOSITY_PUBLIC_MODE=1` to expose only the public surface: homepage, experience pages, health endpoint, and Curiosity APIs.

Docker Compose starts both services — Web and `curiosity-worker` — against the shared `curiosity-world-data` volume, and pins that volume name so the stack comes up on the real data rather than a project-prefixed empty one:

```bash
docker compose up -d --build
```

Web publishes container port 3000 on host port 3100, which ngrok forwards; override with `CURIOSITY_HOST_PORT`. Host port 3000 is taken by another local project on the deployment machine.

Experience versions, behaviour events, and generation jobs live in the named volume `curiosity-world-data` and survive restarts; keep that volume mounted when replacing containers and no data is lost.

Runtime configuration lives only in the deployment machine's `.env.local`, which is git-ignored and therefore not distributed with the repository. Deploying on another machine means reconfiguring model routing and the voice loop.
