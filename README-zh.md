# Curiosity Studio · 智能体驱动的网页应用生成器

一句话描述你想要的应用，三个智能体接力把它做出来：**planner** 出方案、**coder** 写代码、**reviewer** 验收。产物是一份自包含的单文件 HTML，在隔离沙箱里即时预览；之后继续对话就能增量修改，每一轮都留成一个版本，可随时回滚或从旧版本长出新分支。

「为什么世界」（面向 6–10 岁孩子的科普探索）作为一张模板卡保留在首页，走它自己的专用管线，代码零改动。

## 基本使用流程

1. 在首页写一句需求（或点一个示例），点「开始生成」。
2. 进入工作台：左边是对话线程，能看到三阶段进度和**正在写出的代码**；右边是 iframe 预览。
3. 第一版出来后，直接在输入框继续说要改什么 —— 例如「加一个今日完成计数，刷新不丢」。
4. 右上角版本下拉可切换任意历史版本，看到不是当前版时会出现「回到这一版」。

## 它是怎么工作的

| 角色 | 输出 | 形态 |
| --- | --- | --- |
| `studio.planner` | `{appName, appKind, summary, changeNote, features[], layout, interactions[], persistence}` | 严格 JSON |
| `studio.coder` | 新建=完整 HTML；修改=search/replace 编辑块 | 流式文本 |
| `studio.reviewer` | `{verdict, findings[]}` | 严格 JSON |

**分类只做路由，不做门禁。** planner 从 `tool / game / dashboard / content / form / creative / general` 里选一个 `appKind`，它决定 coder 拿到哪一段专属指引；选不出来就落到 `general`。分类错的代价是提示词不够贴切，而不是拒绝用户。

**生成质量靠四层机制**，不靠祈祷模型发挥：

1. **类型路由的提示词体系** —— 通用契约 + 每类应用 10–20 行的具体做法（游戏讲 rAF 主循环、delta time、触控与 preventDefault；看板讲手写内联 SVG 图表、坐标轴与空态……）。
2. **写进提示词的设计系统** —— `:root` 色板变量、4px 间距刻度、hover/focus-visible/active 三态、system-ui 字体栈、默认深色、窄屏可用；外加沙箱的真实约束：`alert/confirm/prompt` 会被屏蔽、页面自身发起的下载会被拦、没有网络。
3. **有牙齿的 reviewer** —— 输入是 HTML + 静态校验结果 + 方案功能清单；判 revise 时 findings 会注入下一轮 coder 提示词，不是摆设。
4. **运行时错误回灌** —— 预览页真实报的错（含 srcDoc 解析期的同步错误，通过重放握手补齐）挂到版本上，下一轮生成自动带上。

**修改优先定点编辑。** coder 用 search/replace 编辑块改动指定片段，服务端严格匹配：必须唯一命中、不得重叠、必须产生变化，不做模糊匹配。失配就回退整页重写一次，仍失败才明确报错。走了哪条路径记在 `Version.editMode`（全新/补丁/重写），界面上直接可见。

**信任边界**：客户端只发需求文本和要基于哪一版；当前 HTML 永远由服务端从存储读，模型只输出编辑块。预览 iframe 是 `sandbox="allow-scripts"`，刻意不加 `allow-same-origin`。

**版本树**：`parentVersionId` 构成树。回滚只改指针，历史不覆盖；在旧版本上继续改会长出新分支。

## 本地运行

需要 Node.js 20.9+（容器镜像用 Node 22）、pnpm 和 OpenRouter API Key。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
pnpm worker
```

`.env.local` 至少要有 `OPENROUTER_API_KEY`；模型解析读 `DEFAULT_MODEL` 与 `MODEL_ROUTES`，都不配会在请求时明确失败。**Web 进程自己不生成**，必须同时跑 `pnpm worker` —— 它在一个进程里跑 Studio 和 Curiosity 两条独立的任务循环，互不拖死。

## 准出

```bash
pnpm check      # 仅格式
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e   # 端口被占时用 CURIOSITY_E2E_PORT 覆盖
```

真实模型门禁：

```bash
STUDIO_SPIKE_CODERS='openrouter:z-ai/glm-5.2' pnpm spike:studio:real
```

6 类应用各 1 个样本 + 2 个「怪需求」兜底样本，每个都跑「创建 → 修改」两步，产物 HTML 与报告落在 `evidence/studio/`。GO 标准写死在 `lib/studio/spike.ts`：首次生成即通过静态校验 ≥80%、编辑块直接命中 ≥60%、修改步通过率 ≥80%、单次创建 p95 ≤ 4 分钟。

## 部署

```bash
docker compose up -d --build
```

Compose 同时起 Web 与 worker 两个服务，共享并固定名为 `curiosity-world-data` 的数据卷（`data/studio/`、`data/studio-jobs/`、Curiosity 的体验与任务都在里面），容器替换不丢数据。Web 容器 3000 端口映射到宿主 3100，由 ngrok 转发，可用 `CURIOSITY_HOST_PORT` 覆盖。

`CURIOSITY_PUBLIC_MODE=1` 只放行公开面：首页、`/studio`、`/curiosity`、体验页、健康检查，以及 `/api/studio/`、`/api/curiosity/`。运行配置只在部署机的 `.env.local`（git 忽略），换机器需要重配模型路由。
