# Curiosity World · 为什么世界

Curiosity World 把 6–10 岁孩子自由提出的“为什么”，变成经过知识与质量审查、可亲手操作的探索场景。除问题外，唯一用户参数是目标年龄。

## 核心链路

1. 安全且信息充分的问题进入五段生成：问题、知识、场景、呈现、质量。
2. 模型只选择受控场景并填写结构化配置，不生成 HTML、CSS、JavaScript、函数或表达式。
3. 九类 React 场景由单一 `CuriosityExperienceSpecV3`、统一事件词表和确定性 reducer 驱动。
4. 运行时旁白只能从生成期审核通过的旁白库选择。
5. Web 只创建和查询任务；独立 `curiosity-worker` 通过租约、检查点和 CAS 推进任务。

## 完整闭环

1. 输入一个问题。
2. 看见 Agent 小队生成探索，阶段进度实时可见。
3. 先预测，再操作场景观察现象。
4. 用语音或触摸回答，语音转写会作为带 ID 的行为事件入库。
5. 解释发现并回看探索证据。
6. 从历史恢复，在允许的补丁范围内修改，或换个角度重新讲解。

## 本地运行

需要 Node.js 20.9+（容器镜像使用 Node 22）、pnpm 和 OpenRouter API Key。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
pnpm worker:curiosity
```

`.env.local` 至少需要填入 `OPENROUTER_API_KEY`。模型解析读取的是 `DEFAULT_MODEL` 与 `MODEL_ROUTES`，两者都不配会在请求时明确失败。语音链路还依赖 `CURIOSITY_TTS_*` 与 `CURIOSITY_ASR_*`。Web 进程自己不生成，必须同时运行 `pnpm worker:curiosity`。

## 准出

```bash
pnpm check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm check` 仅检查格式。真实模型门禁使用 12 类问题各 5 次，硬时限 10 分钟；模型只能由 worker 的服务端 `MODEL_ROUTES`/`DEFAULT_MODEL` 配置。准备工程 evidence、Web 与 worker 后运行 `pnpm spike:curiosity:real`。

## 部署

使用 Docker 部署，并通过已配置的固定 ngrok 域名提供公网体验。设置 `CURIOSITY_PUBLIC_MODE=1` 后，只公开首页、体验页、健康检查和 Curiosity API。

Docker Compose 会同时启动 Web 与 `curiosity-worker` 两个服务，共享 `curiosity-world-data` 数据卷，并固定该卷名，避免 compose 加项目名前缀后连到一个空卷上：

```bash
docker compose up -d --build
```

Web 的容器内 3000 端口映射到宿主机 3100，再由 ngrok 转发；可用 `CURIOSITY_HOST_PORT` 覆盖。部署机器上宿主机 3000 端口已被另一个项目占用。

体验版本、行为事件与生成任务写入命名数据卷 `curiosity-world-data`，容器重启后完整恢复；替换容器时保持该卷挂载即可不丢数据。

运行配置只存在于部署机器的 `.env.local`（已被 git 忽略），不随仓库分发。换机器部署需要重新配置模型路由与语音链路。
