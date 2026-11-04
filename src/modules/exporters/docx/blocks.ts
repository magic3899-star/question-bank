import {
  BorderStyle,
  CarriageReturn,
  ImageRun,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import type { ParagraphChild } from 'docx';
import type { Block, ExamSnapshot, InlineRun } from '../../../contracts/index';

export function runChildren(run: InlineRun): TextRun[] {
  const style = {
    bold: run.bold,
    italics: run.italic,
    superScript: run.superscript,
    subScript: run.subscript,
    underline: run.underline ? { type: UnderlineType.SINGLE } : undefined,
  };
  // 하나의 서식 run 안에서 줄바꿈과 탭을 표현해야 밑줄 run 수가 달라지지 않는다.
  return [
    new TextRun({
      ...style,
      children: run.text
        .split(/([\n\t])/u)
        .map((text) => (text === '\n' ? new CarriageReturn() : text === '\t' ? new Tab() : text)),
    }),
  ];
}

export function blocksToDocx(
  blocks: Block[],
  snapshot: ExamSnapshot,
  maxWidth = 300,
  keepNextLast = true,
): (Paragraph | Table)[] {
  return blocks.map((block, index): Paragraph | Table => {
    const keepNext = index < blocks.length - 1 || keepNextLast;
    const paragraph = (children: ParagraphChild[]): Paragraph =>
      new Paragraph({ keepLines: true, keepNext, children });
    if (block.type === 'paragraph') return paragraph(block.runs.flatMap(runChildren));
    if (block.type === 'table')
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: (block.rows.length ? block.rows : [[[]]]).map(
          (row, rowIndex, rows) =>
            new TableRow({
              cantSplit: true,
              children: (row.length ? row : [[]]).map((cell, col, cells) => {
                const cellKeepNext = keepNext || rowIndex < rows.length - 1 || col < cells.length - 1;
                const needsEndParagraph = cell.at(-1)?.type !== 'paragraph';
                const children = blocksToDocx(
                  cell,
                  snapshot,
                  maxWidth / Math.max(row.length, 1),
                  needsEndParagraph || cellKeepNext,
                );
                if (needsEndParagraph)
                  children.push(new Paragraph({ keepLines: true, keepNext: cellKeepNext }));
                return new TableCell({
                  children,
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                  borders: Object.fromEntries(
                    ['top', 'bottom', 'left', 'right'].map((side) => [
                      side,
                      { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    ]),
                  ),
                });
              }),
            }),
        ),
      });
    const asset = Object.hasOwn(snapshot.assets, block.assetId) ? snapshot.assets[block.assetId] : undefined;
    if (!asset) return paragraph([new TextRun('[이미지 없음]')]);
    const types = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
    } as const;
    const type = types[asset.mime.toLowerCase() as keyof typeof types];
    if (!type) return paragraph([new TextRun('[지원하지 않는 이미지]')]);
    const width = block.widthPx && block.widthPx > 0 && Number.isFinite(block.widthPx) ? block.widthPx : 200;
    const height =
      block.heightPx && block.heightPx > 0 && Number.isFinite(block.heightPx) ? block.heightPx : 150;
    const scale = Math.min(1, maxWidth / width);
    const image: ParagraphChild = new ImageRun({
      type,
      data: Uint8Array.from(atob(asset.dataBase64), (c) => c.charCodeAt(0)),
      transformation: { width: width * scale, height: height * scale },
      altText: { title: block.alt ?? '', description: block.alt ?? '', name: block.assetId },
    });
    return paragraph([image]);
  });
}
