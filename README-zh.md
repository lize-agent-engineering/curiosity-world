# 为什么世界 · Curiosity World

家长输入孩子问的一个"为什么"和孩子的年龄，三个智能体现场**规划、写代码、验收**，生成一个孩子可以亲手操作的探索网页——先猜一猜、动手试、再看懂为什么。做完之后接着说话就能改，每一轮留成一个版本，可回滚、可从旧版本长新分支，也可以整页下载带走。

和第一版最大的区别：**问题不再限于三个预设知识族，应用是真正被生成出来的代码**，而不是把配置填进固定场景。

## 基本使用流程

1. 首页写下孩子的问题（或点一个示例），填孩子年龄，点「开始这次探索」。
2. 进入工作台：左边能看到规划 / 编码 / 审查三个阶段，以及**正在一行行写出来的代码**；右边是 iframe 预览。
3. 第一版出来后接着说要改什么，例如「他只有 6 岁，再直观一点」。
4. 右上角可切换任意历史版本、回滚，或者「下载带走」把这一页存下来。

## 它是怎么工作的

| 角色 | 输出 | 形态 |
| --- | --- | --- |
| `studio.planner` | 探索方案 + 孩子该理解的因果关系 + 必须避开的常见错误说法 | 严格 JSON |
| `studio.coder` | 新建=完整 HTML；修改=search/replace 编辑块 | 流式文本 |
| `studio.reviewer` | `{verdict, findings[]}`，第一条检查项是知识是否正确 | 严格 JSON |

**生成质量靠四层机制**，不靠祈祷模型发挥：

1. **教育专属提示词** —— coder 拿到的是"给孩子的探索页面"的规矩：至少两种会改变画面状态的交互（纯翻页不算）、先让孩子猜再揭示答案、一个换情境的迁移小挑战、明确的结束画面、底部一块「给家长看」。年龄决定语言预算（4–6 岁几乎不用字，9–12 岁可以读完整句子）。
2. **写进提示词的设计系统与沙箱约束** —— `:root` 色板变量、4px 间距刻度、三态交互、system-ui 字体栈、触控优先；外加沙箱现实：`alert/confirm/prompt` 会被屏蔽、页面自身发起的下载会被拦、没有网络。
3. **有牙齿的 reviewer** —— 知识错误直接判 blocker；还检查是不是真互动、有没有一上来就把答案写在屏幕上、是否适龄。findings 注入下一轮 coder 提示词。
4. **运行时错误回灌** —— 预览页真实报的错（含 srcDoc 解析期的同步错误，靠重放握手补齐）挂到版本上，下一轮生成自动带上。

**修改优先定点编辑。** coder 用 search/replace 编辑块改指定片段，服务端严格匹配：唯一命中、不得重叠、必须产生变化，不做模糊匹配。失配就回退整页重写一次，仍失败才明确报错。走了哪条路径记在 `Version.editMode`，界面上连同 diff 一起可展开。

**信任边界**：客户端只发问题文本和要基于哪一版；当前 HTML 永远由服务端从存储读。预览 iframe 是 `sandbox="allow-scripts"`，刻意不加 `allow-same-origin`。

**旁白**：页面统一调 `window.curiositySay('…')`，并自带 `speechSynthesis` 保底实现。工作台会用垫片抢先接管这个函数，改用配置好的童声播报；TTS 不可用时把这句话交还给页面自己念。下载带走的页面因此照样能读给孩子听。

**延展能力**：同一套引擎去掉领域指引就是通用生成器（`mode: 'general'`，接口和提示词都在）。首页目前不放入口，主线只有一条。

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

6 个跨领域的儿童问题、覆盖 5–11 岁，每个都跑「创建 → 家长追加修改」两步，产物 HTML 与报告落在 `evidence/studio/`。GO 标准写死在 `lib/studio/spike.ts`：首次生成即通过静态校验 ≥80%、编辑块直接命中 ≥60%、修改步通过率 ≥80%、**页面会念出来 ≥80%**、单次创建 p95 ≤ 4 分钟。

## 部署

```bash
docker compose up -d --build
```

Compose 同时起 Web 与 worker 两个服务，共享并固定名为 `curiosity-world-data` 的数据卷（`data/studio/`、`data/studio-jobs/`、Curiosity 的体验与任务都在里面），容器替换不丢数据。Web 容器 3000 端口映射到宿主 3100，由 ngrok 转发，可用 `CURIOSITY_HOST_PORT` 覆盖。

`CURIOSITY_PUBLIC_MODE=1` 只放行公开面：首页、`/studio`、`/curiosity`、体验页、健康检查，以及 `/api/studio/`、`/api/curiosity/`。运行配置只在部署机的 `.env.local`（git 忽略），换机器需要重配模型路由。
