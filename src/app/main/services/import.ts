import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import type { Diagnostic, ImportDraft, Question } from '../../../contracts/index';
import { createRegistry } from '../../../core/registry/index';
import { questionContentKey } from '../../../modules/content-model/index';
import { docxImporter, textImporter } from '../../../modules/importers/index';
import type { Storage } from '../../../modules/storage/index';
import type { ImportCommitResult, ImportReview } from '../../shared/index';
import {
  questionAssetIds,
  reviewItem,
  updateCounts,
  validateOptions,
  validatePatches,
  validateQuestions,
} from './import-review';

const MAX_BYTES = 50 * 1024 * 1024;
async function readImportFile(path: unknown): Promise<{ fileName: string; data: Uint8Array }> {
  if (typeof path !== 'string' || !isAbsolute(path) || path.startsWith('\\\\') || path.includes('\0'))
    throw new Error('파일 경로가 올바르지 않습니다. 이 PC의 Word 또는 텍스트 파일을 다시 선택하세요.');
  if (!['.docx', '.txt'].includes(extname(path).toLowerCase()))
    throw new Error('지원하지 않는 확장자입니다. .docx 또는 .txt 파일을 선택하세요.');
  let handle;
  try {
    handle = await open(path, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('파일이 아닙니다. Word 또는 텍스트 파일을 선택하세요.');
    if (stat.size > MAX_BYTES) throw new Error('파일이 50MB를 넘습니다. 문서를 나눈 뒤 다시 가져오세요.');
    const data = await handle.readFile();
    if (data.byteLength > MAX_BYTES)
      throw new Error('파일이 50MB를 넘습니다. 문서를 나눈 뒤 다시 가져오세요.');
    return { fileName: basename(path), data };
  } catch (cause) {
    if (cause instanceof Error && /[가-힣]/u.test(cause.message)) throw cause;
    throw new Error('파일이 없거나 읽을 수 없습니다. 경로와 접근 권한을 확인한 뒤 다시 선택하세요.');
  } finally {
    await handle?.close();
  }
}
export function createImportService(
  storage: Storage,
  deps: { now: () => string; pickFiles: () => Promise<string[]>; id?: () => string },
) {
  const registry = createRegistry();
  registry.register(docxImporter);
  registry.register(textImporter);
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
    async analyze(value: unknown): Promise<ImportReview> {
      if (!value || typeof value !== 'object') throw new Error('가져올 파일과 과목을 선택하세요.');
      const input = value as Record<string, unknown>;
      const options = validateOptions(input.options);
      if (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 100)
        throw new Error('가져올 파일을 1~100개 선택하세요.');
      const parsed: { name: string; draft: ImportDraft }[] = [];
      for (const path of input.paths) {
        const file = await readImportFile(path);
        const importer = registry
          .all('importer')
          .find((p) => p.extensions.includes(extname(file.fileName).toLowerCase()))!;
        parsed.push({ name: file.fileName, draft: await importer.parse(file, { ...options }) });
      }
      const batchId = id();
      const review: ImportReview = {
        batchId,
        files: [],
        items: [],
        skipped: [],
        diagnostics: [],
        assets: {},
        counts: { ok: 0, warn: 0, error: 0, excluded: 0 },
      };
      const existing = await storage.questions.query({ subject: options.subject });
      const passages = new Map(existing.map((q) => [questionContentKey(q), q]));
      const earlier = new Map<string, string>();
      for (const { name, draft } of parsed) {
        const skipped = draft.diagnostics.filter((d) => d.code.startsWith('SKIPPED_'));
        review.files.push({ name, questions: draft.questions.length, skipped: skipped.length });
        review.skipped.push(...skipped);
        const base = review.items.length;
        review.diagnostics.push(
          ...draft.diagnostics
            .filter((d) => !d.code.startsWith('SKIPPED_') && d.ref?.draftIndex === undefined)
            .map((d) => ({ ...d, message: `${name}: ${d.message}` })),
        );
        draft.questions.forEach((item, localIndex) => {
          const index = base + localIndex;
          const question: Question = {
            ...item.question,
            id: `review-${batchId}-${index}`,
            createdAt: '',
            updatedAt: '',
          };
          const diagnostics: Diagnostic[] = draft.diagnostics
            .filter((d) => d.ref?.draftIndex === localIndex)
            .map((d) => ({ ...d, ref: { draftIndex: index } }));
          const key = questionContentKey(question);
          const duplicate = passages.get(key);
          const prior = earlier.get(key);
          let excludedReason: string | undefined;
          if (duplicate) {
            const message = `은행의 문제 ${duplicate.id}(학습목표: ${duplicate.objectiveCode || '없음'})와 지문이 같습니다. 기존 문제를 확인하고 필요한 경우에만 포함하세요.`;
            diagnostics.push({
              code: 'DUPLICATE_IN_BANK',
              severity: 'warn',
              message,
              ref: { draftIndex: index, questionId: duplicate.id },
            });
            excludedReason = message;
          } else if (prior && options.dedupeByPassage !== false) {
            excludedReason = `앞 파일의 ${prior}와 지문이 같아 제외했습니다. 같은 지문은 첫 문제만 가져옵니다.`;
            diagnostics.push({
              code: 'DUPLICATE_IN_BATCH',
              severity: 'warn',
              message: excludedReason,
              ref: { draftIndex: index },
            });
          }
          if (!earlier.has(key)) earlier.set(key, item.sourceLocation ?? name);
          review.items.push(
            reviewItem(question, index, item.sourceLocation ?? name, diagnostics, excludedReason),
          );
        });
        draft.assets.forEach((asset) => {
          review.assets[asset.id] = asset;
        });
      }
      const diagnostics = validateQuestions(review.items.map((item) => item.draft));
      review.items = review.items.map((item) =>
        reviewItem(
          item.draft,
          item.index,
          item.sourceLocation,
          [...item.diagnostics, ...diagnostics.filter((d) => d.ref?.draftIndex === item.index)],
          item.excludedReason,
        ),
      );
      review.diagnostics.push(...diagnostics.filter((d) => d.ref?.draftIndex === undefined));
      updateCounts(review);
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
        const result: ImportCommitResult = { saved: 0, savedIds: [], notSaved: [] };
        const questions: Question[] = [];
        const time = Date.parse(deps.now());
        if (!Number.isFinite(time))
          throw new Error('저장 시각을 확인할 수 없습니다. 프로그램을 다시 실행하세요.');
        for (const item of items) {
          const errors = validation.filter((d) => d.ref?.draftIndex === item.index && d.severity === 'error');
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
