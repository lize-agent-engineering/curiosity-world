# Curiosity World

Curiosity World turns a child’s real “why” question into a guided, voice-first interactive exploration.

The first release focuses on one complete experience: **“Why does the moon seem to follow me?”** A team of specialized agents models the question, checks the science, designs one-action-at-a-time interactions, writes child-friendly narration, and reviews the result before a deterministic React/SVG/Motion scene is shown.

## Product loop

1. Ask or select a question.
2. Watch the agent team build the exploration.
3. Predict what will happen.
4. Act in the animated scene and observe the result.
5. Answer by voice or touch.
6. Explain the discovery and review the evidence.
7. Revisit history or regenerate the explanation from another angle.

## Local development

Requirements: Node.js 20.9+, pnpm, and an OpenRouter API key.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Core checks:

```bash
pnpm vitest run tests/curiosity
pnpm run check:curiosity-deploy
pnpm build
```

## Deployment

The first release runs in Docker and is exposed through the configured fixed ngrok domain. Set `CURIOSITY_PUBLIC_MODE=1` to expose only the Curiosity World homepage, experience pages, health endpoint, and Curiosity APIs.
