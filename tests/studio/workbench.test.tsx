import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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
