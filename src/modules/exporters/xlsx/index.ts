import ExcelJS from 'exceljs';
import type {
  Block,
  ExamHeader,
  ExamSnapshot,
  Exporter,
  ExportedFile,
  ExportPart,
  ImageBlock,
} from '../../../contracts/index';
import { createExportFileName } from '../../content-model/index';
import { describeExamHeader } from '../../render-html/index';
import { textHeight } from './text-layout';

const order: ExportPart[] = ['questions', 'answers', 'explanations'];
const sheetNames = { questions: '문제', answers: '정답표', explanations: '해설' };
const labels = Array.from('①②③④⑤⑥⑦⑧⑨⑩');

function richText(blocks: Block[], snapshot: ExamSnapshot): ExcelJS.RichText[] {
  return blocks.flatMap((block, index): ExcelJS.RichText[] => {
    const prefix = index ? [{ text: '\n' }] : [];
    if (block.type === 'image') {
      const asset = Object.hasOwn(snapshot.assets, block.assetId)
        ? snapshot.assets[block.assetId]
        : undefined;
      return [
        ...prefix,
        {
          text: !asset
            ? '[이미지 없음]'
            : ['image/png', 'image/jpeg', 'image/gif'].includes(asset.mime.toLowerCase())
              ? '[이미지]'
              : '[지원하지 않는 이미지]',
        },
      ];
    }
    if (block.type === 'paragraph')
      return [
        ...prefix,
        ...block.runs.map((run) => ({
          text: run.text,
          font: {
            name: '맑은 고딕',
            underline: run.underline,
            bold: run.bold,
            italic: run.italic,
            vertAlign: run.superscript
              ? ('superscript' as const)
              : run.subscript
                ? ('subscript' as const)
                : undefined,
          },
        })),
      ];
    return [
      ...prefix,
      ...block.rows.flatMap((row, rowIndex) => [
        ...(rowIndex ? [{ text: '\n' }] : []),
        ...row.flatMap((cell, cellIndex) => [
          ...(cellIndex ? [{ text: ' | ' }] : []),
          ...richText(cell, snapshot),
        ]),
      ]),
    ];
  });
}

function images(blocks: Block[]): ImageBlock[] {
  return blocks.flatMap((block): ImageBlock[] =>
    block.type === 'image'
      ? [block]
      : block.type === 'table'
        ? block.rows.flatMap((row) => row.flatMap(images))
        : [],
  );
}

function addImages(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  snapshot: ExamSnapshot,
  blocks: Block[],
  row: number,
  col: number,
  textHeight: number,
): () => void {
  let heightPx = textHeight;
  const placements: { id: number; offset: number; width: number; height: number }[] = [];
  for (const block of images(blocks)) {
    const asset = Object.hasOwn(snapshot.assets, block.assetId) ? snapshot.assets[block.assetId] : undefined;
    if (!asset) continue;
    const types = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' } as const;
    const extension = types[asset.mime.toLowerCase() as keyof typeof types];
    if (!extension) continue;
    const width = block.widthPx && Number.isFinite(block.widthPx) && block.widthPx > 0 ? block.widthPx : 200;
    const height =
      block.heightPx && Number.isFinite(block.heightPx) && block.heightPx > 0 ? block.heightPx : 150;
    const scale = Math.min(1, 300 / width);
    const id = workbook.addImage({ base64: asset.dataBase64, extension });
    placements.push({ id, offset: heightPx, width: width * scale, height: height * scale });
    heightPx += height * scale + 8;
  }
  if (placements.length)
    sheet.getRow(row).height = Math.min(409, Math.max(sheet.getRow(row).height ?? 18, heightPx * 0.75));
  return () => {
    for (const placement of placements) {
      // ExcelJS의 소수 행 좌표 환산은 실제 EMU와 달라서 원시 오프셋으로 이미지 간격을 보존한다.
      const anchor: ExcelJS.IAnchor = {
        col,
        row: row - 1,
        nativeCol: col,
        nativeRow: row - 1,
        nativeColOff: 0,
        nativeRowOff: Math.round(placement.offset * 9525),
      };
      sheet.addImage(placement.id, {
        tl: anchor,
        ext: { width: placement.width, height: placement.height },
        editAs: 'oneCell',
      });
    }
  };
}

function addSheet(
  workbook: ExcelJS.Workbook,
  snapshot: ExamSnapshot,
  part: ExportPart,
  header?: ExamHeader,
): void {
  const description = part === 'questions' && header ? describeExamHeader(snapshot, header) : undefined;
  const headingLines = description
    ? [snapshot.title, description.info, ...(description.candidate ? [description.candidate] : [])]
    : [];
  const headerRow = headingLines.length + 1;
  const sheet = workbook.addWorksheet(sheetNames[part], {
    views: [{ state: 'frozen', ySplit: headerRow }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${headerRow}:${headerRow}`,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 },
    },
  });
  const maxChoices = Math.max(0, ...snapshot.items.map((item) => item.choices.length));
  const headers =
    part === 'questions'
      ? ['번호', '학습목표', '예문', '문제', ...labels.slice(0, maxChoices), '정답']
      : part === 'answers'
        ? ['번호', '정답']
        : ['번호', '정답', '해설', '학습목표'];
  sheet.columns = headers.map((header, index) => ({
    header,
    width: index === 0 ? 8 : ['예문', '문제', '해설'].includes(header) ? 45 : 22,
  }));
  if (headingLines.length) {
    sheet.getRow(1).values = [];
    for (const [index, line] of headingLines.entries()) {
      const row = sheet.getRow(index + 1);
      row.getCell(1).value = line;
      sheet.mergeCells(row.number, 1, row.number, headers.length);
      row.getCell(1).font = { name: '맑은 고딕', size: index === 0 ? 16 : 10, bold: index === 0 };
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const width = sheet.columns.reduce((sum, column) => sum + (column.width ?? 22), 0);
      row.height = textHeight(line, width, index === 0 ? 16 : 10);
    }
    sheet.getRow(headerRow).values = headers;
  }
  sheet.getRow(headerRow).eachCell((cell) => {
    cell.font = { name: '맑은 고딕', bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E5EA' } };
  });
  for (const item of snapshot.items) {
    const answer = item.blank ? '—' : item.answerLabels.join(', ');
    const objective = item.blank ? '' : (item.objectiveCode ?? '미지정');
    const row = sheet.addRow(
      part === 'questions'
        ? [item.number, objective, '', '', ...Array.from({ length: maxChoices }, () => ''), answer]
        : part === 'answers'
          ? [item.number, answer]
          : [item.number, answer, '', objective],
    );
    const placeImages: (() => void)[] = [];
    const setBlocks = (col: number, blocks: Block[]): void => {
      const rich = richText(blocks, snapshot);
      row.getCell(col).value = { richText: rich };
      const height = textHeight(rich.map((run) => run.text).join(''), sheet.getColumn(col).width ?? 22);
      placeImages.push(addImages(workbook, sheet, snapshot, blocks, row.number, col - 1, height / 0.75 + 8));
    };
    if (item.blank) {
      row.getCell(part === 'questions' ? 4 : part === 'answers' ? 2 : 3).value =
        part === 'questions' ? '(출제 가능한 문제가 없어 비워 둔 번호입니다)' : '(비워 둔 번호)';
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } };
      });
    } else if (part === 'questions') {
      setBlocks(3, item.passage ?? []);
      setBlocks(4, item.stem);
      item.choices.forEach((choice, index) => {
        // 확정본 라벨을 열 위치로 대응시키므로 선지가 섞인 뒤에도 내용에 번호를 섞지 않는다.
        const column = labels.indexOf(choice.label);
        if (column !== index) throw new Error('선지 라벨이 위치와 다릅니다. 확정본을 다시 생성하세요.');
        setBlocks(5 + index, choice.content);
      });
    } else if (part === 'explanations') setBlocks(3, item.explanation);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: '맑은 고딕', size: 10 };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
    const textHeights = Array.from({ length: headers.length }, (_, index) => {
      const value = row.getCell(index + 1).value;
      const text =
        value && typeof value === 'object' && 'richText' in value
          ? value.richText.map((run) => run.text).join('')
          : String(value ?? '');
      return textHeight(text, sheet.getColumn(index + 1).width ?? 22);
    });
    row.height = Math.min(409, Math.max(row.height ?? 18, ...textHeights));
    placeImages.forEach((place) => place());
  }
  sheet.getRow(headerRow).alignment = { vertical: 'top', wrapText: true };
  sheet.getRow(headerRow).getCell(1).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  sheet.getRow(headerRow).height = 18;
}

export const xlsxExporter: Exporter = {
  kind: 'exporter',
  id: 'xlsx',
  label: 'Excel',
  extension: 'xlsx',
  async export(snapshots, options) {
    const parts = order.filter((part) => options.parts.includes(part));
    const used = new Set<string>();
    const result: ExportedFile[] = [];
    if (!parts.length) return result;
    for (const snapshot of snapshots)
      for (const group of options.combineParts ? [parts] : parts.map((part) => [part])) {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = '문제은행';
        try {
          group.forEach((part) => addSheet(workbook, snapshot, part, options.header));
          const part = options.combineParts ? 'combined' : group[0];
          result.push({
            fileName: createExportFileName(snapshot.title, part, 'xlsx', used),
            part,
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            data: new Uint8Array(await workbook.xlsx.writeBuffer()),
          });
        } catch (error: unknown) {
          throw new Error('Excel 변환에 실패했습니다. 이미지와 선지 라벨을 확인한 뒤 다시 시도하세요.', {
            cause: error,
          });
        }
      }
    return result;
  },
};
