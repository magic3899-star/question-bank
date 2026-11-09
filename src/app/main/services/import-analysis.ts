import type { Diagnostic, ImportDraft, Question } from '../../../contracts/index';
import { questionContentKey } from '../../../modules/content-model/index';
import type { Storage } from '../../../modules/storage/index';
import { WORKBOOK_SUBJECT } from '../../shared/index';
import type { ImportOptions, ImportReview } from '../../shared/index';
import { diagnosticsByIndex, reviewItem, updateCounts, validateQuestions } from './import-review';
import { workbookContentKey } from './import-workbook';

export interface ParsedImport {
  name: string;
  draft: ImportDraft;
}
export async function buildImportReview(
  storage: Storage,
  batchId: string,
  parsed: ParsedImport[],
  options: ImportOptions,
  files?: ImportReview['files'],
): Promise<ImportReview> {
  const auto = options.subject === WORKBOOK_SUBJECT;
  const contentKey = auto ? workbookContentKey : questionContentKey;
  const review: ImportReview = {
    batchId,
    files: [],
    items: [],
    skipped: [],
    diagnostics: [],
    assets: {},
    counts: { ok: 0, warn: 0, error: 0, excluded: 0 },
  };
  const existing = await storage.questions.query(auto ? {} : { subject: options.subject });
  const passages = new Map(existing.map((q) => [contentKey(q), q]));
  const earlier = new Map<string, string>();
  for (const { name, draft } of parsed) {
    const byIndex = diagnosticsByIndex(draft.diagnostics);
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
      const diagnostics: Diagnostic[] = (byIndex.get(localIndex) ?? []).map((d) => ({
        ...d,
        ref: { draftIndex: index },
      }));
      const key = contentKey(question);
      const duplicate = passages.get(key);
      const prior = earlier.get(key);
      let excludedReason: string | undefined;
      if (duplicate) {
        const message = `은행의 문제 ${duplicate.id}(학습목표: ${duplicate.objectiveCode || '없음'})와 ${auto ? '지문과 선지가' : '지문이'} 같습니다. 기존 문제를 확인하고 필요한 경우에만 포함하세요.`;
        diagnostics.push({
          code: 'DUPLICATE_IN_BANK',
          severity: 'warn',
          message,
          ref: { draftIndex: index, questionId: duplicate.id },
        });
        excludedReason = message;
      } else if (prior && (auto || options.dedupeByPassage !== false)) {
        excludedReason = `앞 파일의 ${prior}와 ${auto ? '지문과 선지가' : '지문이'} 같아 제외했습니다. ${auto ? '같은 지문과 선지는' : '같은 지문은'} 첫 문제만 가져옵니다.`;
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
  const byIndex = diagnosticsByIndex(diagnostics);
  review.items = review.items.map((item) =>
    reviewItem(
      item.draft,
      item.index,
      item.sourceLocation,
      [...item.diagnostics, ...(byIndex.get(item.index) ?? [])],
      item.excludedReason,
    ),
  );
  review.diagnostics.push(...diagnostics.filter((d) => d.ref?.draftIndex === undefined));
  updateCounts(review);

  if (files) review.files = files;
  return review;
}
