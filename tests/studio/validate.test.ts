import { describe, expect, it } from 'vitest';

import { STUDIO_HTML_MAX_BYTES, validateStudioHtml } from '@/lib/studio/validate';

const page = (body: string, head = '<title>示例</title>') =>
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

const codes = (html: string) => ({
  errors: validateStudioHtml(html).errors.map((issue) => issue.code),
  warnings: validateStudioHtml(html).warnings.map((issue) => issue.code),
});

describe('validateStudioHtml', () => {
  it('accepts a self-contained document', () => {
    const report = validateStudioHtml(page('<h1>你好</h1><button>开始</button>'));
    expect(report.errors).toEqual([]);
    expect(report.sizeBytes).toBeGreaterThan(0);
  });

  it('rejects text that is not an HTML document', () => {
    expect(codes('好的，这是你要的应用：').errors).toContain('HTML_NOT_A_DOCUMENT');
  });

  it('rejects a document with an empty body', () => {
    expect(codes(page('   \n  ')).errors).toContain('HTML_EMPTY_BODY');
  });

  it('rejects external script and stylesheet references', () => {
    expect(
      codes(page('<h1>a</h1><script src="https://cdn.example.com/x.js"></script>')).errors,
    ).toContain('HTML_EXTERNAL_RESOURCE');
    expect(
      codes(page('<h1>a</h1>', '<link rel="stylesheet" href="//fonts.example.com/x.css">')).errors,
    ).toContain('HTML_EXTERNAL_RESOURCE');
  });

  it('rejects remote images and protocol-relative sources', () => {
    expect(codes(page('<img src="http://example.com/a.png" alt="a">')).errors).toContain(
      'HTML_EXTERNAL_RESOURCE',
    );
  });

  it('names the offending url so the coder can remove it', () => {
    const report = validateStudioHtml(page('<img src="https://example.com/a.png" alt="a">'));
    expect(report.errors[0]!.message).toContain('https://example.com/a.png');
  });

  it('allows data uris, in-page anchors and inline svg', () => {
    const report = validateStudioHtml(
      page(
        '<a href="#main">跳过</a><img src="data:image/svg+xml,%3Csvg/%3E" alt="a"><svg viewBox="0 0 1 1"></svg>',
      ),
    );
    expect(report.errors).toEqual([]);
  });

  it('allows an external link in an anchor because it does not load a resource', () => {
    expect(codes(page('<a href="https://example.com" target="_blank">说明</a>')).errors).toEqual(
      [],
    );
  });

  it('rejects a document larger than the hard cap', () => {
    const huge = page(`<p>${'字'.repeat(STUDIO_HTML_MAX_BYTES)}</p>`);
    expect(codes(huge).errors).toContain('HTML_TOO_LARGE');
  });

  it('warns about sandbox-blocked modal dialogs instead of failing', () => {
    const report = validateStudioHtml(page('<script>alert("hi")</script><h1>a</h1>'));
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((issue) => issue.code)).toContain('HTML_MODAL_DIALOG');
  });

  it('warns about a missing title and about oversized output', () => {
    const report = validateStudioHtml(page('<h1>a</h1>', ''));
    expect(report.warnings.map((issue) => issue.code)).toContain('HTML_NO_TITLE');
  });

  it('summarizes the report as prompt-ready lines for the reviewer', () => {
    const report = validateStudioHtml(page('<script>confirm("x")</script><h1>a</h1>'));
    expect(report.summary).toContain('HTML_MODAL_DIALOG');
  });

  it('reports a clean document as an explicit pass line', () => {
    expect(validateStudioHtml(page('<h1>a</h1>')).summary).toContain('通过');
  });
});

describe('narration in education mode', () => {
  it('reports a page a child cannot hear', () => {
    const report = validateStudioHtml(page('<h1>月亮</h1>'), { education: true });
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((issue) => issue.code)).toContain('HTML_NO_NARRATION');
  });

  it('stays quiet when the page speaks', () => {
    const report = validateStudioHtml(
      page('<h1>月亮</h1><script>curiositySay("先猜猜看");</script>'),
      { education: true },
    );
    expect(report.warnings.map((issue) => issue.code)).not.toContain('HTML_NO_NARRATION');
  });

  it('accepts a page that wraps the contract in its own helper', () => {
    const report = validateStudioHtml(
      page(
        '<h1>毛毛虫</h1><script>function say(t){window.curiositySay(t);} say("好好吃呀");</script>',
      ),
      { education: true },
    );
    expect(report.warnings.map((issue) => issue.code)).not.toContain('HTML_NO_NARRATION');
  });

  it('does not ask a general app to talk', () => {
    const report = validateStudioHtml(page('<h1>番茄钟</h1>'));
    expect(report.warnings.map((issue) => issue.code)).not.toContain('HTML_NO_NARRATION');
  });
});
