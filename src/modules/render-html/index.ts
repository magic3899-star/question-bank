import type { AssetData, Block, ExamSnapshot, ExportOptions, ExportPart, InlineRun } from '../../contracts/index';

interface RenderContext { assets: Record<string, AssetData> }
export interface RenderHtmlOptions extends ExportOptions { fontFaceCss?: string }
export interface RenderedExamDocument {
  part: ExportPart | 'combined';
  examId: string | null;
  title: string;
  html: string;
}

function escapeHtml(value: string | number): string {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

function renderRun(run: InlineRun): string {
  let html = escapeHtml(run.text).replace(/\n/gu, '<br>').replace(/\t/gu, '&emsp;');
  const styles = [['underline', 'u'], ['bold', 'strong'], ['italic', 'em'], ['superscript', 'sup'], ['subscript', 'sub']] as const;
  for (const [key, tag] of styles) if (run[key]) html = `<${tag}>${html}</${tag}>`;
  return html;
}

export function renderBlocks(blocks: Block[], ctx: RenderContext): string {
  return blocks.map((block): string => {
    if (block.type === 'paragraph') return `<p style="white-space: pre-wrap">${block.runs.map(renderRun).join('')}</p>`;
    if (block.type === 'table') {
      const box = block.rows.length === 1 && block.rows[0].length === 1;
      return `<table class="qb-table${box ? ' qb-box' : ''}"><tbody>${block.rows.map((row) =>
        `<tr>${row.map((cell) => `<td>${renderBlocks(cell, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    const asset = Object.hasOwn(ctx.assets, block.assetId) ? ctx.assets[block.assetId] : undefined;
    if (!asset) return '<span class="qb-warning" role="img" aria-label="이미지 없음">[이미지 없음]</span>';
    const mime = asset.mime.toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'].includes(mime)) {
      return '<span class="qb-warning" role="img" aria-label="지원하지 않는 이미지">[지원하지 않는 이미지]</span>';
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(asset.dataBase64)) {
      return '<span class="qb-warning" role="img" aria-label="이미지 없음">[이미지 없음]</span>';
    }
    const dimension = (name: string, size: number | undefined): string => size !== undefined && Number.isFinite(size) && size > 0
      ? ` ${name}="${escapeHtml(size)}"` : '';
    return `<img src="${escapeHtml(`data:${mime};base64,${asset.dataBase64}`)}"${dimension('width', block.widthPx)}${dimension('height', block.heightPx)} alt="${escapeHtml(block.alt ?? '')}">`;
  }).join('');
}

export function resolveTemplate(templateId: string): { id: 'standard'; usedFallback: boolean } {
  return { id: 'standard', usedFallback: templateId !== 'standard' };
}

const partNames: Record<ExportPart, string> = { questions: '문제지', answers: '정답지', explanations: '해설지' };
const partOrder: ExportPart[] = ['questions', 'answers', 'explanations'];

const standardCss = `
@page { size: A4; margin: 18mm; }
:root { --surface: #FFFFFF; --text: #1A1D23; --text-muted: #5B6472; --border: #E2E5EA; --warn: #C77700; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--text); background: var(--surface); font-family: 'Noto Serif KR','바탕','Batang',serif; font-size: 10pt; line-height: 1.7; word-break: keep-all; overflow-wrap: anywhere; }
h1, h2, h3, .qb-student { font-family: 'Noto Sans KR','맑은 고딕','Malgun Gothic',sans-serif; }
h1 { font-size: 20pt; text-align: center; margin: 0 0 16px; }
h2 { font-size: 16pt; margin: 0 0 16px; }
h3 { font-size: 10pt; margin: 0 0 8px; }
p { margin: 0 0 4px; white-space: pre-wrap; }
img { max-width: 100%; height: auto; object-fit: contain; }
.qb-student { text-align: right; margin-bottom: 24px; }
.qb-questions { column-count: 2; column-gap: 24px; column-rule: 1px solid var(--border); }
.qb-item { break-inside: avoid; margin-bottom: 16px; }
.qb-number, .qb-label { font-weight: bold; }
.qb-passage { margin: 8px 0 8px 16px; }
.qb-choice { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.qb-choice-content { min-width: 0; flex: 1; }
.qb-blank { border: 1px dashed var(--border); padding: 12px; }
.qb-table { border-collapse: collapse; width: 100%; margin: 8px 0; }
.qb-table td, .qb-answer-grid td, .qb-answer-grid th { border: 1px solid var(--border); padding: 4px 8px; vertical-align: top; }
.qb-box { border: 1px solid var(--text); }
.qb-answer-grid { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
.qb-answer-grid caption { text-align: left; margin-bottom: 8px; }
.qb-objective { color: var(--text-muted); margin-top: 8px; }
.qb-warning { color: var(--warn); }
.qb-part + .qb-part { break-before: page; margin-top: 32px; }
@media screen { body { max-width: 210mm; padding: 18mm; margin: auto; } }
@media print { .qb-part + .qb-part { margin-top: 0; } }
`;

function fontStyles(css: string | undefined): string {
  if (!css) return '';
  // 앱이 전달한 폰트 CSS도 외부 요청과 style 태그 탈출을 허용하지 않는다.
  const clean = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  if (/[<>\\]/u.test(clean)) return '';
  const faces = clean.match(/@font-face\s*\{[^{}]*\}/giu) ?? [];
  if (clean.replace(/@font-face\s*\{[^{}]*\}/giu, '').trim()) return '';
  for (const face of faces) {
    const urls = [...face.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/giu)];
    if (urls.some((match) => !/^data:(?:font\/[a-z0-9.-]+|application\/[a-z0-9.-]+);base64,[a-z0-9+/=]+$/iu.test(match[2]))) return '';
    const withoutUrls = face.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/giu, '');
    if (/url\s*\(|@import|(?:https?|file):/iu.test(withoutUrls)) return '';
  }
  return faces.length ? `<style data-qb-fonts>${faces.join('\n')}</style>` : '';
}

function renderPart(snapshot: ExamSnapshot, part: ExportPart): string {
  const ctx = { assets: snapshot.assets };
  const title = `<h1>${escapeHtml(snapshot.title)}</h1><h2>${partNames[part]}</h2>`;
  if (part === 'questions') {
    return `${title}<div class="qb-student">성명: ____________________　점수: __________</div><div class="qb-questions">${snapshot.items.map((item) => {
      const number = `<span class="qb-number">${escapeHtml(item.number)}.</span>`;
      if (item.blank) return `<article class="qb-item qb-blank">${number} (출제 가능한 문제가 없어 비워 둔 번호입니다)</article>`;
      return `<article class="qb-item">${number}<div class="qb-stem">${renderBlocks(item.stem, ctx)}</div>${item.passage?.length ? `<div class="qb-passage">${renderBlocks(item.passage, ctx)}</div>` : ''}<div class="qb-choices">${item.choices.map((choice) =>
        `<div class="qb-choice"><span class="qb-label">${escapeHtml(choice.label)}</span><div class="qb-choice-content">${renderBlocks(choice.content, ctx)}</div></div>`).join('')}</div></article>`;
    }).join('') || '<p>문항이 없습니다.</p>'}</div>`;
  }
  if (part === 'answers') {
    const rows: string[] = [];
    for (let i = 0; i < snapshot.items.length; i += 5) {
      const cells = snapshot.items.slice(i, i + 5).map((item) => `<th scope="row">${escapeHtml(item.number)}</th><td>${item.blank ? '—' : escapeHtml(item.answerLabels.join(', '))}</td>`);
      while (cells.length < 5) cells.push('<td></td><td></td>');
      rows.push(`<tr>${cells.join('')}</tr>`);
    }
    return `${title}<table class="qb-answer-grid"><caption>번호별 정답</caption><tbody>${rows.join('')}</tbody></table>`;
  }
  return `${title}${snapshot.items.map((item) => `<article class="qb-item qb-explanation"><h3>${escapeHtml(item.number)}. 정답: ${item.blank ? '—' : escapeHtml(item.answerLabels.join(', '))}</h3>${item.blank ? '<p>비워 둔 번호입니다.</p>' : `${renderBlocks(item.explanation, ctx)}<p class="qb-objective">학습목표: ${escapeHtml(item.objectiveCode ?? '미지정')}</p>`}</article>`).join('')}`;
}

export function renderExamHtml(snapshots: ExamSnapshot[], options: RenderHtmlOptions): RenderedExamDocument[] {
  const template = resolveTemplate(options.templateId);
  const parts = partOrder.filter((part) => options.parts.includes(part));
  if (!parts.length) return [];
  return snapshots.flatMap((snapshot) => {
    const groups = options.combineParts ? [parts] : parts.map((part) => [part]);
    return groups.map((group): RenderedExamDocument => {
      const part = options.combineParts ? 'combined' : group[0];
      const title = `${snapshot.title} ${part === 'combined' ? '통합본' : partNames[part]}`;
      const sections = group.map((entry) => `<section class="qb-part qb-${entry}-part">${renderPart(snapshot, entry)}</section>`).join('');
      return { part, examId: snapshot.examId, title,
        html: `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>${fontStyles(options.fontFaceCss)}<style>${standardCss}</style></head><body data-template="${escapeHtml(template.id)}"><main>${sections}</main></body></html>` };
    });
  });
}
