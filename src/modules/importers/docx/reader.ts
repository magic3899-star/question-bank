import type { Element } from '@xmldom/xmldom';
import type { AssetData, Block, Diagnostic, InlineRun } from '../../../contracts/index';
import { blocksToPlainText, sha256Hex } from '../../content-model/index';
import type { LocatedDiagnostic } from '../../layout-parser/index';
import { attr, children, first, is, ns } from './xml';
import { base64 } from './media';
import type { Media } from './media';
import { circledNumber } from './numbering';
import type { NumberingLevel } from './numbering';
interface AutoNumber {
  value: number;
  label: string;
}
interface Entry {
  block: Block;
  position: number;
  text: string;
  boundary: boolean;
  autoNumber?: AutoNumber;
}

export class BlockReader {
  readonly assets = new Map<string, AssetData>();
  readonly diagnostics: LocatedDiagnostic[] = [];
  position = 0;
  private readonly counters = new Map<string, number>();
  constructor(
    private readonly media: Map<string, Media>,
    private readonly numbering: Map<string, Map<string, NumberingLevel>>,
  ) {}

  report(code: string, severity: Diagnostic['severity'], message: string, position: number): void {
    this.diagnostics.push({
      diagnostic: { code, severity, message: `${position}번째 문단 부근: ${message}` },
      position,
    });
  }
  container(element: Element): Entry[] {
    return children(element).flatMap((child) => this.convert(child));
  }
  convert(element: Element): Entry[] {
    if (is(element, ns.w, 'del') || is(element, ns.mc, 'Fallback')) return [];
    if (is(element, ns.mc, 'AlternateContent')) {
      const choice = children(element).find((child) => is(child, ns.mc, 'Choice'));
      return choice ? this.container(choice) : [];
    }
    if (is(element, ns.w, 'p')) return this.paragraph(element);
    if (is(element, ns.m, 'oMath') || is(element, ns.m, 'oMathPara')) {
      const position = ++this.position;
      const text = Array.from(element.getElementsByTagNameNS(ns.m, 't'))
        .map((part) => part.textContent ?? '')
        .join('');
      this.report(
        'MATH_FLATTENED',
        'warn',
        '수식을 선형 텍스트로 변환하여 수식 모양이 사라졌습니다. 미리보기에서 확인하고 필요하면 이미지로 바꾸세요.',
        position,
      );
      return [{ block: { type: 'paragraph', runs: [{ text }] }, position, text, boundary: false }];
    }
    if (is(element, ns.w, 'tbl')) {
      const position = Math.max(1, this.position + 1);
      const rows = children(element)
        .filter((child) => is(child, ns.w, 'tr'))
        .map((row) =>
          children(row)
            .filter((child) => is(child, ns.w, 'tc'))
            .map((cell) => this.container(cell).map((entry) => entry.block)),
        );
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
        const value = (this.counters.get(key) ?? level.start - 1) + 1;
        this.counters.set(key, value);
        if (
          ['decimalEnclosedCircle', 'decimalEnclosedCircleChinese', 'decimalEnclosedFcircle'].includes(
            level.numFmt,
          )
        ) {
          autoNumber = {
            value,
            label: level.lvlText.replace(/%[1-9]/g, () => circledNumber(value)) || circledNumber(value),
          };
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
      if (
        current.namespaceURI === ns.w &&
        ['del', 'delText', 'instrText', 'pPr', 'rPr'].includes(current.localName ?? '')
      )
        return;
      if (is(current, ns.mc, 'Fallback')) return;
      if (is(current, ns.mc, 'AlternateContent')) {
        const choice = children(current).find((child) => is(child, ns.mc, 'Choice'));
        if (choice) children(choice).forEach((child) => visit(child, style, dimensions));
        return;
      }
      if (is(current, ns.w, 'txbxContent')) {
        flush();
        blocks.push({ type: 'table', rows: [[this.container(current).map((entry) => entry.block)]] });
        this.report(
          'TEXTBOX_AS_TABLE',
          'info',
          '텍스트박스를 1×1 표로 변환했습니다. 미리보기에서 보기 상자를 확인하세요.',
          position,
        );
        return;
      }
      if (is(current, ns.w, 'drawing')) dimensions = first(current, ns.wp, 'extent');
      if (is(current, ns.a, 'blip') || is(current, ns.v, 'imagedata')) {
        flush();
        const id = current.getAttributeNS(ns.r, is(current, ns.a, 'blip') ? 'embed' : 'id') ?? '';
        const media = this.media.get(id);
        if (!media)
          this.report(
            'IMAGE_NOT_FOUND',
            'warn',
            `이미지 관계 ${id || '(없음)'}를 찾지 못했습니다. 원본 Word에 이미지를 다시 삽입하세요.`,
            position,
          );
        else {
          const sha256 = sha256Hex(media.bytes);
          const assetId = `asset-${sha256.slice(0, 16)}`;
          if (!this.assets.has(assetId))
            this.assets.set(assetId, {
              id: assetId,
              mime: media.mime,
              sha256,
              dataBase64: base64(media.bytes),
            });
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
        const text = Array.from(current.getElementsByTagNameNS(ns.m, 't'))
          .map((part) => part.textContent ?? '')
          .join('');
        if (text) runs.push({ ...style, text });
        this.report(
          'MATH_FLATTENED',
          'warn',
          '수식을 선형 텍스트로 변환하여 수식 모양이 사라졌습니다. 미리보기에서 확인하고 필요하면 이미지로 바꾸세요.',
          position,
        );
        return;
      }
      if (is(current, ns.w, 'r')) {
        style = { ...style };
        const properties = children(current).find((child) => is(child, ns.w, 'rPr'));
        for (const property of properties ? children(properties) : []) {
          const value = attr(property, 'val');
          if (is(property, ns.w, 'u'))
            style.underline = value !== 'none' && value !== '0' && value !== 'false';
          if (is(property, ns.w, 'b')) style.bold = value !== '0' && value !== 'false';
          if (is(property, ns.w, 'i')) style.italic = value !== '0' && value !== 'false';
          if (is(property, ns.w, 'vertAlign')) {
            style.superscript = value === 'superscript';
            style.subscript = value === 'subscript';
          }
        }
      }
      if (is(current, ns.w, 't')) {
        runs.push({ ...style, text: current.textContent ?? '' });
        return;
      }
      if (is(current, ns.w, 'tab')) {
        runs.push({ ...style, text: '\t' });
        return;
      }
      if (is(current, ns.w, 'br')) {
        if (attr(current, 'type') !== 'page') runs.push({ ...style, text: '\n' });
        return;
      }
      children(current).forEach((child) => visit(child, style, dimensions));
    };
    children(element).forEach((child) => visit(child));
    flush();
    const text = blocksToPlainText(blocks);
    if (numPr && !autoNumber && !/^\s*(?:\d+[.)]|[①-⑩])/.test(text)) {
      this.report(
        'AUTO_NUMBERING_IGNORED',
        'warn',
        '자동 번호 정의가 없거나 지원하는 원문자 형식이 아니어서 복원하지 않았습니다. Word에서 번호를 일반 텍스트로 바꾸세요.',
        position,
      );
    }
    const firstParagraph = blocks.findIndex((block) => block.type === 'paragraph');
    return blocks.map((block, index) => ({
      block,
      position,
      text: blocksToPlainText([block]),
      boundary: block.type === 'paragraph',
      autoNumber: index === firstParagraph ? autoNumber : undefined,
    }));
  }
}
