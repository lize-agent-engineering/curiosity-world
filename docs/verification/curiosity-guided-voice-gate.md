# Curiosity World 第一版公网准出记录

## 候选

- 验证时间：2026-08-16（Asia/Shanghai）
- 分支：`codex/moon-spike`
- 应用提交：`6eef9c0`
- 生产镜像：`sha256:e7ec27288d37ddd967bcf302ebf333eae64daca2329d6b65bbeeccd73e7deaee`
- 固定入口：<https://vannesa-overcomplacent-demurely.ngrok-free.dev>
- 部署方式：本机 Docker + 固定 ngrok Reserved Domain

## 准出结论

`PUBLIC_RC_PASS`：第一版访客主链路已在真实公网、真实国产 OpenRouter 文本模型、真实 TTS 和真实 ASR 上通过。

2026-08-16 发布裁决：当前 OpenRouter Key 鉴权、真实多 Agent 生成与公网 TTS 均正常。所有者明确决定第一版继续使用当前 Key，并接受曾暴露 Key 的安全风险；Key 轮换不再作为本候选的发布阻塞。后续仍建议在方便时轮换，但不影响当前链接功能可用性。

## 真实访客闭环

应用内浏览器从固定公网入口完成以下流程，未填写或看到 API Key：

1. 首页展示三个预设问题，选择默认的“为什么月亮看起来会跟着我们？”。
2. 多 Agent 生成进度依次出现知识边界、互动设计、五阶段故事和确定性编译，最终进入候选体验。
3. 点击“开始探索”后播放固定中文旁白，同时显示字幕与“重听 / 跳过 / 点击说话”。
4. 在沙箱 iframe 中完成预测、两次变量操作、迁移观察、解释选择和完成事件。
5. 引导 Agent 随当前阶段返回观察提示和结论，不改变确定性任务规则。
6. 家长复盘只呈现有事件 ID 的行为事实，不推断能力或心理状态。
7. 刷新后仍恢复“孩子完成了本次探索”的记录。
8. 提交“把探索指令精简成一句话”后生成版本 2；版本 1 标记为 `superseded`，版本 2 为 `active`，知识包、年龄、兴趣、视觉主题和变量保持不变。

## 换角度与探索历史闭环

公网体验 `cur_yKx_moe5PNd-` 完成了新增闭环：版本 1 完成预测、三次变量操作、迁移、解释和完成事件；点击“一键换个角度再讲一遍”后重新运行首次生成团队并产生版本 2；版本 2 通过 iframe 就绪检查后才激活，版本 1 保留为 `superseded`。家长端可在“探索历史”中回看版本 1 的全部事件证据，刷新页面后默认恢复活动版本 2。

验收中两次失败候选分别因核心因果被模型改写和变量越过知识插件边界而 fast-fail，均未覆盖版本 1。随后将核心因果从重新生成模型的输出权限中移除，由系统注入已验收关系；并把变量范围校验提前到互动 Agent 边界。第三次真实生成通过。

角色路由按任务拆分：Qwen 3.7 Flash 负责问题建模、互动设计和运行期引导；Kimi K2.5 负责知识设计和质量审查；GLM 5.1 负责故事设计和受控修改。Qwen 故事模型实测出现不适合儿童的成人化比喻，因此不进入当前故事路由。

最新生产镜像真实生成任务 `job_qEe1da51MO` 一次通过，总耗时约 228 秒。逐角色耗时为：问题建模 7.9 秒、知识设计 60.6 秒、互动设计 48.7 秒、故事设计 64.6 秒、质量审查 46.1 秒。生成过程异步展示进度，失败候选不会激活或写入探索历史。

故事 Agent 的听觉负担已进入严格合同：8 岁儿童每段旁白最多 56 个汉字、问题最多 42 个汉字、提示最多 36 个汉字，并禁止成人成语、讽刺挖苦和智力贬低。最新真实产物四段旁白分别为 21、21、18、17 个字符；示例为“拖动小人往前走，观察路灯和月亮谁后退得快。”。Kimi K2.5 故事路由 A/B 因长旁白与严格结构化输出耗时过长被淘汰，故事角色继续使用已验证的 GLM 5.1。

模型结构化输出改为单次 fast-fail，不再对同一无效结果隐式重试三次。问题建模 Schema 同时限定唯一知识族、正确年龄段和受支持状态，消除了预设问题偶发返回多知识族的失败点。

最新生成体验 ID：`cur_VsIDahE_rdAz`，版本 ID：`ver_oqHgPVZsu4YF`。此前完整家长证据体验 `cur_4AVFFyESFvf9` 包含两次观察者移动、一次解释选择和一次完成事件。

## 声音能力

| 能力 | 结果 | 证据 |
| --- | --- | --- |
| 中文旁白 | PASS | 公网 `/api/curiosity/narration` 返回 `200` 和 71,611 字节音频；儿童页实际进入“重听”状态 |
| 中文识别 | PASS | 公网 `/api/curiosity/transcribe` 返回 `200`，识别为“我觉得月亮离我们很远，所以看起来一直跟着我。” |
| 访客密钥 | PASS | 浏览器主链路无模型选择器、Provider 配置或 API Key 输入 |
| 原始录音持久化 | PASS | 产品契约只保存确认后的转写和阶段绑定，不保存原始音频 |

最新短旁白复验：将真实故事产物“拖动小人往前走，观察路灯和月亮谁后退得快。”提交到固定公网 `/api/curiosity/narration`，返回 `200 audio/mpeg`、92,251 字节，耗时约 3.8 秒。请求只包含 `text`，服务端固定音色与密钥。

## 部署与隔离

| 门禁 | 结果 |
| --- | --- |
| `pnpm check:curiosity-deploy` | PASS：`ready: true`，无 issue |
| Docker 容器 | PASS：`curiosity-world-local` 运行中，`restart=unless-stopped` |
| 数据恢复 | PASS：命名卷 `curiosity-world-data` 挂载到 `/app/data` |
| 固定 HTTPS | PASS：Reserved Domain 首页与 `/api/health` 均为 `200` |
| 隧道恢复 | PASS：LaunchAgent `com.curiosity-world.ngrok` 为 `KeepAlive + RunAtLoad`，强制重启后重新建连 |
| 非产品入口隔离 | PASS：`/api/server-providers`、`/api/chat`、`/settings` 均为 `404` |

最新强制重启复验：容器重启前后 `/app/data/curiosity-jobs` 均为 34 个任务文件，`job_qEe1da51MO` 均保持 `candidate_ready`，固定公网首页自动恢复为 `200`。额外核验 `/classroom` 为 `404`；浏览器可见首页只有问题、年龄、兴趣、三个预设问题、生成按钮和探索历史，没有 Provider、模型选择器或 API Key 输入。

Git 全历史按 OpenRouter Key 格式扫描为 0 命中，`.env.local` 处于忽略状态。该证据只证明仓库未提交密钥，不替代对曾暴露密钥的控制台轮换。

## 工程门禁

| 命令 | 结果 |
| --- | --- |
| `pnpm vitest run tests/curiosity` | PASS：25 个文件、189 项测试 |
| `pnpm exec tsc --noEmit` | PASS |
| `docker build -t curiosity-world:child-load-v1 .` | PASS：Next.js 生产构建、类型检查、46 个路由单元完成 |

Curiosity 范围、生产构建和真实公网闭环是本候选的权威准出边界。
