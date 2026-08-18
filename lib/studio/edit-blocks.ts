/**
 * Search/replace edit blocks — the patch format the studio coder emits when it
 * modifies an existing app instead of rewriting it.
 *
 * Deliberately exact: a SEARCH body must occur in the stored document exactly
 * once, blocks may not touch overlapping ranges, and a block that changes
 * nothing is an error. There is no fuzzy matching — the pipeline falls back to a
 * full rewrite when application fails, so a silently wrong "close enough" match
 * would be strictly worse than a clean failure. Every failure carries
 * `retryGuidance`, written as an instruction the coder can execute on retry.
 */

export const STUDIO_EDIT_BLOCK_FORMAT = [
  '<<<<<<< SEARCH',
  '（原文中一字不差的片段）',
  '=======',
  '（替换后的内容）',
  '>>>>>>> REPLACE',
].join('\n');

export type StudioEditBlockFailureCode =
  | 'EDIT_BLOCKS_EMPTY'
  | 'EDIT_BLOCK_MALFORMED'
  | 'EDIT_BLOCK_SEARCH_EMPTY'
  | 'EDIT_BLOCK_NOT_FOUND'
  | 'EDIT_BLOCK_AMBIGUOUS'
  | 'EDIT_BLOCK_OVERLAP'
  | 'EDIT_BLOCK_NO_CHANGE';

export interface StudioEditBlock {
  search: string;
  replace: string;
}

export class StudioEditBlockError extends Error {
  constructor(
    readonly code: StudioEditBlockFailureCode,
    message: string,
    readonly retryGuidance: string,
  ) {
    super(`${message}\n${retryGuidance}`);
    this.name = 'StudioEditBlockError';
  }
}

// Marker matching is deliberately tolerant of length, case and spacing wobble:
// models drift on the fence itself far more often than on the content between
// fences, and a mis-counted `=` should not cost a whole targeted edit. This is
// not fuzzy matching — the SEARCH body is still matched against the document
// byte for byte.
const SEARCH_MARKER = /^<{5,}\s*SEARCH\b.*$/i;
const DIVIDER_MARKER = /^={5,}\s*$/;
const REPLACE_MARKER = /^>{5,}\s*REPLACE\b.*$/i;

/** Line endings are normalized everywhere so a CRLF response still matches an LF document. */
export function normalizeStudioText(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function excerpt(value: string, limit = 160): string {
  const collapsed = value.length <= limit ? value : `${value.slice(0, limit)}…`;
  return collapsed;
}

/** Parse a coder response into edit blocks, ignoring prose and code fences around them. */
export function parseStudioEditBlocks(raw: string): StudioEditBlock[] {
  const lines = normalizeStudioText(raw).split('\n');
  const blocks: StudioEditBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!SEARCH_MARKER.test(lines[index]!)) {
      index += 1;
      continue;
    }
    const searchStart = index + 1;
    let divider = -1;
    let end = -1;
    for (let cursor = searchStart; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]!;
      if (SEARCH_MARKER.test(line)) break;
      if (divider === -1 && DIVIDER_MARKER.test(line)) divider = cursor;
      if (REPLACE_MARKER.test(line)) {
        end = cursor;
        break;
      }
    }
    if (end === -1 || divider === -1) {
      throw new StudioEditBlockError(
        'EDIT_BLOCK_MALFORMED',
        '编辑块不完整：缺少 ======= 分隔行或 >>>>>>> REPLACE 结束行。',
        `请只输出结构完整的编辑块，每块严格是：\n${STUDIO_EDIT_BLOCK_FORMAT}`,
      );
    }
    const search = lines.slice(searchStart, divider).join('\n');
    const replace = lines.slice(divider + 1, end).join('\n');
    if (search.trim() === '') {
      throw new StudioEditBlockError(
        'EDIT_BLOCK_SEARCH_EMPTY',
        'SEARCH 段为空，无法定位要修改的位置。',
        'SEARCH 段必须从当前 HTML 里原样复制一段唯一出现的文本（含缩进），不能留空。',
      );
    }
    blocks.push({ search, replace });
    index = end + 1;
  }
  if (blocks.length === 0) {
    throw new StudioEditBlockError(
      'EDIT_BLOCKS_EMPTY',
      '响应里没有任何编辑块。',
      `请不要用自然语言描述改动，只输出编辑块，每块严格是：\n${STUDIO_EDIT_BLOCK_FORMAT}`,
    );
  }
  return blocks;
}

function locate(document: string, block: StudioEditBlock): number {
  const first = document.indexOf(block.search);
  if (first === -1) {
    throw new StudioEditBlockError(
      'EDIT_BLOCK_NOT_FOUND',
      `SEARCH 段在当前 HTML 中不存在：\n${excerpt(block.search)}`,
      '请重新从我提供的当前 HTML 里逐字复制一段（包括空格、缩进和换行）作为 SEARCH，不要凭记忆重写，也不要省略任何字符。',
    );
  }
  let count = 0;
  let cursor = first;
  while (cursor !== -1) {
    count += 1;
    if (count > 1) break;
    cursor = document.indexOf(block.search, cursor + 1);
  }
  if (count > 1) {
    throw new StudioEditBlockError(
      'EDIT_BLOCK_AMBIGUOUS',
      `SEARCH 段在当前 HTML 中出现了 2 次以上，无法确定改哪一处：\n${excerpt(block.search)}`,
      '请把 SEARCH 段向上下各多复制几行，直到这段文本在整份 HTML 里只出现一次。',
    );
  }
  return first;
}

/**
 * Apply every block against the ORIGINAL document, then splice back to front.
 *
 * Matching against the original (not against the partially-patched result) makes
 * application order irrelevant and makes overlapping edits detectable instead of
 * silently corrupting each other.
 */
export function applyStudioEditBlocks(html: string, blocks: StudioEditBlock[]): string {
  const document = normalizeStudioText(html);
  if (blocks.length === 0) {
    throw new StudioEditBlockError(
      'EDIT_BLOCKS_EMPTY',
      '没有可应用的编辑块。',
      `请输出至少一个编辑块，格式为：\n${STUDIO_EDIT_BLOCK_FORMAT}`,
    );
  }
  const edits = blocks.map((block) => {
    const search = normalizeStudioText(block.search);
    const replace = normalizeStudioText(block.replace);
    const start = locate(document, { search, replace });
    return { start, end: start + search.length, search, replace };
  });
  const ordered = [...edits].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index]!.start < ordered[index - 1]!.end) {
      throw new StudioEditBlockError(
        'EDIT_BLOCK_OVERLAP',
        `两个编辑块命中了 HTML 中重叠的区域：\n${excerpt(ordered[index - 1]!.search, 80)}\n${excerpt(ordered[index]!.search, 80)}`,
        '重叠的改动请合并成一个更大的编辑块；每个编辑块必须覆盖互不相交的区域。',
      );
    }
  }
  let next = document;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const edit = ordered[index]!;
    next = next.slice(0, edit.start) + edit.replace + next.slice(edit.end);
  }
  if (next === document) {
    throw new StudioEditBlockError(
      'EDIT_BLOCK_NO_CHANGE',
      '所有编辑块应用后 HTML 没有任何变化。',
      '每个编辑块的 REPLACE 段必须与 SEARCH 段不同；请给出真正实现用户要求的改动。',
    );
  }
  return next;
}

/** How many blocks and how much of each side are kept for display on a version. */
const MAX_STORED_BLOCKS = 8;
const MAX_STORED_SIDE = 1_200;

function clip(value: string): string {
  return value.length <= MAX_STORED_SIDE
    ? value
    : `${value.slice(0, MAX_STORED_SIDE)}\n…（已截断）`;
}

/**
 * Shrink applied blocks to something worth storing on a version.
 *
 * The blocks are shown in the conversation as the diff the coder actually made,
 * so they have to survive a reload — but a rewrite-sized block would put a whole
 * document into the record twice.
 */
export function summarizeStudioEditBlocks(blocks: StudioEditBlock[]): StudioEditBlock[] {
  return blocks
    .slice(0, MAX_STORED_BLOCKS)
    .map((block) => ({ search: clip(block.search), replace: clip(block.replace) }));
}
