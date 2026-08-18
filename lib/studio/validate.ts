/**
 * Deterministic checks every generated page must pass before it is stored.
 *
 * Errors are hard gates — the generated document is unusable without fixing
 * them. Warnings are not gates: they are folded into `summary` and handed to the
 * reviewer agent, which decides whether they matter for this particular app.
 */

import { parse, type DefaultTreeAdapterTypes } from 'parse5';

/** Hard ceiling on a stored document. The prompt targets a far smaller page. */
export const STUDIO_HTML_MAX_BYTES = 512 * 1024;
/** Soft target from the design contract; exceeding it is a warning for the reviewer. */
export const STUDIO_HTML_TARGET_BYTES = 60 * 1024;

export type StudioValidationCode =
  | 'HTML_NOT_A_DOCUMENT'
  | 'HTML_EMPTY_BODY'
  | 'HTML_EXTERNAL_RESOURCE'
  | 'HTML_TOO_LARGE'
  | 'HTML_MODAL_DIALOG'
  | 'HTML_NO_TITLE'
  | 'HTML_OVER_TARGET_SIZE'
  | 'HTML_NO_NARRATION';

export interface StudioValidationIssue {
  code: StudioValidationCode;
  message: string;
}

export interface StudioValidationReport {
  errors: StudioValidationIssue[];
  warnings: StudioValidationIssue[];
  sizeBytes: number;
  /** Prompt-ready rendering, injected into the reviewer and into retry rounds. */
  summary: string;
}

/** Attributes that make the browser fetch something; `href` on an anchor does not. */
const RESOURCE_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'data', 'formaction']);
const REMOTE_URL = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const MODAL_CALL = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;

function isElement(
  node: DefaultTreeAdapterTypes.ChildNode,
): node is DefaultTreeAdapterTypes.Element {
  return !node.nodeName.startsWith('#');
}

function walk(
  node: DefaultTreeAdapterTypes.ChildNode | DefaultTreeAdapterTypes.Document,
  visit: (element: DefaultTreeAdapterTypes.Element) => void,
): void {
  const children = (node as { childNodes?: DefaultTreeAdapterTypes.ChildNode[] }).childNodes ?? [];
  for (const child of children) {
    if (isElement(child)) {
      visit(child);
      if (child.nodeName === 'template') {
        walk(
          (child as DefaultTreeAdapterTypes.Template)
            .content as unknown as DefaultTreeAdapterTypes.Document,
          visit,
        );
      }
    }
    walk(child, visit);
  }
}

function textOf(node: DefaultTreeAdapterTypes.ChildNode): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterTypes.TextNode).value;
  const children = (node as { childNodes?: DefaultTreeAdapterTypes.ChildNode[] }).childNodes ?? [];
  return children.map(textOf).join('');
}

function collectRemoteUrls(document: DefaultTreeAdapterTypes.Document): string[] {
  const urls: string[] = [];
  walk(document, (element) => {
    for (const attribute of element.attrs) {
      // `href` fetches a resource on <link> (stylesheet, icon, preload) but merely
      // points somewhere on <a>, which the sandbox is free to refuse on click.
      const fetchesResource =
        RESOURCE_ATTRIBUTES.has(attribute.name) ||
        (element.tagName === 'link' && attribute.name === 'href');
      if (!fetchesResource) continue;
      const value = attribute.value.trim();
      if (value && REMOTE_URL.test(value) && !urls.includes(value)) urls.push(value);
    }
  });
  return urls;
}

function collectScriptText(document: DefaultTreeAdapterTypes.Document): string {
  const parts: string[] = [];
  walk(document, (element) => {
    if (element.tagName === 'script' || element.tagName === 'style') {
      parts.push(element.childNodes.map(textOf).join(''));
    }
  });
  return parts.join('\n');
}

function findElement(
  document: DefaultTreeAdapterTypes.Document,
  tagName: string,
): DefaultTreeAdapterTypes.Element | undefined {
  let found: DefaultTreeAdapterTypes.Element | undefined;
  walk(document, (element) => {
    if (!found && element.tagName === tagName) found = element;
  });
  return found;
}

function renderSummary(report: Omit<StudioValidationReport, 'summary'>): string {
  const lines = [
    ...report.errors.map((issue) => `错误 ${issue.code}：${issue.message}`),
    ...report.warnings.map((issue) => `提示 ${issue.code}：${issue.message}`),
  ];
  const size = `文档体积 ${(report.sizeBytes / 1024).toFixed(1)} KB。`;
  if (lines.length === 0) return `静态校验通过，无外链、结构完整。${size}`;
  return `${lines.join('\n')}\n${size}`;
}

export interface StudioValidationOptions {
  /** Education pages are read aloud, so a silent one is worth reporting. */
  education?: boolean;
}

export function validateStudioHtml(
  html: string,
  options: StudioValidationOptions = {},
): StudioValidationReport {
  const errors: StudioValidationIssue[] = [];
  const warnings: StudioValidationIssue[] = [];
  const sizeBytes = Buffer.byteLength(html, 'utf8');

  if (sizeBytes > STUDIO_HTML_MAX_BYTES) {
    errors.push({
      code: 'HTML_TOO_LARGE',
      message: `文档 ${(sizeBytes / 1024).toFixed(0)} KB，超过 ${STUDIO_HTML_MAX_BYTES / 1024} KB 上限。`,
    });
  } else if (sizeBytes > STUDIO_HTML_TARGET_BYTES) {
    warnings.push({
      code: 'HTML_OVER_TARGET_SIZE',
      message: `文档 ${(sizeBytes / 1024).toFixed(0)} KB，超过 ${STUDIO_HTML_TARGET_BYTES / 1024} KB 的体积目标。`,
    });
  }

  const document = parse(html);
  const body = findElement(document, 'body');
  const hasHtmlTag = /<html[\s>]/i.test(html);
  const hasBodyContent = body ? body.childNodes.map(textOf).join('').trim().length > 0 : false;
  const hasBodyElements = body ? body.childNodes.some(isElement) : false;

  if (!hasHtmlTag || !body) {
    errors.push({
      code: 'HTML_NOT_A_DOCUMENT',
      message: '响应不是一份完整的 HTML 文档（缺少 <html> / <body>）。',
    });
  } else if (!hasBodyContent && !hasBodyElements) {
    errors.push({ code: 'HTML_EMPTY_BODY', message: '<body> 里没有任何可见内容。' });
  }

  for (const url of collectRemoteUrls(document)) {
    errors.push({
      code: 'HTML_EXTERNAL_RESOURCE',
      message: `引用了外部资源 ${url}；应用必须完全自包含。`,
    });
  }

  const scriptText = collectScriptText(document);
  if (MODAL_CALL.test(scriptText)) {
    warnings.push({
      code: 'HTML_MODAL_DIALOG',
      message: 'alert / confirm / prompt 在预览沙箱里被浏览器屏蔽，需要改成页面内的提示元素。',
    });
  }

  if (options.education && !/curiositySay\s*\(/.test(scriptText)) {
    warnings.push({
      code: 'HTML_NO_NARRATION',
      message: '页面没有调用 curiositySay()，孩子听不到任何解说。',
    });
  }

  const title = findElement(document, 'title');
  if (!title || textOf(title).trim() === '') {
    warnings.push({ code: 'HTML_NO_TITLE', message: '缺少 <title>。' });
  }

  const partial = { errors, warnings, sizeBytes };
  return { ...partial, summary: renderSummary(partial) };
}

/**
 * Pull the HTML document out of a coder response.
 *
 * The coder is a plain text model, so a response may arrive fenced, prefixed
 * with a sentence, or trailed by a sign-off. Anything that is not a document at
 * all is returned trimmed, and `validateStudioHtml` rejects it with a code the
 * retry round can act on.
 */
export function extractStudioHtmlDocument(raw: string): string {
  const text = raw.replaceAll('\r\n', '\n').trim();
  const fenced = /```(?:html)?\n([\s\S]*?)```/i.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.search(/<!doctype html|<html[\s>]/i);
  if (start === -1) return body;
  const end = body.toLowerCase().lastIndexOf('</html>');
  return end === -1 ? body.slice(start).trim() : body.slice(start, end + '</html>'.length).trim();
}
