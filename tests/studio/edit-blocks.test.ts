import { describe, expect, it } from 'vitest';

import {
  applyStudioEditBlocks,
  parseStudioEditBlocks,
  StudioEditBlockError,
  STUDIO_EDIT_BLOCK_FORMAT,
} from '@/lib/studio/edit-blocks';

const block = (search: string, replace: string) =>
  `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;

const document = `<!doctype html>
<html lang="zh-CN">
  <head>
    <title>番茄钟</title>
  </head>
  <body>
    <h1>番茄钟</h1>
    <p id="count">0</p>
  </body>
</html>`;

function expectFailure(run: () => unknown, code: string) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(StudioEditBlockError);
    expect((error as StudioEditBlockError).code).toBe(code);
    return error as StudioEditBlockError;
  }
  throw new Error(`expected ${code} but the call succeeded`);
}

describe('parseStudioEditBlocks', () => {
  it('extracts blocks and ignores prose and code fences around them', () => {
    const raw = `我会把标题改掉。\n\n\`\`\`\n${block('<h1>番茄钟</h1>', '<h1>我的番茄钟</h1>')}\n\`\`\`\n还有计数。\n${block('<p id="count">0</p>', '<p id="count">今日 0 次</p>')}\n完成。`;
    expect(parseStudioEditBlocks(raw)).toEqual([
      { search: '<h1>番茄钟</h1>', replace: '<h1>我的番茄钟</h1>' },
      { search: '<p id="count">0</p>', replace: '<p id="count">今日 0 次</p>' },
    ]);
  });

  it('keeps multi-line search and replace bodies verbatim, including blank lines', () => {
    const raw = block('  <body>\n\n    <h1>a</h1>', '  <body>\n    <h1>b</h1>');
    expect(parseStudioEditBlocks(raw)).toEqual([
      { search: '  <body>\n\n    <h1>a</h1>', replace: '  <body>\n    <h1>b</h1>' },
    ]);
  });

  it('accepts an empty replace body as a deletion', () => {
    expect(parseStudioEditBlocks('<<<<<<< SEARCH\n<p>x</p>\n=======\n>>>>>>> REPLACE')).toEqual([
      { search: '<p>x</p>', replace: '' },
    ]);
  });

  it('normalizes CRLF so a Windows-style model response still matches', () => {
    const raw = block('<h1>番茄钟</h1>', '<h1>新</h1>').replaceAll('\n', '\r\n');
    expect(parseStudioEditBlocks(raw)).toEqual([
      { search: '<h1>番茄钟</h1>', replace: '<h1>新</h1>' },
    ]);
  });

  it('rejects output with no block at all and names the required format', () => {
    const error = expectFailure(
      () => parseStudioEditBlocks('我建议你把标题改成“我的番茄钟”。'),
      'EDIT_BLOCKS_EMPTY',
    );
    expect(error.message).toContain(STUDIO_EDIT_BLOCK_FORMAT);
  });

  it('rejects a block that never closes', () => {
    expectFailure(
      () => parseStudioEditBlocks('<<<<<<< SEARCH\n<h1>a</h1>\n=======\n<h1>b</h1>'),
      'EDIT_BLOCK_MALFORMED',
    );
  });

  it('rejects a block with no divider', () => {
    expectFailure(
      () => parseStudioEditBlocks('<<<<<<< SEARCH\n<h1>a</h1>\n>>>>>>> REPLACE'),
      'EDIT_BLOCK_MALFORMED',
    );
  });

  it('rejects an empty search body', () => {
    expectFailure(() => parseStudioEditBlocks(block('', '<h1>b</h1>')), 'EDIT_BLOCK_SEARCH_EMPTY');
  });
});

describe('applyStudioEditBlocks', () => {
  it('applies a single block and leaves every other byte untouched', () => {
    const result = applyStudioEditBlocks(
      document,
      parseStudioEditBlocks(block('<h1>番茄钟</h1>', '<h1>我的番茄钟</h1>')),
    );
    expect(result).toBe(document.replace('<h1>番茄钟</h1>', '<h1>我的番茄钟</h1>'));
  });

  it('applies several blocks against the original document, order independent', () => {
    const blocks = parseStudioEditBlocks(
      `${block('<p id="count">0</p>', '<p id="count">1</p>')}\n${block('<title>番茄钟</title>', '<title>专注钟</title>')}`,
    );
    expect(applyStudioEditBlocks(document, blocks)).toBe(
      document
        .replace('<p id="count">0</p>', '<p id="count">1</p>')
        .replace('<title>番茄钟</title>', '<title>专注钟</title>'),
    );
  });

  it('does not let one block replacement feed the next block match', () => {
    const source = 'AA\nBB';
    const blocks = parseStudioEditBlocks(`${block('AA', 'BB')}\n${block('BB', 'CC')}`);
    expect(applyStudioEditBlocks(source, blocks)).toBe('BB\nCC');
  });

  it('fails when the search text is absent, quoting the text the model must re-read', () => {
    const error = expectFailure(
      () =>
        applyStudioEditBlocks(
          document,
          parseStudioEditBlocks(block('<h1>秒表</h1>', '<h1>x</h1>')),
        ),
      'EDIT_BLOCK_NOT_FOUND',
    );
    expect(error.message).toContain('<h1>秒表</h1>');
  });

  it('fails when the search text matches more than once', () => {
    const error = expectFailure(
      () =>
        applyStudioEditBlocks(
          '<p>0</p>\n<p>0</p>',
          parseStudioEditBlocks(block('<p>0</p>', '<p>1</p>')),
        ),
      'EDIT_BLOCK_AMBIGUOUS',
    );
    expect(error.message).toContain('2');
  });

  it('fails when two blocks touch overlapping ranges', () => {
    const source = '<div><span>a</span></div>';
    const blocks = parseStudioEditBlocks(
      `${block('<div><span>a</span>', '<div><span>b</span>')}\n${block('<span>a</span></div>', '<span>c</span></div>')}`,
    );
    expectFailure(() => applyStudioEditBlocks(source, blocks), 'EDIT_BLOCK_OVERLAP');
  });

  it('fails when a block would change nothing', () => {
    expectFailure(
      () =>
        applyStudioEditBlocks(
          document,
          parseStudioEditBlocks(block('<h1>番茄钟</h1>', '<h1>番茄钟</h1>')),
        ),
      'EDIT_BLOCK_NO_CHANGE',
    );
  });

  it('matches against a CRLF document by normalizing line endings', () => {
    const crlf = document.replaceAll('\n', '\r\n');
    const result = applyStudioEditBlocks(
      crlf,
      parseStudioEditBlocks(block('<h1>番茄钟</h1>', '<h1>新</h1>')),
    );
    expect(result).toContain('<h1>新</h1>');
    expect(result).not.toContain('\r');
  });

  it('carries retry guidance the coder can act on', () => {
    const error = expectFailure(
      () =>
        applyStudioEditBlocks(
          document,
          parseStudioEditBlocks(block('<h1>秒表</h1>', '<h1>x</h1>')),
        ),
      'EDIT_BLOCK_NOT_FOUND',
    );
    expect(error.retryGuidance).toContain('SEARCH');
    expect(error.retryGuidance.length).toBeGreaterThan(20);
  });
});
