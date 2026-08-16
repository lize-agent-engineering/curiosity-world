import { patchHtmlForIframe } from '@/lib/utils/iframe';
import { curiosityExperienceSpecSchema, type CuriosityExperienceSpecV1 } from './contracts';
import { validateKnowledgeBoundaries } from './knowledge';
export { compileCuriosityExperienceV2 } from './compiler/plugins';

export interface CompiledCuriosityExperience {
  html: string;
  specHash: string;
}

function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function compileCuriosityExperience(
  input: CuriosityExperienceSpecV1,
): CompiledCuriosityExperience {
  const spec = curiosityExperienceSpecSchema.parse(input);
  validateKnowledgeBoundaries(spec);
  const serialized = scriptSafeJson(spec);
  const specHash = `cw1-${fnv1a(JSON.stringify(spec))}`;
  const explorationTask = spec.tasks.find((task) => task.kind === 'exploration');
  if (!explorationTask || explorationTask.kind !== 'exploration') {
    throw new Error('RUNTIME_TASKS_INCOMPLETE');
  }
  const explorationVariable = explorationTask.variable;
  const scene = {
    'relative-motion': {
      label: '远近物体视角变化实验',
      primary: '月亮',
      secondary: '远山',
      tertiary: '近处路灯',
      actor: '观察者',
      control: '左右移动小朋友',
    },
    'balance-support': {
      label: '支点与重心平衡实验',
      primary: '桥面',
      secondary: '支点',
      tertiary: '积木',
      actor: '重心标记',
      control: '左右移动支点',
    },
    'light-path': {
      label: '光源与影子路径实验',
      primary: '光源',
      secondary: '遮挡物',
      tertiary: '影子',
      actor: '观察屏',
      control: '左右移动光源',
    },
    open: {
      label: '变量与关系观察实验',
      primary: '观察对象',
      secondary: '变量一',
      tertiary: '变量二',
      actor: '小小观察员',
      control: '改变一个变量并比较',
    },
  }[spec.knowledge.family];

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:" />
  <title>Curiosity World</title>
  <style>
    :root { color-scheme: dark; font-family: ui-rounded, "PingFang SC", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { background: #07152f; color: #f8fbff; }
    button, input { font: inherit; }
    button { min-width: 44px; min-height: 44px; cursor: pointer; }
    .world { min-height: 100%; padding: 24px; background: radial-gradient(circle at 70% 0%, #244b88 0, #0d2348 34%, #07152f 72%); }
    .shell { width: min(960px, 100%); margin: 0 auto; }
    .eyebrow { margin: 0 0 8px; color: #9cd7ff; font-weight: 800; letter-spacing: .12em; }
    h1 { margin: 0; font-size: clamp(30px, 6vw, 58px); line-height: 1.02; }
    .hook { max-width: 720px; margin: 16px 0 22px; color: #d8e9ff; font-size: 18px; line-height: 1.7; }
    .sky { position: relative; height: 300px; overflow: hidden; border: 1px solid #ffffff24; border-radius: 28px; background: linear-gradient(#112e64, #18427b 62%, #1d3c42 63%, #0b221d); box-shadow: 0 30px 80px #0008; }
    .moon { position: absolute; top: 34px; right: 18%; width: 72px; height: 72px; border-radius: 50%; background: #fff4bc; box-shadow: 0 0 38px #fff0a8aa; transition: transform .08s linear; }
    .mountain { position: absolute; left: 25%; bottom: 62px; width: 320px; height: 120px; background: #173b45; clip-path: polygon(0 100%, 36% 14%, 58% 64%, 75% 35%, 100% 100%); transition: transform .08s linear; }
    .lamp { position: absolute; left: 18%; bottom: 18px; width: 14px; height: 150px; border-radius: 10px; background: #172335; transition: transform .08s linear; }
    .lamp::before { content: ''; position: absolute; left: -23px; top: -9px; width: 60px; height: 34px; border-radius: 50%; background: #ffd867; box-shadow: 0 0 28px #ffd867bb; }
    .observer { position: absolute; left: 50%; bottom: 12px; width: 30px; height: 54px; border-radius: 16px 16px 10px 10px; background: #ff8c6b; transform: translateX(-50%); }
    .observer::before { content: ''; position: absolute; left: 4px; top: -20px; width: 22px; height: 22px; border-radius: 50%; background: #ffd2ad; }
    [data-knowledge-family="balance-support"] .sky { background: linear-gradient(#8bd5ff 0 64%, #7a5332 65%); }
    [data-knowledge-family="balance-support"] .moon { top: 135px; right: 18%; width: 64%; height: 24px; border-radius: 8px; background: #f0b35d; box-shadow: none; }
    [data-knowledge-family="balance-support"] .mountain { left: 45%; bottom: 40px; width: 120px; height: 110px; background: #ffdc7c; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
    [data-knowledge-family="balance-support"] .lamp { left: 26%; bottom: 126px; width: 72px; height: 56px; background: #5379d8; }
    [data-knowledge-family="balance-support"] .lamp::before { display: none; }
    [data-knowledge-family="balance-support"] .observer { bottom: 138px; width: 30px; height: 30px; border-radius: 50%; background: #ff6f61; }
    [data-knowledge-family="balance-support"] .observer::before { display: none; }
    [data-knowledge-family="light-path"] .sky { background: linear-gradient(90deg, #162542, #07101f); }
    [data-knowledge-family="light-path"] .moon { top: 105px; left: 12%; right: auto; background: #fff2a8; }
    [data-knowledge-family="light-path"] .mountain { left: 50%; bottom: 50px; width: 38px; height: 170px; background: #22334f; clip-path: none; }
    [data-knowledge-family="light-path"] .lamp { left: 66%; bottom: 34px; width: 25%; height: 190px; background: #02050c; transform: skewX(-10deg); }
    [data-knowledge-family="light-path"] .lamp::before { display: none; }
    [data-knowledge-family="light-path"] .observer { left: 92%; bottom: 30px; width: 12px; height: 220px; border-radius: 2px; background: #d9ecff; }
    [data-knowledge-family="light-path"] .observer::before { display: none; }
    .control { margin: 16px 4px 0; }
    input[type=range] { width: 100%; accent-color: #ffce5c; }
    .task-stack { margin-top: 18px; }
    [hidden] { display: none !important; }
    .card { padding: 18px; border: 1px solid #ffffff20; border-radius: 20px; background: #ffffff0d; backdrop-filter: blur(12px); }
    .card h2 { margin: 0 0 8px; font-size: 18px; }
    .card p { margin: 0 0 12px; color: #d6e5f8; line-height: 1.55; }
    .options { display: flex; flex-wrap: wrap; gap: 8px; }
    .option { padding: 10px 14px; border: 1px solid #9bd7ff55; border-radius: 999px; color: #eef8ff; background: #0c2b58; }
    .option:hover, .option.selected { border-color: #ffda76; background: #6b4c0d; }
    .status { min-height: 24px; margin-top: 10px; color: #ffdd82; font-weight: 700; }
    .finish { width: 100%; margin-top: 18px; padding: 15px 20px; border: 0; border-radius: 16px; color: #08203a; background: #ffda76; font-weight: 900; }
    .finish:disabled { cursor: not-allowed; opacity: .38; }
    .completion { display: none; margin-top: 18px; padding: 22px; border-radius: 20px; color: #09203a; background: #d9f5ff; font-size: 18px; font-weight: 800; }
    @media (max-width: 700px) { .world { padding: 16px; } .sky { height: 260px; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .001ms !important; animation-duration: .001ms !important; } }
  </style>
</head>
<body>
  <main class="world" data-curiosity-runtime="1.0" data-knowledge-family="${spec.knowledge.family}">
    <div class="shell">
      <p class="eyebrow">WHY WORLD · 观察实验</p>
      <h1 id="title"></h1>
      <p id="hook" class="hook"></p>
      <div class="task-stack">
        <section id="prediction-stage" class="card"><h2>先预测</h2><p id="prediction-prompt"></p><div id="prediction-options" class="options"></div><div id="prediction-status" class="status"></div></section>
        <section id="exploration-stage" class="card" hidden>
          <h2>动手观察</h2>
          <p id="explore-prompt"></p>
          <div class="sky" aria-label="${scene.label}">
            <div id="moon" class="moon" aria-label="${scene.primary}"></div>
            <div id="mountain" class="mountain" aria-label="${scene.secondary}"></div>
            <div id="lamp" class="lamp" aria-label="${scene.tertiary}"></div>
            <div id="observer" class="observer" aria-label="${scene.actor}"></div>
          </div>
          <div class="control"><label for="${explorationVariable}">${scene.control}</label><input id="${explorationVariable}" type="range" min="-100" max="100" value="0" /></div>
          <div id="distance-control" class="control" hidden><label for="object-distance">把物体放近或放远</label><input id="object-distance" type="range" min="20" max="400" value="200" /></div>
          <div id="movement-status" class="status">还没有改变实验变量</div>
        </section>
        <section id="challenge-stage" class="card" hidden><h2>换个情境</h2><p id="challenge-prompt"></p><div id="challenge-options" class="options"></div><div id="challenge-status" class="status"></div></section>
        <section id="explanation-stage" class="card" hidden><h2>说给别人听</h2><p id="explanation-prompt"></p><div id="explanation-options" class="options"></div><div id="explanation-status" class="status"></div></section>
      </div>
      <button id="finish" class="finish" hidden>完成这次探索</button>
      <div id="completion" class="completion"></div>
    </div>
  </main>
  <script data-curiosity-runtime>
  (() => {
    'use strict';
    const spec = ${serialized};
    const state = { seq: 0, started: false, moved: false, hostControlled: false, observerPosition: 0, objectDistance: 200, challengeComplete: false, explanationSelected: false };
    const byKind = Object.fromEntries(spec.tasks.map((task) => [task.kind, task]));
    const node = (id) => document.getElementById(id);
    const post = (message) => window.parent.postMessage(message, '*');
    const postReady = () => post({ source: 'curiosity-world', protocolVersion: '1.0', kind: 'experience_ready', experienceId: spec.experienceId, versionId: spec.versionId });
    window.addEventListener('message', (event) => {
      const message = event && event.data;
      if (message && message.source === 'curiosity-host' && message.kind === 'request_ready') postReady();
    });
    const emit = (type, taskId, action, payload = {}) => {
      state.seq += 1;
      post({
        source: 'curiosity-world', protocolVersion: '1.0',
        eventId: 'evt_' + spec.versionId + '_' + Date.now() + '_' + state.seq,
        experienceId: spec.experienceId, versionId: spec.versionId,
        type, taskId, action, occurredAt: new Date().toISOString(), payload
      });
    };
    const ensureStarted = () => {
      if (state.started) return;
      state.started = true;
      emit('experiment_started', 'prediction', 'started');
    };
    const optionButtons = (containerId, task, onSelect) => {
      const container = node(containerId);
      task.options.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'option';
        button.textContent = option.label;
        button.addEventListener('click', () => {
          ensureStarted();
          container.querySelectorAll('button').forEach((item) => item.classList.remove('selected'));
          button.classList.add('selected');
          onSelect(option);
        });
        container.appendChild(button);
      });
    };
    const updateFinish = () => { node('finish').disabled = !(state.moved && state.challengeComplete && state.explanationSelected); };
    const showStage = (id) => {
      ['prediction-stage', 'exploration-stage', 'challenge-stage', 'explanation-stage'].forEach((stageId) => { node(stageId).hidden = stageId !== id; });
    };
    const hostStageKinds = { prediction: 'prediction-stage', exploration: 'exploration-stage', 'guided-discovery': 'exploration-stage', transfer: 'challenge-stage', explanation: 'explanation-stage' };
    window.addEventListener('message', (event) => {
      const message = event && event.data;
      if (message && message.source === 'curiosity-host' && message.kind === 'set_stage') {
        state.hostControlled = true;
        if (message.stageKind === 'transfer' || message.stageKind === 'explanation') state.moved = true;
        if (message.stageKind === 'explanation') state.challengeComplete = true;
        const target = hostStageKinds[message.stageKind];
        if (target) showStage(target);
        updateFinish();
      }
    });

    node('title').textContent = spec.presentation.title;
    node('hook').textContent = spec.presentation.hook;
    node('explore-prompt').textContent = spec.presentation.explorePrompt;
    node('prediction-prompt').textContent = byKind.prediction.prompt;
    node('challenge-prompt').textContent = spec.presentation.challengePrompt;
    node('explanation-prompt').textContent = byKind.explanation.prompt;
    node('completion').textContent = spec.presentation.completion;
    if (spec.knowledge.family === 'relative-motion') node('distance-control').hidden = false;

    optionButtons('prediction-options', byKind.prediction, (option) => {
      emit('prediction_submitted', 'prediction', 'option_selected', { optionId: option.id });
      node('prediction-status').textContent = option.id === byKind.prediction.expectedOptionId ? '记住你的预测，去实验里验证吧！' : '好预测，移动观察者看看会发生什么。';
      showStage('exploration-stage');
    });
    optionButtons('challenge-options', byKind.challenge, (option) => {
      emit('challenge_attempted', 'challenge', 'option_selected', { optionId: option.id });
      if (option.id === byKind.challenge.expectedOptionId) {
        state.challengeComplete = true;
        emit('challenge_completed', 'challenge', 'completed', { optionId: option.id });
        node('challenge-status').textContent = '发现了：这个选择和刚才的实验现象一致。';
        showStage('explanation-stage');
      } else {
        node('challenge-status').textContent = '再移动一次观察者，然后重新比较。';
      }
      updateFinish();
    });
    optionButtons('explanation-options', byKind.explanation, (option) => {
      state.explanationSelected = true;
      emit('explanation_selected', 'explanation', 'option_selected', { optionId: option.id });
      node('explanation-status').textContent = option.id === byKind.explanation.expectedOptionId ? '这个解释和实验现象一致。' : '再改变一次变量，比较前后的现象吧。';
      node('finish').hidden = false;
      updateFinish();
    });

    node('${explorationVariable}').addEventListener('input', (event) => {
      ensureStarted();
      const value = Number(event.target.value);
      if (spec.knowledge.family === 'relative-motion') {
        state.observerPosition = value;
        node('observer').style.left = (50 + value * .34) + '%';
        node('lamp').style.transform = 'translateX(' + (-value * .7) + 'px)';
        node('mountain').style.transform = 'translateX(' + (-value * .1) + 'px)';
        node('moon').style.transform = 'translateX(' + (-value * (8 / state.objectDistance)) + 'px)';
      } else if (spec.knowledge.family === 'balance-support') {
        node('mountain').style.transform = 'translateX(' + (value * 1.4) + 'px)';
      } else {
        node('moon').style.transform = 'translateX(' + (value * 1.2) + 'px)';
        node('lamp').style.width = (25 + Math.abs(value) * .25) + '%';
      }
      state.moved = true;
      node('movement-status').textContent = '已把变量移动到 ' + value + '，继续比较前后的现象';
      emit('variable_changed', 'exploration', 'variable_moved', { variableId: '${explorationVariable}', value });
      if (!state.hostControlled) showStage('challenge-stage');
      updateFinish();
    });

    node('object-distance').addEventListener('input', (event) => {
      ensureStarted();
      const value = Number(event.target.value);
      state.objectDistance = value;
      node('moon').style.transform = 'translateX(' + (-state.observerPosition * (8 / value)) + 'px)';
      node('movement-status').textContent = value >= 300 ? '放得越远，看起来移动得越少' : '继续把物体放远，再比较一次';
      emit('variable_changed', 'guided-discovery', 'distance_changed', { variableId: 'object-distance', value });
      if (!state.hostControlled) showStage('challenge-stage');
      updateFinish();
    });

    node('finish').addEventListener('click', () => {
      emit('experience_completed', 'completion', 'finished');
      node('completion').style.display = 'block';
      node('finish').disabled = true;
    });

    postReady();
  })();
  </script>
</body>
</html>`;

  return { html: patchHtmlForIframe(html), specHash };
}
