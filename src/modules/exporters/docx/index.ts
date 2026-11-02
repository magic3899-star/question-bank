import {
  AlignmentType, BorderStyle, CarriageReturn, Document, ImageRun, Packer, Paragraph, SectionType,
  Tab, Table, TableCell, TableRow, TextRun, UnderlineType, WidthType,
} from 'docx';
import type { ISectionOptions, ParagraphChild } from 'docx';
import type { Block, ExamSnapshot, Exporter, ExportedFile, ExportPart, InlineRun } from '../../../contracts/index';
import { createExportFileName } from '../../content-model/index';

const names: Record<ExportPart, string> = { questions: '문제지', answers: '정답지', explanations: '해설지' };
const order: ExportPart[] = ['questions', 'answers', 'explanations'];
const blankText = '(출제 가능한 문제가 없어 비워 둔 번호입니다)';
const p = (text: string, bold = false): Paragraph => new Paragraph({ keepLines: true, children: [new TextRun({ text, bold })] });

function runChildren(run: InlineRun): TextRun[] {
  const style = { bold: run.bold, italics: run.italic, superScript: run.superscript,
    subScript: run.subscript, underline: run.underline ? { type: UnderlineType.SINGLE } : undefined };
  // 하나의 서식 run 안에서 줄바꿈과 탭을 표현해야 밑줄 run 수가 달라지지 않는다.
  return [new TextRun({ ...style, children: run.text.split(/([\n\t])/u).map((text) =>
    text === '\n' ? new CarriageReturn() : text === '\t' ? new Tab() : text) })];
}

function blocksToDocx(blocks: Block[], snapshot: ExamSnapshot, maxWidth = 300, keepNextLast = true): (Paragraph | Table)[] {
  return blocks.map((block, index): Paragraph | Table => {
    const keepNext = index < blocks.length - 1 || keepNextLast;
    const paragraph = (children: ParagraphChild[]): Paragraph => new Paragraph({ keepLines: true, keepNext, children });
    if (block.type === 'paragraph') return paragraph(block.runs.flatMap(runChildren));
    if (block.type === 'table') return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: (block.rows.length ? block.rows : [[[]]]).map((row, rowIndex, rows) => new TableRow({ cantSplit: true, children: (row.length ? row : [[]]).map((cell, col, cells) => {
        const cellKeepNext = keepNext || rowIndex < rows.length - 1 || col < cells.length - 1;
        const needsEndParagraph = cell.at(-1)?.type !== 'paragraph';
        const children = blocksToDocx(cell, snapshot, maxWidth / Math.max(row.length, 1), needsEndParagraph || cellKeepNext);
        if (needsEndParagraph) children.push(new Paragraph({ keepLines: true, keepNext: cellKeepNext }));
        return new TableCell({ children, margins: { top: 100, bottom: 100, left: 100, right: 100 },
          borders: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [side, { style: BorderStyle.SINGLE, size: 4, color: '000000' }])) });
      }) })),
    });
    const asset = Object.hasOwn(snapshot.assets, block.assetId) ? snapshot.assets[block.assetId] : undefined;
    if (!asset) return paragraph([new TextRun('[이미지 없음]')]);
    const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' } as const;
    const type = types[asset.mime.toLowerCase() as keyof typeof types];
    if (!type) return paragraph([new TextRun('[지원하지 않는 이미지]')]);
    const width = block.widthPx && block.widthPx > 0 && Number.isFinite(block.widthPx) ? block.widthPx : 200;
    const height = block.heightPx && block.heightPx > 0 && Number.isFinite(block.heightPx) ? block.heightPx : 150;
    const scale = Math.min(1, maxWidth / width);
    const image: ParagraphChild = new ImageRun({ type, data: Uint8Array.from(atob(asset.dataBase64), (c) => c.charCodeAt(0)),
      transformation: { width: width * scale, height: height * scale },
      altText: { title: block.alt ?? '', description: block.alt ?? '', name: block.assetId } });
    return paragraph([image]);
  });
}

function sections(snapshot: ExamSnapshot, part: ExportPart): ISectionOptions[] {
  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1020, bottom: 1020, left: 1020, right: 1020 } };
  const title = new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${snapshot.title} ${names[part]}`, font: '맑은 고딕', bold: true, size: 32 })] });
  const children: (Paragraph | Table)[] = [];
  for (const item of snapshot.items) {
    if (part === 'questions') {
      const firstStem = item.blank ? undefined : item.stem[0];
      const restStem = firstStem?.type === 'paragraph' ? item.stem.slice(1) : item.stem;
      const passage = item.passage ?? [];
      const numberWidth = String(item.number).length * 110 + 170;
      children.push(new Paragraph({ keepLines: true, keepNext: Boolean(item.blank || restStem.length || passage.length || item.choices.length), spacing: { before: 160 },
        indent: { left: numberWidth, hanging: numberWidth }, children: [new TextRun({ text: `${item.number}. `, bold: true }),
          ...(firstStem?.type === 'paragraph' ? firstStem.runs.flatMap(runChildren) : [])] }));
      if (item.blank) children.push(new Paragraph({ keepLines: true, text: blankText, border: {
        top: { style: BorderStyle.DASHED, size: 4 }, bottom: { style: BorderStyle.DASHED, size: 4 },
        left: { style: BorderStyle.DASHED, size: 4 }, right: { style: BorderStyle.DASHED, size: 4 },
      } }));
      else {
        children.push(...blocksToDocx(restStem, snapshot, 300, Boolean(passage.length || item.choices.length)),
          ...blocksToDocx(passage, snapshot, 300, item.choices.length > 0));
        for (const [index, choice] of item.choices.entries()) {
          const first = choice.content[0];
          const rest = first?.type === 'paragraph' ? choice.content.slice(1) : choice.content;
          const lastChoice = index === item.choices.length - 1;
          children.push(new Paragraph({ keepLines: true, keepNext: !lastChoice || rest.length > 0, indent: { left: 280, hanging: 280 }, children: [
            new TextRun({ text: `${choice.label} `, bold: true }),
            ...(first?.type === 'paragraph' ? first.runs.flatMap(runChildren) : []),
          ] }), ...blocksToDocx(rest, snapshot, 300, !lastChoice));
        }
      }
    } else if (part === 'explanations') {
      children.push(p(`${item.number}. 정답: ${item.blank ? '—' : item.answerLabels.join(', ')}`, true)
        .with({ spacing: { before: 160 }, keepNext: true }));
      if (item.blank) children.push(p('비워 둔 번호입니다.'));
      else children.push(...blocksToDocx(item.explanation, snapshot), p(`학습목표: ${item.objectiveCode ?? '미지정'}`));
    }
  }
  if (part === 'answers') {
    const rows: TableRow[] = [];
    const cell = (text: string, header = false): TableCell => new TableCell({
      children: [p(text, header).with({ alignment: AlignmentType.CENTER })],
      ...(header ? { shading: { fill: 'F0F2F5' } } : {}), verticalAlign: 'center',
    });
    if (snapshot.items.length) rows.push(new TableRow({ tableHeader: true, cantSplit: true,
      children: Array.from({ length: 5 }, () => [cell('번호', true), cell('정답', true)]).flat() }));
    for (let index = 0; index < snapshot.items.length; index += 5) {
      const cells = snapshot.items.slice(index, index + 5).flatMap((item) => [
        cell(String(item.number)),
        cell(item.blank ? '—' : item.answerLabels.join(', ')),
      ]);
      while (cells.length < 10) cells.push(cell(''));
      rows.push(new TableRow({ cantSplit: true, children: cells }));
    }
    if (rows.length) children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
  }
  if (part === 'questions') return [
    { properties: { page, type: SectionType.NEXT_PAGE }, children: [title, p('성명: ____________________　점수: __________')] },
    { properties: { page, type: SectionType.CONTINUOUS, column: { count: 2, space: 340, separate: true } }, children: children.length ? children : [p('문항이 없습니다.')] },
  ];
  return [{ properties: { page, type: SectionType.NEXT_PAGE, column: { count: 1 } }, children: [title, ...children] }];
}

export const docxExporter: Exporter = {
  kind: 'exporter', id: 'docx', label: 'Word', extension: 'docx',
  async export(snapshots, options) {
    const parts = order.filter((part) => options.parts.includes(part));
    const used = new Set<string>();
    const result: ExportedFile[] = [];
    if (!parts.length) return result;
    for (const snapshot of snapshots) for (const group of options.combineParts ? [parts] : parts.map((part) => [part])) {
      const part = options.combineParts ? 'combined' : group[0];
      try {
        const document = new Document({ title: snapshot.title, creator: '문제은행',
          styles: { default: { document: { run: { font: { eastAsia: '바탕', ascii: 'Batang', hAnsi: 'Batang', cs: 'Batang' }, size: 20 } } } },
          sections: group.flatMap((entry) => sections(snapshot, entry)) });
        result.push({ fileName: createExportFileName(snapshot.title, part, 'docx', used), part,
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: await Packer.toBuffer(document) });
      } catch (error: unknown) {
        throw new Error('Word 변환에 실패했습니다. 이미지와 문항 내용을 확인한 뒤 다시 시도하세요.', { cause: error });
      }
    }
    return result;
  },
};
