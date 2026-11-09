import { extname, basename } from 'node:path';
import type { Question } from '../../../contracts/index';
import { blocksToPlainText, questionContentKey } from '../../../modules/content-model/index';
import { extractPdfLines, PdfReadError } from '../../../modules/importers/index';
import { buildWorkbookDraft, detectBook } from '../../../modules/workbook/index';
import type { WorkbookBook } from '../../../modules/workbook/index';
import type { ImportAnalyzeProgress, ImportOptions, ImportReview } from '../../shared/index';
import { readImportFile } from './import-file';

export type ReadPdfLines = (data: Uint8Array) => Promise<{ lines: string[]; pages: number }>;

export function workbookContentKey(question: Question): string {
  return JSON.stringify([
    questionContentKey(question),
    question.choices.map((choice) => blocksToPlainText(choice.content).replace(/\s+/gu, '')),
  ]);
}

export async function analyzeWorkbook(
  paths: unknown[],
  options: ImportOptions,
  readPdfLines: ReadPdfLines = extractPdfLines,
  onProgress?: (progress: ImportAnalyzeProgress) => void,
) {
  for (const path of paths) {
    if (typeof path === 'string' && extname(path).toLowerCase() !== '.pdf')
      throw new Error(`문제집·정답집 가져오기는 PDF 파일만 고를 수 있습니다: ${basename(path)}`);
  }
  const files: ImportReview['files'] = [];
  const questionBooks: WorkbookBook[] = [];
  const answerBooks: WorkbookBook[] = [];
  for (const path of paths) {
    const file = await readImportFile(path);
    const progress = (done: number) =>
      onProgress?.({ file: file.fileName, label: '글자 읽는 중', done, total: 1 });
    progress(0);
    let lines: string[];
    try {
      ({ lines } = await readPdfLines(file.data));
    } catch (cause) {
      throw new Error(
        `${file.fileName}: ${cause instanceof PdfReadError ? cause.message : 'PDF 글자를 읽지 못했습니다. 파일을 확인한 뒤 다시 고르세요.'}`,
        { cause },
      );
    }
    progress(1);
    const kind = detectBook(lines);
    if (kind === 'unknown')
      throw new Error(
        `${file.fileName}은 문제집도 정답집도 아닌 것 같습니다. '001 〉〉〉 정답 ③' 형태의 정답집과 번호·선지가 있는 문제집 PDF 를 고르세요.`,
      );
    const book = { name: file.fileName, lines };
    (kind === 'questions' ? questionBooks : answerBooks).push(book);
    files.push({
      name: `${file.fileName} (${kind === 'questions' ? '문제집' : '정답집'})`,
      questions: 0,
      skipped: 0,
    });
  }
  if (!questionBooks.length)
    throw new Error('문제집 PDF 도 함께 고르세요. 번호·선지가 있는 문제집과 정답집이 모두 필요합니다.');
  if (!answerBooks.length)
    throw new Error('정답집 PDF 도 함께 고르세요. 문제와 같은 과목·번호의 정답·해설이 필요합니다.');
  const draft = buildWorkbookDraft(
    { questionBooks, answerBooks },
    {
      requireObjective: options.requireObjective,
      lockChoicesOnReference: options.lockChoicesOnReference,
    },
  );
  const counts = new Map<string, number>();
  for (const item of draft.questions) {
    const source: unknown = item.question.extra.workbook;
    if (
      source &&
      typeof source === 'object' &&
      'questionBook' in source &&
      typeof source.questionBook === 'string'
    )
      counts.set(source.questionBook, (counts.get(source.questionBook) ?? 0) + 1);
  }
  for (const book of questionBooks) {
    const file = files.find((item) => item.name === `${book.name} (문제집)`)!;
    file.questions = counts.get(book.name) ?? 0;
    file.skipped = draft.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code.startsWith('SKIPPED_') && diagnostic.message.startsWith(`${book.name} `),
    ).length;
  }
  return { parsed: [{ name: '문제집·정답집', draft }], files };
}
