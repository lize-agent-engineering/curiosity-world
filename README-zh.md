# Curiosity World · 为什么世界

Curiosity World 把孩子真实的“为什么”，变成有语音引导、可以亲手操作的探索小游戏。

专业 Agent 小队依次完成问题建模、团队组建、科学知识设计、互动设计、故事旁白和质量审查，再由 React/SVG/Motion 确定性场景呈现。模型只产出受约束的规格，可运行应用由确定性编译器生成。

当前覆盖三类知识族，每类覆盖一组同族问法，首页三个预设问题只是入口示例：

| 知识族 | 预设问题 |
| --- | --- |
| `relative-motion` 相对运动 | 为什么月亮看起来会跟着我们？ |
| `light-path` 光路遮挡 | 影子为什么会变长？ |
| `balance-support` 平衡支撑 | 桥为什么不会倒？ |

尚不支持任意开放问题：无法匹配到知识族的问题会被明确拒绝，而不会用模板内容冒充成功。

## 完整闭环

1. 输入或选择一个问题。
2. 看见 Agent 小队生成探索，阶段进度实时可见。
3. 先预测，再操作场景观察现象。
4. 用语音或触摸回答，语音转写会作为带 ID 的行为事件入库。
5. 解释发现并回看探索证据。
6. 从历史恢复，或换个角度重新讲解。

## 本地运行

需要 Node.js 20.9+（容器镜像使用 Node 22）、pnpm 和 OpenRouter API Key。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.local` 至少需要填入 `OPENROUTER_API_KEY`。模型解析读取的是 `DEFAULT_MODEL` 与 `MODEL_ROUTES`，两者都不配会在请求时明确失败。语音链路还依赖 `CURIOSITY_TTS_*` 与 `CURIOSITY_ASR_*`。

核心验证：

```bash
pnpm vitest run tests/curiosity
pnpm run check:curiosity-deploy
pnpm build
```

## 部署

首版使用 Docker 本地部署，并通过已配置的固定 ngrok 域名提供公网体验。设置 `CURIOSITY_PUBLIC_MODE=1` 后，只公开 Curiosity World 首页、体验页、健康检查和 Curiosity API。

线上容器是手工启动的，容器内 3000 端口映射到宿主机 3100，再由 ngrok 转发：

```bash
docker build -t curiosity-world:$(git rev-parse --short HEAD) .
docker run -d --name curiosity-world-local -p 3100:3000 \
  --env-file .env.local -v curiosity-world-data:/app/data \
  --restart unless-stopped curiosity-world:$(git rev-parse --short HEAD)
```

注意 `docker-compose.yml` 映射的是 `3000:3000`，与线上实际拓扑不一致，不能直接用它替换线上容器。

体验版本与行为事件写入命名数据卷 `curiosity-world-data`，容器重启后完整恢复；替换容器时保持该卷挂载即可不丢数据。

运行配置只存在于部署机器的 `.env.local`（已被 git 忽略），不随仓库分发。换机器部署需要重新配置模型路由与语音链路。
