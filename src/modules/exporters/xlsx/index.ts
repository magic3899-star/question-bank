import ExcelJS from 'exceljs';
import type {
  Block,
  ExamSnapshot,
  Exporter,
  ExportedFile,
  ExportPart,
  ImageBlock,
} from '../../../contracts/index';
import { createExportFileName } from '../../content-model/index';

const order: ExportPart[] = ['questions', 'answers', 'explanations'];
const sheetNames = { questions: '문제', answers: '정답표', explanations: '해설' };
const labels = Array.from('①②③④⑤⑥⑦⑧⑨⑩');

// Unicode 15.1 W/F와 한국어 Excel의 원문자는 줄 잘림을 막도록 두 칸을 확보한다.
const wideRanges: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x231a, 0x231b],
  [0x2329, 0x232a],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x2460, 0x24ff],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x2e99],
  [0x2e9b, 0x2ef3],
  [0x2f00, 0x2fd5],
  [0x2ff0, 0x303e],
  [0x3041, 0x3096],
  [0x3099, 0x30ff],
  [0x3105, 0x312f],
  [0x3131, 0x318e],
  [0x3190, 0x31e3],
  [0x31ef, 0x321e],
  [0x3220, 0x3247],
  [0x3250, 0x4dbf],
  [0x4e00, 0xa48c],
  [0xa490, 0xa4c6],
  [0xa960, 0xa97c],
  [0xac00, 0xd7a3],
  [0xf900, 0xfa6d],
  [0xfa70, 0xfad9],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe52],
  [0xfe54, 0xfe66],
  [0xfe68, 0xfe6b],
  [0xff01, 0xff60],
  [0xffe0, 0xffe6],
  [0x16fe0, 0x16fe4],
  [0x16ff0, 0x16ff1],
  [0x17000, 0x187f7],
  [0x18800, 0x18cd5],
  [0x18d00, 0x18d08],
  [0x1aff0, 0x1aff3],
  [0x1aff5, 0x1affb],
  [0x1affd, 0x1affe],
  [0x1b000, 0x1b122],
  [0x1b132, 0x1b132],
  [0x1b150, 0x1b152],
  [0x1b155, 0x1b155],
  [0x1b164, 0x1b167],
  [0x1b170, 0x1b2fb],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f200, 0x1f202],
  [0x1f210, 0x1f23b],
  [0x1f240, 0x1f248],
  [0x1f250, 0x1f251],
  [0x1f260, 0x1f265],
  [0x1f300, 0x1f320],
  [0x1f32d, 0x1f335],
  [0x1f337, 0x1f37c],
  [0x1f37e, 0x1f393],
  [0x1f3a0, 0x1f3ca],
  [0x1f3cf, 0x1f3d3],
  [0x1f3e0, 0x1f3f0],
  [0x1f3f4, 0x1f3f4],
  [0x1f3f8, 0x1f43e],
  [0x1f440, 0x1f440],
  [0x1f442, 0x1f4fc],
  [0x1f4ff, 0x1f53d],
  [0x1f54b, 0x1f54e],
  [0x1f550, 0x1f567],
  [0x1f57a, 0x1f57a],
  [0x1f595, 0x1f596],
  [0x1f5a4, 0x1f5a4],
  [0x1f5fb, 0x1f64f],
  [0x1f680, 0x1f6c5],
  [0x1f6cc, 0x1f6cc],
  [0x1f6d0, 0x1f6d2],
  [0x1f6d5, 0x1f6d7],
  [0x1f6dc, 0x1f6df],
  [0x1f6eb, 0x1f6ec],
  [0x1f6f4, 0x1f6fc],
  [0x1f7e0, 0x1f7eb],
  [0x1f7f0, 0x1f7f0],
  [0x1f90c, 0x1f93a],
  [0x1f93c, 0x1f945],
  [0x1f947, 0x1f9ff],
  [0x1fa70, 0x1fa7c],
  [0x1fa80, 0x1fa88],
  [0x1fa90, 0x1fabd],
  [0x1fabf, 0x1fac5],
  [0x1face, 0x1fadb],
  [0x1fae0, 0x1fae8],
  [0x1faf0, 0x1faf8],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b739],
  [0x2b740, 0x2b81d],
  [0x2b820, 0x2cea1],
  [0x2ceb0, 0x2ebe0],
  [0x2ebf0, 0x2ee5d],
  [0x2f800, 0x2fa1d],
  [0x30000, 0x3134a],
  [0x31350, 0x323af],
];
function displayWidth(char: string): number {
  const cp = char.codePointAt(0)!;
  return wideRanges.some(([start, end]) => cp >= start && cp <= end) ? 2 : 1;
}

function textHeight(text: string, width: number, fontSize = 10): number {
  const lines = text.split('\n').reduce((sum, line) => {
    const units = Array.from(line).reduce((total, char) => total + displayWidth(char), 0);
    return sum + Math.max(1, Math.ceil(units / Math.max(1, width - 2)));
  }, 0);
  return Math.max(18, lines * fontSize * 1.5 * 1.25);
}

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

function addSheet(workbook: ExcelJS.Workbook, snapshot: ExamSnapshot, part: ExportPart): void {
  const sheet = workbook.addWorksheet(sheetNames[part], {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1',
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
  sheet.getRow(1).eachCell((cell) => {
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
  sheet.getRow(1).alignment = { vertical: 'top', wrapText: true };
  sheet.getRow(1).getCell(1).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  sheet.getRow(1).height = 18;
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
          group.forEach((part) => addSheet(workbook, snapshot, part));
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
