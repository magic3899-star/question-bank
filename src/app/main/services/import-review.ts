import type { Diagnostic, Question } from '../../../contracts/index';
import { blocksToPlainText, collectAssetIds } from '../../../modules/content-model/index';
import { runValidators, standardValidators } from '../../../modules/validators/index';
import { parseObjectiveCode } from '../../../modules/objective-code/index';
import type { ImportItem, ImportOptions, ImportPatch, ImportReview } from '../../shared/index';

export function questionAssetIds(q: Question): string[] {
  return collectAssetIds([
    ...q.stem,
    ...(q.passage ?? []),
    ...q.explanation,
    ...q.choices.flatMap((c) => c.content),
  ]);
}
export function reviewItem(
  question: Question,
  index: number,
  sourceLocation: string,
  diagnostics: Diagnostic[],
  excludedReason?: string,
): ImportItem {
  return {
    index,
    sourceLocation,
    diagnostics,
    excludedReason,
    draft: question,
    status: excludedReason
      ? 'excluded'
      : diagnostics.some((d) => d.severity === 'error')
        ? 'error'
        : diagnostics.some((d) => d.severity === 'warn')
          ? 'warn'
          : 'ok',
    summary: {
      id: question.id,
      subject: question.subject,
      objectiveCode: question.objectiveCode,
      grade: question.grade,
      stemPreview: Array.from(blocksToPlainText(question.stem)).slice(0, 80).join(''),
      hasImage: questionAssetIds(question).length > 0,
      hasPassage: !!question.passage?.length,
      choiceCount: question.choices.length,
      warnings: diagnostics.filter((d) => d.severity !== 'info').length,
    },
  };
}
export function validateQuestions(questions: Question[]): Diagnostic[] {
  const diagnostics = runValidators(standardValidators, questions);
  questions.forEach((q, index) => {
    if (q.objectiveCode?.trim() && !parseObjectiveCode(q.objectiveCode))
      diagnostics.push({
        code: 'OBJECTIVE_FORMAT_INVALID',
        severity: 'error',
        message: '학습목표를 읽을 수 없습니다. 과목명과 숫자 구간으로 입력하세요. 예: 법규 1-1-3',
        ref: { draftIndex: index },
      });
  });
  return diagnostics;
}
export function diagnosticsByIndex(diagnostics: Diagnostic[]): Map<number, Diagnostic[]> {
  const grouped = new Map<number, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const index = diagnostic.ref?.draftIndex;
    if (index === undefined) continue;
    const group = grouped.get(index);
    if (group) group.push(diagnostic);
    else grouped.set(index, [diagnostic]);
  }
  return grouped;
}
export function updateCounts(review: ImportReview): void {
  review.counts = { ok: 0, warn: 0, error: 0, excluded: 0 };
  review.items.forEach((item) => review.counts[item.status]++);
}
export function validateOptions(value: unknown): ImportOptions {
  if (!value || typeof value !== 'object')
    throw new Error('가져오기 옵션이 없습니다. 과목과 옵션을 선택하세요.');
  const options = value as Record<string, unknown>;
  if (typeof options.subject !== 'string' || !options.subject.trim() || options.subject.length > 1000)
    throw new Error('과목이 없습니다. 가져올 과목을 선택하세요.');
  for (const key of ['requireObjective', 'dedupeByPassage', 'lockChoicesOnReference', 'pdfCopyCleanup']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean')
      throw new Error('가져오기 옵션이 올바르지 않습니다. 체크 항목을 다시 선택하세요.');
  }
  if (
    options.includeGrades !== undefined &&
    options.includeGrades !== null &&
    (!Array.isArray(options.includeGrades) || options.includeGrades.some((g) => typeof g !== 'string'))
  )
    throw new Error('등급 필터가 올바르지 않습니다. 등급을 다시 선택하세요.');
  return {
    subject: options.subject.trim(),
    includeGrades: options.includeGrades as string[] | null | undefined,
    requireObjective: options.requireObjective as boolean | undefined,
    dedupeByPassage: options.dedupeByPassage as boolean | undefined,
    lockChoicesOnReference: options.lockChoicesOnReference as boolean | undefined,
    pdfCopyCleanup: options.pdfCopyCleanup as boolean | undefined,
  };
}
export function validatePatches(value: unknown, size: number): ImportPatch[] {
  if (!Array.isArray(value)) throw new Error('수정 목록이 올바르지 않습니다. 검수 화면에서 다시 저장하세요.');
  const seen = new Set<number>();
  for (const patch of value as unknown[]) {
    if (!patch || typeof patch !== 'object') throw new Error('수정 항목을 확인하세요.');
    const p = patch as Record<string, unknown>;
    if (
      !Number.isSafeInteger(p.index) ||
      (p.index as number) < 0 ||
      (p.index as number) >= size ||
      seen.has(p.index as number)
    )
      throw new Error('수정할 문제 위치가 없거나 중복되었습니다. 다시 분석하세요.');
    seen.add(p.index as number);
    if (p.include !== undefined && typeof p.include !== 'boolean')
      throw new Error('포함 여부를 다시 선택하세요.');
    for (const key of ['objectiveCode', 'grade'])
      if (p[key] !== undefined && (typeof p[key] !== 'string' || (p[key] as string).length > 1000))
        throw new Error('학습목표와 등급은 1,000자 이하의 글자로 입력하세요.');
    if (p.shufflePolicy !== undefined && p.shufflePolicy !== 'free' && p.shufflePolicy !== 'lock-all')
      throw new Error('선지 고정 여부를 다시 선택하세요.');
  }
  return value as ImportPatch[];
}
