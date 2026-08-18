import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { StudioEditDiff } from '@/components/studio/generation-card';
import { StudioHomeView } from '@/components/studio/home-view';
import { StudioWorkbench, type StudioWorkbenchProps } from '@/components/studio/workbench';
import type { StudioJobView, StudioProjectView, StudioTurn } from '@/lib/studio/client';

const at = '2026-08-18T10:00:00.000Z';

const version = (overrides: Partial<StudioProjectView['versions'][number]> = {}) => ({
  id: 'ver_one',
  projectId: 'prj_one',
  parentVersionId: null,
  revision: 1,
  summary: '第一版番茄钟',
  appKind: 'tool' as const,
  editMode: 'create' as const,
  jobId: 'job_one',
  runtimeErrors: [],
  createdAt: at,
  htmlBytes: 1400,
  ...overrides,
});

const view: StudioProjectView = {
  project: {
    id: 'prj_one',
    title: '番茄钟',
    mode: 'general' as const,
    createdAt: at,
    updatedAt: at,
    currentVersionId: 'ver_one',
    storeVersion: 3,
  },
  messages: [],
  versions: [version()],
};

const job = (overrides: Partial<StudioJobView> = {}): StudioJobView => ({
  id: 'job_one',
  projectId: 'prj_one',
  status: 'running',
  stage: 'coding',
  message: '正在编写代码',
  codeChunk: '',
  codeLength: 20,
  progress: 45,
  done: false,
  ...overrides,
});

function render(overrides: Partial<StudioWorkbenchProps> = {}) {
  const props: StudioWorkbenchProps = {
    view,
    turns: [],
    draft: '',
    busy: false,
    error: null,
    selectedVersionId: 'ver_one',
    html: '<!doctype html><html><body><h1>番茄钟</h1></body></html>',
    htmlLoading: false,
    runtimeErrors: [],
    onDraftChange: vi.fn(),
    onSubmit: vi.fn(),
    onSelectVersion: vi.fn(),
    onRollback: vi.fn(),
    onRetry: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(<StudioWorkbench {...props} />);
}

const turn = (overrides: Partial<StudioTurn> = {}): StudioTurn => ({
  id: 'msg_one',
  request: '做一个番茄钟',
  createdAt: at,
  jobId: 'job_one',
  ...overrides,
});

describe('the workbench', () => {
  it('names the project and how many versions it has', () => {
    const html = render();
    expect(html).toContain('番茄钟');
    expect(html).toContain('1 个版本');
  });

  it('shows the request and the agent reply for a finished turn', () => {
    const html = render({ turns: [turn({ reply: '生成了番茄钟。', versionId: 'ver_one' })] });
    expect(html).toContain('做一个番茄钟');
    expect(html).toContain('生成了番茄钟。');
  });

  it('names each generation stage instead of showing a bare spinner', () => {
    const html = render({ turns: [turn({ job: job(), code: '<!doctype html>' })] });
    expect(html).toContain('规划');
    expect(html).toContain('编码');
    expect(html).toContain('审查');
    expect(html).toContain('正在编写代码');
  });

  it('streams the code out while the coder writes it', () => {
    const html = render({ turns: [turn({ job: job(), code: '<!doctype html><h1>番' })] });
    expect(html).toContain('正在写入代码');
    expect(html).toContain('&lt;!doctype html&gt;&lt;h1&gt;番');
  });

  it('exposes the planner artifact as an expandable intermediate product', () => {
    const html = render({
      turns: [
        turn({
          job: job(),
          code: 'x',
          artifacts: {
            plan: {
              appName: '番茄钟',
              appKind: 'tool',
              summary: '一个专注计时器。',
              changeNote: '首次生成。',
              features: ['25 分钟倒计时'],
              layout: '居中单栏，计时器在上。',
              interactions: ['点击开始'],
              persistence: 'local-storage',
            },
          },
        }),
      ],
    });
    expect(html).toContain('planner');
  });

  it('still shows how a past round was made after a reload, with no job in flight', () => {
    const html = render({
      turns: [
        turn({
          reply: '加了今日完成计数。',
          versionId: 'ver_one',
          artifacts: {
            editMode: 'patch',
            review: {
              verdict: 'pass',
              findings: [],
            },
          },
        }),
      ],
    });
    expect(html).toContain('定点修改');
    expect(html).toContain('审查结论');
  });

  it('explains a fallback rewrite rather than hiding it', () => {
    const html = render({
      turns: [
        turn({
          reply: '换了配色。',
          job: job({ status: 'succeeded', stage: 'done', done: true }),
          code: 'x',
          artifacts: { editMode: 'rewrite', editBlockFailures: ['EDIT_BLOCK_NOT_FOUND'] },
        }),
      ],
    });
    expect(html).toContain('整页重写');
  });

  it('offers the applied edits as an expandable product of the round', () => {
    const html = render({
      turns: [
        turn({
          reply: '改了标题。',
          artifacts: {
            editMode: 'patch',
            editBlocks: [{ search: '<h1>番茄钟</h1>', replace: '<h1>专注钟</h1>' }],
          },
        }),
      ],
    });
    expect(html).toContain('修改方式：定点修改');
  });

  it('offers a retry with the same request when a round fails', () => {
    const html = render({
      turns: [
        turn({
          job: job({
            status: 'failed',
            stage: 'failed',
            done: true,
            message: '静态校验没通过',
            errorCode: 'CODE_INVALID',
          }),
        }),
      ],
      onRetry: vi.fn(),
    });
    expect(html).toContain('这一轮没有生成成功');
    expect(html).toContain('CODE_INVALID');
    expect(html).toContain('再试一次');
  });

  it('previews the app in a sandbox that never gets same-origin access', () => {
    const html = render();
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain('allow-same-origin');
  });

  it('injects the error-capture and storage shims into the previewed document', () => {
    const html = render();
    expect(html).toContain('data-iframe-error-shim');
    expect(html).toContain('data-iframe-storage-shim');
  });

  it('lists versions with their revision and how they were made', () => {
    const html = render({
      view: {
        ...view,
        versions: [
          version(),
          version({ id: 'ver_two', revision: 2, editMode: 'patch', parentVersionId: 'ver_one' }),
        ],
      },
    });
    expect(html).toContain('v2 · 补丁');
    expect(html).toContain('v1 · 全新');
  });

  it('offers a rollback only when looking at a version that is not current', () => {
    expect(render({ selectedVersionId: 'ver_one' })).not.toContain('回到这一版');
    const html = render({
      view: {
        ...view,
        versions: [version(), version({ id: 'ver_two', revision: 2 })],
        project: { ...view.project, currentVersionId: 'ver_two' },
      },
      selectedVersionId: 'ver_one',
    });
    expect(html).toContain('回到这一版');
  });

  it('raises a badge when the previewed page reported runtime errors', () => {
    const html = render({
      runtimeErrors: [{ errorKind: 'error', message: 'timer is not defined', occurredAt: at }],
    });
    expect(html).toContain('运行报错 1');
  });

  it('tells the user what will happen before the first version exists', () => {
    const html = render({ view: { ...view, versions: [] }, selectedVersionId: null, html: null });
    expect(html).toContain('第一版生成完成后');
  });

  it('keeps the follow-up input available as the way to modify the app', () => {
    const html = render();
    expect(html).toContain('继续说要改什么');
  });
});

describe('the edit diff', () => {
  it('renders each applied block as removed and added lines', () => {
    const html = renderToStaticMarkup(
      <StudioEditDiff blocks={[{ search: '<h1>番茄钟</h1>', replace: '<h1>专注钟</h1>' }]} />,
    );
    expect(html).toContain('- &lt;h1&gt;番茄钟&lt;/h1&gt;');
    expect(html).toContain('+ &lt;h1&gt;专注钟&lt;/h1&gt;');
  });

  it('prefixes every line of a multi-line block', () => {
    const html = renderToStaticMarkup(
      <StudioEditDiff blocks={[{ search: 'a\nb', replace: 'c\nd' }]} />,
    );
    expect(html).toContain('- a\n- b');
    expect(html).toContain('+ c\n+ d');
  });

  it('labels an emptied replacement as a deletion instead of a blank pane', () => {
    const html = renderToStaticMarkup(
      <StudioEditDiff blocks={[{ search: '<p>x</p>', replace: '' }]} />,
    );
    expect(html).toContain('（删除）');
  });

  it('renders every block, not just the first', () => {
    const html = renderToStaticMarkup(
      <StudioEditDiff
        blocks={[
          { search: 'one', replace: 'ONE' },
          { search: 'two', replace: 'TWO' },
        ]}
      />,
    );
    expect(html).toContain('- one');
    expect(html).toContain('- two');
  });
});

describe('the studio home', () => {
  const homeProps = {
    mode: 'education' as const,
    draft: '',
    targetAge: 8,
    busy: false,
    error: null,
    projects: [],
    onModeChange: vi.fn(),
    onDraftChange: vi.fn(),
    onTargetAgeChange: vi.fn(),
    onSubmit: vi.fn(),
    onOpenProject: vi.fn(),
  };

  it('leads with the child question, not with an app description', () => {
    const html = renderToStaticMarkup(<StudioHomeView {...homeProps} />);
    expect(html).toContain('把孩子的每一个“为什么”');
    expect(html).toContain('孩子在好奇什么？');
    expect(html).toContain('孩子年龄');
    expect(html).toContain('开始这次探索');
  });

  it('offers example questions from many domains, not just the three old families', () => {
    const html = renderToStaticMarkup(<StudioHomeView {...homeProps} />);
    expect(html).toContain('毛毛虫为什么会变成蝴蝶？');
    expect(html).toContain('海水为什么是咸的？');
    expect(html).toContain('彩虹是从哪里来的？');
  });

  it('spells out the basic flow when nothing has been made yet', () => {
    const html = renderToStaticMarkup(<StudioHomeView {...homeProps} />);
    expect(html).toContain('三步走完一次');
  });

  it('frames the general generator as an extension, not as the product', () => {
    const html = renderToStaticMarkup(<StudioHomeView {...homeProps} />);
    expect(html).toContain('延展能力');
    expect(html).toContain('同一套智能体，也能生成任意网页应用');
  });

  it('switches the composer to app requests in general mode', () => {
    const html = renderToStaticMarkup(<StudioHomeView {...homeProps} mode="general" />);
    expect(html).toContain('描述你想要的应用');
    expect(html).toContain('开始生成');
    expect(html).not.toContain('孩子年龄');
  });

  it('labels an education project by the child age it was made for', () => {
    const html = renderToStaticMarkup(
      <StudioHomeView
        {...homeProps}
        projects={[
          {
            id: 'prj_one',
            title: '月亮为什么跟着我',
            mode: 'education',
            targetAge: 8,
            revision: 2,
            appKind: 'creative',
            summary: '比较远近物体的视角变化。',
            createdAt: at,
            updatedAt: at,
          },
        ]}
      />,
    );
    expect(html).toContain('8 岁');
    expect(html).toContain('月亮为什么跟着我');
  });
});

describe('taking the page away', () => {
  it('offers a download of the previewed version from the host page', () => {
    const html = render();
    expect(html).toContain('下载带走');
  });

  it('does not offer a download before there is anything to download', () => {
    expect(render({ html: null, selectedVersionId: null })).not.toContain('下载带走');
  });
});

describe('the workbench in education mode', () => {
  const educationView = {
    ...view,
    project: { ...view.project, mode: 'education' as const, targetAge: 8 },
  };

  it('speaks to a parent about the exploration, not to a builder about an app', () => {
    const html = render({ view: educationView });
    expect(html).toContain('为什么世界');
    expect(html).toContain('8 岁');
    expect(html).toContain('他只有 6 岁，再直观一点');
  });
});
