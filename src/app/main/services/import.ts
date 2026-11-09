import { randomUUID } from 'node:crypto';

import { extname } from 'node:path';
import type { ImportDraft, Question } from '../../../contracts/index';
import { createRegistry } from '../../../core/registry/index';

import { createImporters } from '../../../modules/importers/index';
import type { OcrRecognize } from '../../../modules/importers/index';
import type { Storage } from '../../../modules/storage/index';
import type { ImportAnalyzeProgress, ImportCommitResult, ImportReview } from '../../shared/index';
import { WORKBOOK_SUBJECT } from '../../shared/index';
import { readImportFile } from './import-file';
import { buildImportReview } from './import-analysis';
import { analyzeWorkbook } from './import-workbook';
import type { ReadPdfLines } from './import-workbook';
import {
  questionAssetIds,
  diagnosticsByIndex,
  validateOptions,
  validatePatches,
  validateQuestions,
} from './import-review';

export function createImportService(
  storage: Storage,
  deps: {
    now: () => string;
    pickFiles: () => Promise<string[]>;
    id?: () => string;
    ocr?: OcrRecognize;
    readPdfLines?: ReadPdfLines;
    ensureSubjects?: (ids: string[]) => Promise<string[] | void>;
  },
) {
  const registry = createRegistry();
  for (const importer of createImporters({ ocr: deps.ocr })) registry.register(importer);
  const batches = new Map<string, { review: ImportReview; busy: boolean }>();
  const id = deps.id ?? randomUUID;
  const batch = (value: unknown) => {
    if (typeof value !== 'string' || !batches.has(value))
      throw new Error('분석 결과가 없거나 이미 처리되었습니다. 파일을 다시 분석하세요.');
    const found = batches.get(value)!;
    if (found.busy) throw new Error('이 가져오기 묶음을 저장 중입니다. 완료될 때까지 기다리세요.');
    return found;
  };
  return {
    pickFiles: deps.pickFiles,
    async analyze(
      value: unknown,
      onProgress?: (progress: ImportAnalyzeProgress) => void,
    ): Promise<ImportReview> {
      if (!value || typeof value !== 'object') throw new Error('가져올 파일과 과목을 선택하세요.');
      const input = value as Record<string, unknown>;
      const options = validateOptions(input.options);
      if (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 100)
        throw new Error('가져올 파일을 1~100개 선택하세요.');
      const parsed: { name: string; draft: ImportDraft }[] = [];
      const workbook =
        options.subject === WORKBOOK_SUBJECT
          ? await analyzeWorkbook(input.paths, options, deps.readPdfLines, onProgress)
          : undefined;
      if (workbook) parsed.push(...workbook.parsed);
      for (const path of workbook ? [] : input.paths) {
        const file = await readImportFile(path);
        const importer = registry
          .all('importer')
          .find((p) => p.extensions.includes(extname(file.fileName).toLowerCase()))!;
        parsed.push({
          name: file.fileName,
          draft: await importer.parse(file, {
            ...options,
            onProgress: (progress: Omit<ImportAnalyzeProgress, 'file'>) =>
              onProgress?.({ file: file.fileName, ...progress }),
          }),
        });
      }
      const batchId = id();
      const review = await buildImportReview(storage, batchId, parsed, options, workbook?.files);
      batches.set(batchId, { review, busy: false });
      return structuredClone(review);
    },
    async commit(value: unknown): Promise<ImportCommitResult> {
      if (!value || typeof value !== 'object') throw new Error('저장할 분석 결과를 선택하세요.');
      const input = value as Record<string, unknown>;
      const found = batch(input.batchId);
      const patches = validatePatches(input.patches, found.review.items.length);
      found.busy = true;
      try {
        const items = structuredClone(found.review.items);
        const included = new Map(items.map((item) => [item.index, item.status !== 'excluded']));
        patches.forEach((p) => {
          const q = items[p.index]!.draft;
          if (p.include !== undefined) included.set(p.index, p.include);
          if (p.objectiveCode !== undefined) q.objectiveCode = p.objectiveCode.trim() || undefined;
          if (p.grade !== undefined) q.grade = p.grade.trim() || undefined;
          if (p.shufflePolicy !== undefined) q.shufflePolicy = p.shufflePolicy;
        });
        const validation = validateQuestions(items.map((item) => item.draft));
        const errorsByIndex = diagnosticsByIndex(
          validation.filter((diagnostic) => diagnostic.severity === 'error'),
        );
        const result: ImportCommitResult = { saved: 0, savedIds: [], notSaved: [] };
        const questions: Question[] = [];
        const time = Date.parse(deps.now());
        if (!Number.isFinite(time))
          throw new Error('저장 시각을 확인할 수 없습니다. 프로그램을 다시 실행하세요.');
        for (const item of items) {
          const errors = errorsByIndex.get(item.index) ?? [];
          if (!included.get(item.index) || errors.length) {
            result.notSaved.push({
              index: item.index,
              reason: !included.get(item.index)
                ? '검수에서 제외한 문제입니다.'
                : errors.map((d) => d.message).join(' '),
            });
            continue;
          }
          const stamp = new Date(time + item.index).toISOString();
          questions.push({
            ...item.draft,
            id: id(),
            createdAt: stamp,
            updatedAt: stamp,
            extra: { ...item.draft.extra, importBatchId: found.review.batchId },
          });
        }
        if (questions.length && deps.ensureSubjects) {
          const added = await deps.ensureSubjects([
            ...new Set(questions.map((question) => question.subject)),
          ]);
          if (added?.length) result.newSubjects = added;
        }
        const used = new Set(questions.flatMap(questionAssetIds));
        for (const assetId of used) {
          const asset = found.review.assets[assetId];
          if (asset) await storage.assets.put(asset);
        }
        await storage.questions.upsertMany(questions);
        result.savedIds = questions.map((q) => q.id);
        result.saved = questions.length;
        batches.delete(found.review.batchId);
        return result;
      } finally {
        found.busy = false;
      }
    },
    discard(value: unknown): void {
      const found = batch(value);
      batches.delete(found.review.batchId);
    },
  };
}
