/**
 * The prompt system is where generation quality is actually decided.
 *
 * Three layers, in order of how much they matter:
 *  1. `STUDIO_CODER_CONTRACT` — the non-negotiable envelope: self-contained
 *     output, the sandbox's real constraints, and a concrete design system
 *     (token names, spacing scale, interaction states) rather than an
 *     exhortation to make it look nice.
 *  2. `STUDIO_APP_KIND_GUIDE` — per-kind craft notes. The planner picks a kind
 *     and it selects a guide; an unrecognized kind lands on `general`, so a
 *     misclassification costs a less specific prompt and never a refusal.
 *  3. The per-round renderers, which restate the plan's features, replay the
 *     reviewer's findings, the previous preview's runtime errors, and any
 *     edit-block failure guidance so each retry is aimed at something concrete.
 */

import type { StudioAppKind, StudioPlan, StudioReview, StudioRuntimeError } from './contracts';
import { STUDIO_EDIT_BLOCK_FORMAT } from './edit-blocks';
import type { StudioValidationReport } from './validate';

export const STUDIO_CODER_CONTRACT = `你是一名资深前端工程师，只输出可以直接在浏览器里运行的单文件网页应用。

【输出格式】
1. 只输出一份完整的 HTML 文档：从 <!doctype html> 开始，到 </html> 结束。不要输出解释文字，不要用 Markdown 代码围栏。
2. 所有 CSS 写在 <style> 内，所有 JavaScript 写在 <script> 内，全部内联在这一份文件里。
3. 零外链：禁止 CDN、外部脚本、外部样式表、网络字体、远程图片。需要图形就写内联 SVG 或用 emoji。
4. 目标体积 60KB 以内；宁可少写装饰，也要把功能写完整。

【运行环境：预览是 sandbox="allow-scripts" 的 iframe，没有同源权限】
5. 禁止 alert / confirm / prompt —— 它们会被浏览器直接屏蔽，用页面内的提示条、确认卡片、输入框代替。
6. localStorage 可用（宿主已注入内存垫片）。需要"刷新不丢"的数据就写 localStorage，读取时必须处理为空值和 JSON 解析失败。
7. 禁止 fetch / XMLHttpRequest / WebSocket / document.write / 跳转父页面。所有数据来自用户输入或页面内置的常量。
8. 页面自身触发的下载会被沙箱拦截：需要导出时，把结果显示在页面里让用户复制。

【视觉基线】
9. 在 :root 用 CSS 自定义属性定义色板：--bg、--surface、--text、--muted、--accent、--border；全篇只引用这些变量，不要散落硬编码颜色。
10. 默认深色：深背景、高对比正文、--accent 只用于主操作与强调，一个页面不超过一种强调色。
11. 间距走 4px 刻度（4/8/12/16/24/32/48），圆角统一两档（例如 10px 与 16px），阴影克制。
12. 每个可交互元素都要有 hover / focus-visible / active 三态，过渡 150–200ms，并尊重 prefers-reduced-motion。
13. 字体栈固定：font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif；等宽处用 ui-monospace, SFMono-Regular, Menlo, monospace。
14. 桌面与手机都要好用：flex / grid + clamp()，窄屏自动单栏，触控目标不小于 44px。

【行为基线】
15. 键盘可用：Tab 顺序合理，focus-visible 清晰可见，主操作支持回车。
16. 空态必须有文案，不能留一片空白；非法输入要有具体提示，不能静默失败。
17. 所有界面文案用简体中文，简洁、具体，不用营销腔。
18. 代码必须能直接跑：不留 TODO，不引用不存在的函数或元素，绑定事件前先确认元素存在，脚本放在 body 末尾或用 DOMContentLoaded。`;

export const STUDIO_APP_KIND_GUIDE: Record<StudioAppKind, string> = {
  tool: `【工具类应用要点】
- 核心是"输入 → 即时结果"：能实时算就实时算，不要逼用户点一次"计算"才看到反馈。
- 主操作放在视觉中心，次要操作降级为文字按钮；一个界面只有一个主按钮。
- 结果区要一眼读懂：大字号数值 + 单位 + 一行解释说明它是怎么来的。
- 提供重置与撤销；破坏性操作（清空）要能撤回或先确认（页面内确认，不用 confirm）。
- 支持键盘：回车提交、Esc 取消，并在界面上标出这些快捷键。
- 上次的输入写入 localStorage，刷新后自动恢复。
- 边界值必须有确定行为：空输入、0、负数、超大数、非数字。
- 复制结果用 navigator.clipboard.writeText，失败时降级为选中文本并提示手动复制。`,

  game: `【游戏类应用要点】
- 主循环用 requestAnimationFrame，按 delta time 推进而不是按帧数；暂停时停掉循环，恢复时重置计时基准。
- 明确状态机：ready / playing / paused / over，每个状态都有对应的界面，不要只靠一个变量偷偷切换。
- 键盘（方向键 / WASD / 空格）与触控都要支持：触控用屏幕按钮或滑动手势，手机上必须能玩。
- 方向键与空格要 preventDefault，避免页面跟着滚动。
- 碰撞检测用简单可靠的方式（AABB 矩形相交或圆心距离），边界判定写清楚。
- 分数实时显示；结束界面展示本局分数与最高分，最高分写 localStorage。
- 难度随时间或分数递增，但开局要足够简单，前 10 秒不能让人失败。
- 用 canvas 时固定逻辑分辨率并保持宽高比：CSS 上用 aspect-ratio 锁定（棋盘类用 1/1），JS 里按 devicePixelRatio 设置 canvas.width/height，画布不能随视口被拉成细长条。
- 结束后一键重开，不需要刷新页面。`,

  dashboard: `【数据看板类应用要点】
- 用 CSS Grid 组织：顶部一行关键指标卡片，下面是图表区，窄屏自动堆叠。
- 图表全部手写内联 SVG（折线、柱状、环形），不要引用任何图表库；必须画出坐标轴、刻度和数值标签。
- 首屏必须有数据可看：内置一组合理的示例数据（写成常量数组）作为初始状态，并在界面上注明这是示例数据。即使支持用户录入，也不要让人打开就面对一张全是 0 的看板。
- 关键指标用大字号，配同比/环比方向标记（▲▼）与语义色（涨/跌用两种不同色，不要只靠颜色区分，同时给符号）。
- 每个图表都要有标题与单位；整页配色控制在 3–4 种。
- 提供至少一个筛选维度（时间范围或类别），筛选后图表实时重绘。
- 悬停显示具体数值（绝对定位的 tooltip 或 SVG <title>）。
- 无数据时显示明确的空态文案，而不是一张空坐标轴。`,

  content: `【内容/阅读类应用要点】
- 阅读优先：正文宽度控制在 60–75 个字符（约 34em），行高 1.7，正文字号不小于 16px。
- 层级清晰：主标题、小标题、正文、注释四级，靠字号与间距区分，不要靠加粗堆叠。
- 长内容提供目录或锚点导航，滚动时高亮当前章节。
- 交互（折叠、切换、搜索过滤）要服务阅读，不要打断阅读。
- 插图用内联 SVG 或 emoji，配一行说明文字。
- 代码块用等宽字体、轻微背景、可横向滚动，不要让整页横向滚动。
- 段落之间留白充足；引用块用左边框 + 弱化文字色。`,

  form: `【表单/流程类应用要点】
- 每个字段都要有 <label>（不能只有 placeholder），必要时补一行说明，并预留错误信息位置。
- 校验分两层：失焦时校验单个字段，提交时整体校验；错误信息要说清"哪里错了、怎么改"。
- 提交后给出页面内的成功态，并展示提交内容摘要；不要真的发网络请求。
- 多步流程要有进度指示与"上一步"，每步可独立校验。
- 全流程键盘可完成：回车提交，提交失败时自动聚焦到第一个出错字段。
- 草稿写入 localStorage，刷新不丢，提交成功后清除草稿。
- 必填与选填要标注清楚；禁用状态的按钮要说明为什么不能点。`,

  creative: `【创作/编辑器类应用要点】
- 画布区最大化，工具栏收在一侧或顶部；窄屏时工具栏折叠为一行。
- 直接操作优先：拖拽、绘制、滑块调参，参数变化实时反映到画布。
- 撤销/重做至少保留 20 步，绑定 Ctrl/Cmd+Z 与 Shift+Ctrl/Cmd+Z。
- 导出用 canvas.toDataURL 或序列化 SVG，把结果显示在页面里供复制（沙箱会拦截页面自身发起的下载）。
- 提供"随机"或"示例"按钮，一键得到一个好看的初始状态。
- 每个参数都要有合理默认值与范围限制，极端值不能让画面崩掉。
- 作品状态写 localStorage，刷新后还在。`,

  general: `【通用要点】
- 先确定这个应用最核心的一个动作，把它放在最显眼的位置，其余功能围绕它排布。
- 不要平铺一堆按钮：分组、给标题、按使用顺序排列。
- 状态要明确：初始态、进行中、完成态各有对应界面与文案。
- 用户产生的数据写 localStorage，刷新不丢。
- 宁可少做功能，也要把做了的部分做完整、做好看——半成品的功能不如不做。
- 如果需求本身很含糊，就选一个具体、合理的解释把它做实，并在界面上说明这个应用能做什么。`,
};

export function renderStudioCoderSystem(appKind: StudioAppKind): string {
  return `${STUDIO_CODER_CONTRACT}\n\n${STUDIO_APP_KIND_GUIDE[appKind]}`;
}

export const STUDIO_PLANNER_SYSTEM = `你是产品规划员，把用户一句话的需求变成一份可执行的单页应用方案。
你的方案会直接交给编码员实现，所以每一条都要具体、可实现、可验收。
应用最终是一份自包含的单文件 HTML：没有后端、没有网络请求、没有第三方库，数据只能来自用户输入、内置常量或 localStorage。
方案要落在这个边界内：不要规划登录、支付、实时协作、外部数据源这类做不到的功能，而是给出在单文件里能真正跑起来的等价形态。

字段说明：summary 描述这个应用整体是什么；changeNote 只描述**这一轮对应用做了什么**（首次生成就写做了一个什么应用，修改轮就写改了哪里）。
changeNote 会作为回复直接展示给用户，所以它只能谈应用本身，绝不能提到模型、JSON、格式、schema、重试或你自己的输出过程。`;

function renderPlan(plan: StudioPlan): string {
  return [
    `应用名称：${plan.appName}`,
    `类型：${plan.appKind}`,
    `一句话说明：${plan.summary}`,
    `本轮改动：${plan.changeNote}`,
    `功能清单：\n${plan.features.map((feature, index) => `  ${index + 1}. ${feature}`).join('\n')}`,
    `布局：${plan.layout}`,
    `交互：${plan.interactions.map((item) => `- ${item}`).join('\n')}`,
    `数据留存：${plan.persistence === 'local-storage' ? '需要写 localStorage，刷新不丢' : '不需要留存'}`,
  ].join('\n');
}

export function renderStudioPlannerPrompt(input: {
  request: string;
  current?: { plan: StudioPlan; summary: string };
}): string {
  const kinds = `appKind 从这几类里选最接近的一个：tool（工具）、game（游戏）、dashboard（看板）、content（内容阅读）、form（表单流程）、creative（创作编辑器）、general（其它）。
如果都不太像，就选 general —— 分类只决定实现风格，任何需求都必须给出方案，不存在"做不了"的选项。`;
  if (input.current) {
    return `这是一个已经存在的应用，用户提出了新的修改要求。请给出修改之后的完整方案。

【当前应用】
${renderPlan(input.current.plan)}
当前版本说明：${input.current.summary}

【用户这次的要求】
${input.request}

请输出修改后的完整方案：保留用户没有要求改动的部分，把新要求合并进功能清单。
${kinds}`;
  }
  return `用户的需求：
${input.request}

请把它变成一份单页应用方案：功能清单只列这一版真正要实现的 3–6 条，每条都是可验收的具体行为（例如"点击开始后倒计时每秒更新"，而不是"体验流畅"）。
${kinds}`;
}

function renderRuntimeErrors(errors: StudioRuntimeError[] | undefined): string {
  if (!errors || errors.length === 0) return '';
  const lines = errors.slice(0, 8).map((error) => `- [${error.errorKind}] ${error.message}`);
  return `\n【上一版在浏览器里真实报出的错误——必须修掉】\n${lines.join('\n')}\n`;
}

function renderFindings(findings: StudioReview['findings'] | undefined): string {
  if (!findings || findings.length === 0) return '';
  const lines = findings.map(
    (finding) => `- [${finding.severity}/${finding.area}] ${finding.detail}`,
  );
  return `\n【审查员指出的问题——这一轮必须逐条解决】\n${lines.join('\n')}\n`;
}

export function renderStudioCreatePrompt(input: {
  request: string;
  plan: StudioPlan;
  findings?: StudioReview['findings'];
}): string {
  return `用户的需求：
${input.request}

【要实现的方案】
${renderPlan(input.plan)}
${renderFindings(input.findings)}
请实现这个应用。功能清单里的每一条都要真正可用——不是画一个按钮占位，而是点下去有正确的行为。
现在输出完整的 HTML 文档。`;
}

const EDIT_BLOCK_INSTRUCTION = `【修改方式：只输出编辑块，不要重发整份文件】
每一处改动写成一个编辑块，格式严格为：
${STUDIO_EDIT_BLOCK_FORMAT}

规则：
- SEARCH 段必须从上面的当前 HTML 里逐字复制（含空格、缩进、换行），并且在整份文件里只出现一次；不唯一就向上下多复制几行。
- 只改与这次要求相关的位置，无关的代码、样式和文案一个字都不要动。
- 多处改动就写多个编辑块，各块覆盖的区域不能重叠。
- 新增功能时，样式沿用文件里已有的 CSS 变量与类名，保持视觉一致。
- 除编辑块外不要输出任何其它文字。`;

export function renderStudioPatchPrompt(input: {
  request: string;
  plan: StudioPlan;
  html: string;
  findings?: StudioReview['findings'];
  runtimeErrors?: StudioRuntimeError[];
}): string {
  return `用户要修改一个已经在运行的应用。

【用户这次的要求】
${input.request}

【修改后应达到的方案】
${renderPlan(input.plan)}
${renderFindings(input.findings)}${renderRuntimeErrors(input.runtimeErrors)}
【当前 HTML 全文】
${input.html}

${EDIT_BLOCK_INSTRUCTION}`;
}

export function renderStudioRewritePrompt(input: {
  request: string;
  plan: StudioPlan;
  html: string;
  findings?: StudioReview['findings'];
  runtimeErrors?: StudioRuntimeError[];
}): string {
  return `用户要修改一个已经在运行的应用，这一轮请直接输出修改后的完整 HTML 文档。

【用户这次的要求】
${input.request}

【修改后应达到的方案】
${renderPlan(input.plan)}
${renderFindings(input.findings)}${renderRuntimeErrors(input.runtimeErrors)}
【当前 HTML 全文】
${input.html}

要求：在当前版本的基础上改，保留所有已经能用的功能、文案和视觉风格，只按用户的要求增删对应部分。
现在输出修改后的完整 HTML 文档（从 <!doctype html> 到 </html>）。`;
}

export const STUDIO_REVIEWER_SYSTEM = `你是严格但务实的验收员。你要判断这份网页应用能不能交付给用户。
只看四件事：
1. 功能落实——方案功能清单里的每一条，代码里是否真的实现了对应逻辑（不是只有按钮或占位文案）。
2. 运行风险——是否存在会让页面白屏或报错的明显问题：引用未定义的变量/元素、事件绑定在不存在的节点上、JSON.parse 没有兜底、无限循环。
3. 交互完整——空态、非法输入、边界值是否有处理；键盘是否可用。
4. 视觉一致——是否遵守了色板变量、间距刻度与交互三态，窄屏是否可用。
verdict 只有两个取值：pass 表示可以交付；revise 表示存在必须修的问题。
不要因为"还可以更好"就给 revise —— 只有真正影响可用性的问题才算。发现问题时，findings 要具体到位置和改法，让编码员照着改就能修好。`;

export function renderStudioReviewerPrompt(input: {
  request: string;
  plan: StudioPlan;
  html: string;
  validation: StudioValidationReport;
}): string {
  return `【用户的原始需求】
${input.request}

【应实现的方案】
${renderPlan(input.plan)}

【静态校验结果】
${input.validation.summary}

【待验收的 HTML 全文】
${input.html}

请逐条核对功能清单，然后给出 verdict（pass 或 revise）与 findings。`;
}
