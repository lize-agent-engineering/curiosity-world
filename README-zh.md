# Curiosity World · 为什么世界

Curiosity World 把孩子的“为什么”，变成有语音引导、可以亲手操作的探索小游戏。

## 当前面试演示范围

当前可运行范围严格限于三个预设问题：

- 月亮为什么跟着我？
- 恐龙为什么会消失？
- 为什么会下雨？

当前尚未支持自由问题；受本次笔试时间与 AI Coding 工具额度限制，它被列为后续的 P0 优先级方向。

首版聚焦一个完整案例：**“月亮为什么像在跟着我？”** 专业 Agent 小队依次完成问题建模、科学知识设计、互动设计、故事旁白和质量审查，再由 React/SVG/Motion 确定性场景呈现。

## 完整闭环

1. 输入或选择一个问题。
2. 看见 Agent 小队生成探索。
3. 先预测，再操作场景观察现象。
4. 用语音或触摸回答。
5. 解释发现并回看探索证据。
6. 从历史恢复，或换个角度重新讲解。

## 本地运行

需要 Node.js 20.9+、pnpm 和 OpenRouter API Key。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

核心验证：

```bash
pnpm vitest run tests/curiosity
pnpm run check:curiosity-deploy
pnpm build
```

## 部署

首版使用 Docker 本地部署，并通过已配置的固定 ngrok 域名提供公网体验。设置 `CURIOSITY_PUBLIC_MODE=1` 后，只公开 Curiosity World 首页、体验页、健康检查和 Curiosity API。
