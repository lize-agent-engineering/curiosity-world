# Curiosity World · 为什么世界

Curiosity World 把 6–10 岁孩子自由提出的“为什么”，变成经过知识与质量审查、可亲手操作的探索场景。除问题外，唯一用户参数是目标年龄。

## 核心链路

1. 安全且信息充分的问题进入五段生成：问题、知识、场景、呈现、质量。
2. 模型只选择受控场景并填写结构化配置，不生成 HTML、CSS、JavaScript、函数或表达式。
3. 九类 React 场景由单一 `CuriosityExperienceSpecV3`、统一事件词表和确定性 reducer 驱动。
4. 运行时旁白只能从生成期审核通过的旁白库选择。
5. Web 只创建和查询任务；独立 `curiosity-worker` 通过租约、检查点和 CAS 推进任务。

## 本地运行

```bash
pnpm install
cp .env.example .env.local
pnpm dev
pnpm worker:curiosity
```

Docker Compose 会同时启动 Web 与 worker，并共享任务数据卷。

## 准出

```bash
pnpm check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm check` 仅检查格式。真实模型门禁使用 12 类问题各 5 次，硬时限 120 秒；模型只能由 worker 的服务端 `MODEL_ROUTES`/`DEFAULT_MODEL` 配置。准备工程 evidence、Web 与 worker 后运行 `pnpm spike:curiosity:real`。
