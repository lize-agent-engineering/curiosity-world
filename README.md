# Curiosity World

Curiosity World turns a child’s real “why” question into a guided, voice-first interactive exploration.

A team of specialized agents models the question, assembles a crew, checks the science, designs one-action-at-a-time interactions, writes child-friendly narration, and reviews the result before a deterministic React/SVG/Motion scene is shown. The models only ever produce a constrained spec; the runnable app is emitted by a deterministic compiler.

Three knowledge families are supported. Each covers a group of related phrasings, so the three preset questions on the home page are entry points rather than the whole catalogue:

| Knowledge family | Preset question |
| --- | --- |
| `relative-motion` | Why does the moon seem to follow us? |
| `light-path` | Why do shadows get longer? |
| `balance-support` | Why doesn’t the bridge fall down? |

Open-ended questions are not supported yet: anything that matches no knowledge family is rejected explicitly rather than answered with template content.

## Product loop

1. Ask or select a question.
2. Watch the agent team build the exploration, with live stage progress.
3. Predict what will happen.
4. Act in the animated scene and observe the result.
5. Answer by voice or touch — a transcript is stored as an ID-carrying behaviour event.
6. Explain the discovery and review the evidence.
7. Revisit history or regenerate the explanation from another angle.

## Local development

Requirements: Node.js 20.9+ (the container image uses Node 22), pnpm, and an OpenRouter API key.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.local` needs at least `OPENROUTER_API_KEY`. Model resolution reads `DEFAULT_MODEL` and `MODEL_ROUTES`; with neither set, requests fail explicitly. The voice loop additionally needs `CURIOSITY_TTS_*` and `CURIOSITY_ASR_*`.

Core checks:

```bash
pnpm vitest run tests/curiosity
pnpm run check:curiosity-deploy
pnpm build
```

## Deployment

The first release runs in Docker and is exposed through the configured fixed ngrok domain. Set `CURIOSITY_PUBLIC_MODE=1` to expose only the Curiosity World homepage, experience pages, health endpoint, and Curiosity APIs.

The live container is started by hand; container port 3000 is published on host port 3100, which ngrok forwards:

```bash
docker build -t curiosity-world:$(git rev-parse --short HEAD) .
docker run -d --name curiosity-world-local -p 3100:3000 \
  --env-file .env.local -v curiosity-world-data:/app/data \
  --restart unless-stopped curiosity-world:$(git rev-parse --short HEAD)
```

Note that `docker-compose.yml` maps `3000:3000`, which does not match the live topology — do not use it to replace the running container.

Experience versions and behaviour events live in the named volume `curiosity-world-data` and survive restarts; keep that volume mounted when replacing the container and no data is lost.

Runtime configuration lives only in the deployment machine’s `.env.local`, which is git-ignored and therefore not distributed with the repository. Deploying on another machine means reconfiguring model routing and the voice loop.
