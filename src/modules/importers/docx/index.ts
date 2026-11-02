import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import type { Element, Node } from '@xmldom/xmldom';
import type { AssetData, Block, Diagnostic, DraftQuestion, ImportDraft, Importer, InlineRun } from '../../../contracts/index';
import { blocksToPlainText, collectAssetIds, questionContentKey, referencesChoiceLabels, sha256Hex } from '../../content-model/index';

export interface LayoutProfile {
  id: string;
  label: string;
  sourceTagPattern: string;
  stemStartPattern: string;
  choiceMarkers: string[];
  answerLabelPattern: string;
  explanationLabelPattern: string;
  objectiveLinePattern: string;
  fixedChoicePatterns: string[];
  stemLookaheadBlocks?: number;
}

export const standardProfile: LayoutProfile = {
  id: 'standard', label: '기본 Word 문제 양식',
  sourceTagPattern: '^\\s*<\\d{4}-\\d{1,2}-\\d{1,2}>?\\s*$',
  stemStartPattern: '^\\s*(\\d+)\\.\\s*',
  choiceMarkers: ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'],
  answerLabelPattern: '^\\s*정답\\s*[:：]\\s*',
  explanationLabelPattern: '^\\s*해설\\s*[:：]\\s*',
  objectiveLinePattern: '^[ \\t　]*(?<subject>[가-힣]{1,10})[ \\t　]*(?<code>\\d+(?:[ \\t　]*-[ \\t　]*\\d+)+)\\.?[ \\t　]*(?<text>[^\\r\\n]*?)(?:(?=\\([AB]\\)|[AB]항)\\(?(?<grade>[AB])(?:\\)|항))?[ \\t　]*$',
  fixedChoicePatterns: ['[①-⑩]', '모두', '위의', '상기', '(?:해당 없음|정답 없음|없음)\\s*$'],
  stemLookaheadBlocks: 6,
};

export function validateProfile(profile: unknown): string[] {
  if (!profile || typeof profile !== 'object') return ['레이아웃 프로파일 객체가 없습니다. 양식 설정을 확인하세요.'];
  const record = profile as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of ['id', 'label']) {
    if (typeof record[key] !== 'string' || !(record[key] as string).trim()) errors.push(`${key} 값이 비었습니다. 양식 이름과 식별자를 입력하세요.`);
  }
  for (const key of ['sourceTagPattern', 'stemStartPattern', 'answerLabelPattern', 'explanationLabelPattern', 'objectiveLinePattern']) {
    if (typeof record[key] !== 'string' || !record[key]) { errors.push(`${key} 정규식을 문자열로 입력하세요.`); continue; }
    try {
      const regex = new RegExp(record[key] as string, 'u');
      if (regex.test('')) errors.push(`${key} 정규식이 빈 줄과 일치합니다. 실제 라벨이 있어야 일치하도록 고치세요.`);
    } catch { errors.push(`${key} 정규식이 올바르지 않습니다. 괄호와 이스케이프를 확인하세요.`); }
  }
  if (typeof record.stemStartPattern === 'string' && !/\((?!\?:|\?=|\?!|\?<=|\?<!)/.test(record.stemStartPattern)) {
    errors.push('문제 시작 정규식에 번호 캡처 그룹이 없습니다. 번호를 첫 번째 괄호 그룹으로 묶으세요.');
  }
  if (typeof record.objectiveLinePattern === 'string') {
    for (const group of ['subject', 'code', 'text', 'grade']) {
      if (!record.objectiveLinePattern.includes(`(?<${group}>`)) errors.push(`학습목표 정규식에 ${group} 이름 그룹이 없습니다. 해당 값을 이름 있는 캡처 그룹으로 지정하세요.`);
    }
  }
  if (!Array.isArray(record.choiceMarkers) || !record.choiceMarkers.length
    || record.choiceMarkers.some((value: unknown) => typeof value !== 'string' || !value.trim())
    || new Set(record.choiceMarkers).size !== record.choiceMarkers.length) {
    errors.push('선지 표시는 중복 없는 문자열 배열로 입력하세요.');
  }
  if (!Array.isArray(record.fixedChoicePatterns)) errors.push('고정 선지 정규식을 문자열 배열로 입력하세요.');
  else for (const pattern of record.fixedChoicePatterns as unknown[]) {
    try { if (typeof pattern !== 'string') throw new Error(); new RegExp(pattern, 'u'); }
    catch { errors.push('고정 선지 정규식이 올바르지 않습니다. 문자열과 괄호를 확인하세요.'); }
  }
  if (record.stemLookaheadBlocks !== undefined && (!Number.isInteger(record.stemLookaheadBlocks)
    || (record.stemLookaheadBlocks as number) < 1)) errors.push('앞보기 블록 수는 1 이상의 정수로 입력하세요.');
  return errors;
}

const ns = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  v: 'urn:schemas-microsoft-com:vml',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
};
const is = (element: Element, namespace: string, name: string): boolean => element.namespaceURI === namespace && element.localName === name;
function children(node: Node): Element[] {
  const result: Element[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) result.push(child as Element);
  return result;
}
const attr = (element: Element, name: string): string => element.getAttributeNS(ns.w, name) ?? '';
const first = (element: Element, namespace: string, name: string): Element | undefined =>
  element.getElementsByTagNameNS(namespace, name).item(0) ?? undefined;
function parseXml(xml: string): Element {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('문서 형식 선언은 지원하지 않습니다.');
  const doc = new DOMParser({ onError: () => { throw new Error('XML 구조가 올바르지 않습니다.'); } }).parseFromString(xml, 'application/xml');
  if (!doc.documentElement) throw new Error('XML 본문이 없습니다.');
  return doc.documentElement;
}
function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63]
      + (i + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : '=')
      + (i + 2 < bytes.length ? alphabet[value & 63] : '='));
  }
  return parts.join('');
}
function mediaPath(target: string): string | undefined {
  const parts: string[] = target.startsWith('/') ? [] : ['word'];
  for (const part of target.split('/')) {
    if (part === '..') { if (!parts.length) return undefined; parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  const path = parts.join('/');
  return path.startsWith('word/media/') ? path : undefined;
}
interface NumberingLevel { numFmt: string; start: number; lvlText: string }
interface AutoNumber { value: number; label: string }
interface Entry { block: Block; position: number; text: string; boundary: boolean; autoNumber?: AutoNumber }
interface LocatedDiagnostic { diagnostic: Diagnostic; position: number }
interface Media { bytes: Uint8Array; mime: string }

function readNumbering(root: Element): Map<string, Map<string, NumberingLevel>> {
  const abstracts = new Map<string, Map<string, NumberingLevel>>();
  const levelProperties = (element: Element): Partial<NumberingLevel> => {
    const result: Partial<NumberingLevel> = {};
    for (const child of children(element)) {
      if (is(child, ns.w, 'numFmt')) result.numFmt = attr(child, 'val');
      if (is(child, ns.w, 'lvlText')) result.lvlText = attr(child, 'val');
      if (is(child, ns.w, 'start')) {
        const value = Number(attr(child, 'val'));
        if (Number.isSafeInteger(value) && value >= 0) result.start = value;
      }
    }
    return result;
  };
  for (const abstract of children(root).filter((element) => is(element, ns.w, 'abstractNum'))) {
    const levels = new Map<string, NumberingLevel>();
    for (const level of children(abstract).filter((element) => is(element, ns.w, 'lvl'))) {
      levels.set(attr(level, 'ilvl'), { numFmt: '', start: 1, lvlText: '', ...levelProperties(level) });
    }
    abstracts.set(attr(abstract, 'abstractNumId'), levels);
  }
  const numbering = new Map<string, Map<string, NumberingLevel>>();
  for (const num of children(root).filter((element) => is(element, ns.w, 'num'))) {
    const abstractId = first(num, ns.w, 'abstractNumId');
    const levels = new Map(abstracts.get(abstractId ? attr(abstractId, 'val') : '') ?? []);
    for (const override of children(num).filter((element) => is(element, ns.w, 'lvlOverride'))) {
      const ilvl = attr(override, 'ilvl');
      const level = first(override, ns.w, 'lvl');
      const properties = { numFmt: '', start: 1, lvlText: '', ...levels.get(ilvl), ...(level ? levelProperties(level) : {}) };
      const start = first(override, ns.w, 'startOverride');
      const value = start ? Number(attr(start, 'val')) : NaN;
      if (Number.isSafeInteger(value) && value >= 0) properties.start = value;
      levels.set(ilvl, properties);
    }
    numbering.set(attr(num, 'numId'), levels);
  }
  return numbering;
}

function circledNumber(value: number): string {
  if (value === 0) return '⓪';
  if (value >= 1 && value <= 20) return String.fromCodePoint(0x2460 + value - 1);
  if (value >= 21 && value <= 35) return String.fromCodePoint(0x3251 + value - 21);
  if (value >= 36 && value <= 50) return String.fromCodePoint(0x32b1 + value - 36);
  return `(${value})`;
}

class BlockReader {
  readonly assets = new Map<string, AssetData>();
  readonly diagnostics: LocatedDiagnostic[] = [];
  position = 0;
  private readonly counters = new Map<string, number>();
  constructor(private readonly media: Map<string, Media>, private readonly numbering: Map<string, Map<string, NumberingLevel>>) {}

  report(code: string, severity: Diagnostic['severity'], message: string, position: number): void {
    this.diagnostics.push({ diagnostic: { code, severity, message: `${position}번째 문단 부근: ${message}` }, position });
  }
  container(element: Element): Entry[] { return children(element).flatMap((child) => this.convert(child)); }
  convert(element: Element): Entry[] {
    if (is(element, ns.w, 'del') || is(element, ns.mc, 'Fallback')) return [];
    if (is(element, ns.mc, 'AlternateContent')) {
      const choice = children(element).find((child) => is(child, ns.mc, 'Choice'));
      return choice ? this.container(choice) : [];
    }
    if (is(element, ns.w, 'p')) return this.paragraph(element);
    if (is(element, ns.m, 'oMath') || is(element, ns.m, 'oMathPara')) {
      const position = ++this.position;
      const text = Array.from(element.getElementsByTagNameNS(ns.m, 't')).map((part) => part.textContent ?? '').join('');
      this.report('MATH_FLATTENED', 'warn', '수식을 선형 텍스트로 변환하여 수식 모양이 사라졌습니다. 미리보기에서 확인하고 필요하면 이미지로 바꾸세요.', position);
      return [{ block: { type: 'paragraph', runs: [{ text }] }, position, text, boundary: false }];
    }
    if (is(element, ns.w, 'tbl')) {
      const position = Math.max(1, this.position + 1);
      const rows = children(element).filter((child) => is(child, ns.w, 'tr')).map((row) =>
        children(row).filter((child) => is(child, ns.w, 'tc')).map((cell) => this.container(cell).map((entry) => entry.block)));
      const block: Block = { type: 'table', rows };
      return [{ block, position, text: blocksToPlainText([block]), boundary: false }];
    }
    return this.container(element);
  }
  paragraph(element: Element): Entry[] {
    const position = ++this.position;
    const properties = children(element).find((child) => is(child, ns.w, 'pPr'));
    const numPr = properties && first(properties, ns.w, 'numPr');
    let autoNumber: AutoNumber | undefined;
    if (numPr) {
      const numId = first(numPr, ns.w, 'numId');
      const ilvl = first(numPr, ns.w, 'ilvl');
      const id = numId ? attr(numId, 'val') : '';
      const levelId = ilvl ? attr(ilvl, 'val') : '0';
      const level = this.numbering.get(id)?.get(levelId);
      if (level) {
        const key = `${id}:${levelId}`;
        const value = (this.counters.get(key) ?? (level.start - 1)) + 1;
        this.counters.set(key, value);
        if (['decimalEnclosedCircle', 'decimalEnclosedCircleChinese', 'decimalEnclosedFcircle'].includes(level.numFmt)) {
          autoNumber = { value, label: level.lvlText.replace(/%[1-9]/g, () => circledNumber(value)) || circledNumber(value) };
        }
      }
    }
    const blocks: Block[] = [];
    let runs: InlineRun[] = [];
    const flush = (): void => {
      if (runs.some((run) => run.text.length)) blocks.push({ type: 'paragraph', runs });
      runs = [];
    };
    const visit = (current: Element, style: Omit<InlineRun, 'text'> = {}, dimensions?: Element): void => {
      if (current.namespaceURI === ns.w && ['del', 'delText', 'instrText', 'pPr', 'rPr'].includes(current.localName ?? '')) return;
      if (is(current, ns.mc, 'Fallback')) return;
      if (is(current, ns.mc, 'AlternateContent')) {
        const choice = children(current).find((child) => is(child, ns.mc, 'Choice'));
        if (choice) children(choice).forEach((child) => visit(child, style, dimensions));
        return;
      }
      if (is(current, ns.w, 'txbxContent')) {
        flush();
        blocks.push({ type: 'table', rows: [[this.container(current).map((entry) => entry.block)]] });
        this.report('TEXTBOX_AS_TABLE', 'info', '텍스트박스를 1×1 표로 변환했습니다. 미리보기에서 보기 상자를 확인하세요.', position);
        return;
      }
      if (is(current, ns.w, 'drawing')) dimensions = first(current, ns.wp, 'extent');
      if (is(current, ns.a, 'blip') || is(current, ns.v, 'imagedata')) {
        flush();
        const id = current.getAttributeNS(ns.r, is(current, ns.a, 'blip') ? 'embed' : 'id') ?? '';
        const media = this.media.get(id);
        if (!media) this.report('IMAGE_NOT_FOUND', 'warn', `이미지 관계 ${id || '(없음)'}를 찾지 못했습니다. 원본 Word에 이미지를 다시 삽입하세요.`, position);
        else {
          const sha256 = sha256Hex(media.bytes);
          const assetId = `asset-${sha256.slice(0, 16)}`;
          if (!this.assets.has(assetId)) this.assets.set(assetId, { id: assetId, mime: media.mime, sha256, dataBase64: base64(media.bytes) });
          const block: Block = { type: 'image', assetId };
          if (dimensions) {
            const width = Number(dimensions.getAttribute('cx'));
            const height = Number(dimensions.getAttribute('cy'));
            if (width > 0) block.widthPx = Math.round(width / 9525);
            if (height > 0) block.heightPx = Math.round(height / 9525);
          }
          blocks.push(block);
        }
        return;
      }
      if (is(current, ns.m, 'oMath') || is(current, ns.m, 'oMathPara')) {
        const text = Array.from(current.getElementsByTagNameNS(ns.m, 't')).map((part) => part.textContent ?? '').join('');
        if (text) runs.push({ ...style, text });
        this.report('MATH_FLATTENED', 'warn', '수식을 선형 텍스트로 변환하여 수식 모양이 사라졌습니다. 미리보기에서 확인하고 필요하면 이미지로 바꾸세요.', position);
        return;
      }
      if (is(current, ns.w, 'r')) {
        style = { ...style };
        const properties = children(current).find((child) => is(child, ns.w, 'rPr'));
        for (const property of properties ? children(properties) : []) {
          const value = attr(property, 'val');
          if (is(property, ns.w, 'u')) style.underline = value !== 'none' && value !== '0' && value !== 'false';
          if (is(property, ns.w, 'b')) style.bold = value !== '0' && value !== 'false';
          if (is(property, ns.w, 'i')) style.italic = value !== '0' && value !== 'false';
          if (is(property, ns.w, 'vertAlign')) {
            style.superscript = value === 'superscript'; style.subscript = value === 'subscript';
          }
        }
      }
      if (is(current, ns.w, 't')) { runs.push({ ...style, text: current.textContent ?? '' }); return; }
      if (is(current, ns.w, 'tab')) { runs.push({ ...style, text: '\t' }); return; }
      if (is(current, ns.w, 'br')) { if (attr(current, 'type') !== 'page') runs.push({ ...style, text: '\n' }); return; }
      children(current).forEach((child) => visit(child, style, dimensions));
    };
    children(element).forEach((child) => visit(child));
    flush();
    const text = blocksToPlainText(blocks);
    if (numPr && !autoNumber && !/^\s*(?:\d+[.)]|[①-⑩])/.test(text)) {
      this.report('AUTO_NUMBERING_IGNORED', 'warn', '자동 번호 정의가 없거나 지원하는 원문자 형식이 아니어서 복원하지 않았습니다. Word에서 번호를 일반 텍스트로 바꾸세요.', position);
    }
    const firstParagraph = blocks.findIndex((block) => block.type === 'paragraph');
    return blocks.map((block, index) => ({ block, position, text: blocksToPlainText([block]), boundary: block.type === 'paragraph',
      autoNumber: index === firstParagraph ? autoNumber : undefined }));
  }
}

function stripPrefix(block: Block, length: number): Block {
  if (block.type !== 'paragraph') return block;
  let remaining = length;
  let trimming = true;
  const runs: InlineRun[] = [];
  for (const run of block.runs) {
    const removed = Math.min(remaining, run.text.length);
    remaining -= removed;
    let text = run.text.slice(removed);
    if (trimming) text = text.trimStart();
    if (text) { runs.push({ ...run, text }); trimming = false; }
  }
  return { type: 'paragraph', runs };
}

function records(entries: Entry[], profile: LayoutProfile, fileName: string, subject: string, reader: BlockReader): DraftQuestion[] {
  const source = new RegExp(profile.sourceTagPattern, 'u');
  const stem = new RegExp(profile.stemStartPattern, 'u');
  const answer = new RegExp(profile.answerLabelPattern, 'u');
  const explanation = new RegExp(profile.explanationLabelPattern, 'u');
  const objective = new RegExp(profile.objectiveLinePattern, 'u');
  const fixed = profile.fixedChoicePatterns.map((pattern) => new RegExp(pattern, 'u'));
  const marker = (text: string): string | undefined => profile.choiceMarkers.find((value) => text.trimStart().startsWith(value));
  const escapedMarkers = profile.choiceMarkers.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const answerMarkers = new RegExp(escapedMarkers.sort((a, b) => b.length - a.length).join('|'), 'gu');
  const questions: DraftQuestion[] = [];
  const owners = new Map<number, { draftIndex?: number }>();
  let current: DraftQuestion['question'] | undefined;
  let mode: 'passage' | 'choices' | 'answer' | 'explanation' = 'passage';
  let beforeFirstBoundary = true;
  let discarded: Entry[] = [];
  const restored = new Map<number, { position: number; labels: string[] }>();
  const flushDiscarded = (): void => {
    if (!discarded.length) return;
    const paragraphs = [...new Map(discarded.map((entry) => [entry.position, entry])).values()];
    const preview = paragraphs.slice(0, 3).map((entry) => entry.text.slice(0, 40)).join(' / ');
    const remainder = paragraphs.length > 3 ? ` 외 ${paragraphs.length - 3}개 문단` : '';
    reader.report(beforeFirstBoundary ? 'PREAMBLE_IGNORED' : 'UNPARSED_BLOCKS', beforeFirstBoundary ? 'info' : 'warn',
      beforeFirstBoundary ? `문서 앞부분의 내용 "${preview}"${remainder}을 건너뛰었습니다. 필요한 내용이면 문제 본문으로 옮기세요.`
        : `문제에 속하지 않은 내용 "${preview}"${remainder}이 있습니다. 문제 번호와 선지 시작 양식을 확인하세요.`, paragraphs[0].position);
    discarded = [];
  };
  const isStart = (index: number): RegExpExecArray | null => {
    if (current && mode === 'passage') return null;
    const entry = entries[index];
    const match = entry.boundary ? stem.exec(entry.text) : null;
    if (!match || !match[1]) return null;
    let count = 0;
    for (let next = index + 1; next < entries.length; next++) {
      const candidate = entries[next];
      if (!candidate.boundary || !candidate.text.trim()) continue;
      if (++count > (profile.stemLookaheadBlocks ?? 6)) break;
      if (answer.test(candidate.text) || explanation.test(candidate.text) || source.test(candidate.text)
        || objective.test(candidate.text)) break;
      if (current && stem.test(candidate.text)) break;
      if (candidate.autoNumber || marker(candidate.text) === profile.choiceMarkers[0]) {
        if (current && (mode === 'explanation' || mode === 'answer')) {
          // 해설의 단일 번호 목록은 새 라벨이나 복수 선지가 있는 다음 문제와 구별한다.
          const seen = new Set([profile.choiceMarkers[0]]);
          for (let end = next + 1; end < entries.length; end++) {
            const boundary = entries[end];
            if (!boundary.boundary) continue;
            if (answer.test(boundary.text) || explanation.test(boundary.text)) return match;
            if (stem.test(boundary.text) || source.test(boundary.text) || objective.test(boundary.text)) break;
            const nextMarker = boundary.autoNumber ? `auto-${end}` : marker(boundary.text);
            if (nextMarker) seen.add(nextMarker);
          }
          return seen.size >= 2 ? match : null;
        }
        return match;
      }
    }
    return null;
  };
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry.text.trim() && entry.block.type === 'paragraph') continue;
    if (entry.boundary && source.test(entry.text)) {
      flushDiscarded(); beforeFirstBoundary = false;
      current = undefined;
      owners.set(entry.position, {});
      continue;
    }
    const start = isStart(index);
    if (start) {
      flushDiscarded(); beforeFirstBoundary = false;
      current = { schemaVersion: 1, subject, type: 'mcq', stem: [stripPrefix(entry.block, start[0].length)],
        choices: [], answerChoiceIds: [], explanation: [], shufflePolicy: 'free', tags: [],
        extra: { originalNumber: start[1], objectiveText: undefined, sourceFile: fileName } };
      questions.push({ question: current, sourceLocation: `${fileName} · ${entry.position}번째 문단 부근` });
      owners.set(entry.position, { draftIndex: questions.length - 1 });
      mode = 'passage';
      continue;
    }
    owners.set(entry.position, { draftIndex: current ? questions.length - 1 : undefined });
    if (!current) {
      discarded.push(entry);
      continue;
    }
    flushDiscarded();
    const target = entry.boundary ? objective.exec(entry.text.replace(/\u3000/g, ' ')) : null;
    if (target?.groups) {
      const { subject: objectiveSubject, code, text, grade } = target.groups;
      if (objectiveSubject && code) current.objectiveCode = `${objectiveSubject} ${code.replace(/\s*-\s*/g, '-').trim()}`;
      current.grade = grade?.trim(); current.extra.objectiveText = text?.trim(); current = undefined;
      continue;
    }
    if (mode === 'explanation') { current.explanation.push(entry.block); continue; }
    const answerMatch = entry.boundary ? answer.exec(entry.text) : null;
    if (answerMatch) {
      const value = entry.text.slice(answerMatch[0].length).trim();
      const numbers: number[] = [];
      for (const match of value.matchAll(answerMarkers)) {
        numbers.push(profile.choiceMarkers.indexOf(match[0]) + 1);
      }
      if (!numbers.length && /^\d+(?:[\s,，]+\d+)*$/.test(value)) {
        numbers.push(...value.match(/\d+/g)!.map(Number));
        reader.report('ANSWER_FORMAT', 'warn', `정답 "${value}"이 숫자 형식입니다. 원문자 선지 표시로 바꾸고 대응을 확인하세요.`, entry.position);
      }
      current.answerChoiceIds = [...new Set(numbers.map((number) => `c${number}`))]; mode = 'answer';
      continue;
    }
    const explanationMatch = entry.boundary ? explanation.exec(entry.text) : null;
    if (explanationMatch) {
      mode = 'explanation';
      const block = stripPrefix(entry.block, explanationMatch[0].length);
      if (blocksToPlainText([block]).trim()) current.explanation.push(block);
      continue;
    }
    if (mode === 'answer') { current.explanation.push(entry.block); continue; }
    const choiceMarker = entry.boundary ? marker(entry.text) : undefined;
    if (choiceMarker || entry.autoNumber) {
      const offset = choiceMarker ? entry.text.length - entry.text.trimStart().length + choiceMarker.length : 0;
      current.choices.push({ id: `c${current.choices.length + 1}`, content: [stripPrefix(entry.block, offset)] }); mode = 'choices';
      if (entry.autoNumber) {
        const draftIndex = questions.length - 1;
        const group = restored.get(draftIndex) ?? { position: entry.position, labels: [] };
        group.labels.push(`${entry.autoNumber.label}(${entry.autoNumber.value})`);
        restored.set(draftIndex, group);
      }
    } else if (mode === 'choices') current.choices.at(-1)!.content.push(entry.block);
    else (current.passage ??= []).push(entry.block);
  }
  flushDiscarded();
  for (const [draftIndex, group] of restored) {
    reader.report('AUTO_NUMBERING_RESTORED', 'info', `${draftIndex + 1}번째 문제의 자동 원문자 선지 ${group.labels.length}개(${group.labels.join(', ')})를 문제 안의 순서로 복원했습니다. 미리보기에서 선지 순서를 확인하세요.`, group.position);
  }
  for (const draft of questions) for (const choice of draft.question.choices) {
    if (fixed.some((pattern) => pattern.test(blocksToPlainText(choice.content)))) choice.fixedPosition = true;
  }
  for (const event of reader.diagnostics) {
    // 상자나 셀 내부 진단도 이를 소유한 바깥 문단의 문제로 연결한다.
    let owner = owners.get(event.position);
    if (!owner) {
      for (let position = event.position - 1; position >= 1; position--) {
        owner = owners.get(position); if (owner) break;
      }
    }
    event.diagnostic.ref = owner ?? {};
  }
  return questions;
}

export const docxImporter: Importer = {
  kind: 'importer', id: 'docx', label: 'Word 문서', extensions: ['.docx'],
  async parse(input, options): Promise<ImportDraft> {
    const empty = (): ImportDraft => ({ questions: [], passageGroups: [], assets: [], diagnostics: [] });
    const draft = empty();
    const subject = typeof options?.subject === 'string' ? options.subject.trim() : '';
    if (!subject) {
      draft.diagnostics.push({ severity: 'error', code: 'SUBJECT_REQUIRED', message: '가져올 과목이 없습니다. 과목을 선택한 뒤 Word 문서를 다시 가져오세요.', ref: {} });
      return draft;
    }
    const profile: LayoutProfile = (options?.profile ?? standardProfile) as LayoutProfile;
    const errors = validateProfile(profile);
    if (errors.length) {
      draft.diagnostics.push({ severity: 'error', code: 'DOCX_INVALID', message: `문서 양식 설정이 올바르지 않습니다. ${errors.join(' ')}`, ref: {} });
      return draft;
    }
    try {
      const zip = await JSZip.loadAsync(input.data);
      const documentFile = zip.file('word/document.xml');
      if (!documentFile) throw new Error('word/document.xml이 없습니다.');
      const root = parseXml(await documentFile.async('string'));
      if (!is(root, ns.w, 'document')) throw new Error('Word 문서 루트가 없습니다.');
      const body = first(root, ns.w, 'body');
      if (!body) throw new Error('Word 본문이 없습니다.');
      const media = new Map<string, Media>();
      const rels = zip.file('word/_rels/document.xml.rels');
      if (rels) {
        const relations = children(parseXml(await rels.async('string')));
        await Promise.all(relations.map(async (relation) => {
          if (relation.getAttribute('TargetMode') === 'External' || !relation.getAttribute('Type')?.endsWith('/image')) return;
          const path = mediaPath(relation.getAttribute('Target') ?? '');
          const file = path ? zip.file(path) : null;
          if (!file || !path) return;
          const ext = path.split('.').at(-1)?.toLowerCase() ?? '';
          const mimes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml', emf: 'image/emf', wmf: 'image/wmf', webp: 'image/webp' };
          media.set(relation.getAttribute('Id') ?? '', { bytes: await file.async('uint8array'), mime: mimes[ext] ?? 'application/octet-stream' });
        }));
      }
      const numberingFile = zip.file('word/numbering.xml');
      const numbering = numberingFile ? readNumbering(parseXml(await numberingFile.async('string'))) : new Map<string, Map<string, NumberingLevel>>();
      const reader = new BlockReader(media, numbering);
      const questions = records(reader.container(body), profile, input.fileName, subject, reader);
      const includeGrades = options?.includeGrades === undefined ? ['A'] : options.includeGrades;
      if (includeGrades !== null && (!Array.isArray(includeGrades) || includeGrades.some((grade: unknown) => typeof grade !== 'string'))) {
        draft.diagnostics.push({ severity: 'error', code: 'GRADE_FILTER_INVALID', message: '등급 필터는 문자열 배열 또는 null로 입력하세요. 모든 등급은 빈 배열로 가져올 수 있습니다.' });
        return draft;
      }
      const indices = new Map<number, number>();
      const passages = new Map<string, string>();
      for (const [index, item] of questions.entries()) {
        const { question } = item;
        const location = item.sourceLocation ?? '문서 위치 미상';
        const preview = blocksToPlainText(question.stem).slice(0, 20);
        const skip = (code: string, reason: string): void => {
          draft.diagnostics.push({ severity: 'info', code,
            message: `${location}, 문제 "${preview}": ${reason}` });
        };
        if (options?.requireObjective !== false && !question.objectiveCode) {
          skip('SKIPPED_NO_OBJECTIVE', '학습목표 코드가 없어 제외했습니다. 학습목표 줄을 추가하거나 requireObjective를 false로 바꾸세요.');
          continue;
        }
        if (includeGrades?.length && (!question.grade || !includeGrades.includes(question.grade))) {
          skip('SKIPPED_BY_GRADE', `${question.grade ? `등급 ${question.grade}` : '등급 표시 없음'}으로 제외했습니다. 등급 필터를 바꾸면 가져올 수 있습니다.`);
          continue;
        }
        const key = questionContentKey(question);
        const first = passages.get(key);
        if (options?.dedupeByPassage !== false && first !== undefined) {
          skip('SKIPPED_DUPLICATE_PASSAGE', `지문이 같아 제외했습니다. 남긴 문제: ${first}. 선지가 달라도 같은 지문은 첫 문제만 가져옵니다.`);
          continue;
        }
        passages.set(key, location);
        indices.set(index, draft.questions.length);
        if (options?.lockChoicesOnReference !== false && referencesChoiceLabels([
          ...question.explanation, ...question.stem, ...(question.passage ?? []),
        ])) {
          question.shufflePolicy = 'lock-all';
          draft.diagnostics.push({ severity: 'info', code: 'CHOICES_LOCKED_BY_REFERENCE',
            message: `${location}, 문제 "${preview}": 해설·본문에 선지 번호(①~⑤)가 있어 선지 순서를 고정했습니다. 번호가 법 조항 등 선지와 무관하면 문제 편집에서 고정을 해제하세요`,
            ref: { draftIndex: draft.questions.length } });
        }
        draft.questions.push(item);
      }
      const usedAssets = new Set(draft.questions.flatMap(({ question }) => collectAssetIds([
        ...question.stem, ...(question.passage ?? []), ...question.explanation, ...question.choices.flatMap((choice) => choice.content),
      ])));
      draft.assets = [...reader.assets.values()].filter((asset) => usedAssets.has(asset.id));
      for (const { diagnostic } of reader.diagnostics) {
        const original = diagnostic.ref?.draftIndex;
        if (original !== undefined && !indices.has(original)) continue;
        draft.diagnostics.push({ ...diagnostic, ref: diagnostic.ref ? { ...diagnostic.ref,
          ...(original === undefined ? {} : { draftIndex: indices.get(original) }) } : undefined });
      }
      return draft;
    } catch {
      const invalid = empty();
      invalid.diagnostics.push({ severity: 'error', code: 'DOCX_INVALID', message: `${input.fileName}: Word 문서 ZIP 또는 XML 구조를 읽을 수 없습니다. Word에서 .docx 형식으로 다시 저장한 뒤 가져오세요.`, ref: {} });
      return invalid;
    }
  },
};
