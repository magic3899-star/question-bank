import type { Diagnostic, DraftQuestion } from '../../contracts/index';
import {
  blocksToPlainText,
  collectAssetIds,
  questionContentKey,
  referencesChoiceLabels,
} from '../content-model/index';
import { records } from './records';
import { validateProfile } from './profile';
import type { LayoutProfile } from './profile';
import type { LayoutBlock, LayoutOptions, LocatedDiagnostic } from './types';
export { standardProfile, validateProfile } from './profile';
export type { LayoutProfile } from './profile';
export type { LayoutBlock, LayoutOptions, LocatedDiagnostic } from './types';
export function parseLayout(
  blocks: LayoutBlock[],
  profile: LayoutProfile,
  options: LayoutOptions,
  events: LocatedDiagnostic[] = [],
): { questions: DraftQuestion[]; diagnostics: Diagnostic[]; usedAssetIds: string[] } {
  const draft: { questions: DraftQuestion[]; diagnostics: Diagnostic[] } = { questions: [], diagnostics: [] };
  const errors = validateProfile(profile);
  if (!options.subject.trim() || errors.length)
    return {
      ...draft,
      usedAssetIds: [],
      diagnostics: [
        {
          severity: 'error',
          code: !options.subject.trim() ? 'SUBJECT_REQUIRED' : 'LAYOUT_INVALID',
          message: !options.subject.trim()
            ? '가져올 과목을 선택한 뒤 다시 해석하세요.'
            : `문서 양식 설정을 확인하세요. ${errors.join(' ')}`,
        },
      ],
    };
  const reader = {
    diagnostics: structuredClone(events),
    report(code: string, severity: Diagnostic['severity'], message: string, position: number) {
      this.diagnostics.push({
        position,
        diagnostic: { code, severity, message: `${position}번째 문단 부근: ${message}` },
      });
    },
  };
  const entries = blocks.map((b) => ({
    block: b.block,
    text: b.text,
    position: b.sourceIndex,
    boundary: b.kind === 'paragraph',
    autoNumber: b.autoNumber ?? (b.circledNumbering ? { label: '원문자', value: 0 } : undefined),
  }));
  const questions = records(
    entries,
    profile,
    options.sourceFile ?? '붙여넣기',
    options.subject.trim(),
    reader,
  );
  const includeGrades = options?.includeGrades === undefined ? ['A'] : options.includeGrades;
  if (
    includeGrades !== null &&
    (!Array.isArray(includeGrades) || includeGrades.some((grade: unknown) => typeof grade !== 'string'))
  ) {
    draft.diagnostics.push({
      severity: 'error',
      code: 'GRADE_FILTER_INVALID',
      message: '등급 필터는 문자열 배열 또는 null로 입력하세요. 모든 등급은 빈 배열로 가져올 수 있습니다.',
    });
    return { questions: draft.questions, diagnostics: draft.diagnostics, usedAssetIds: [] };
  }
  const indices = new Map<number, number>();
  const passages = new Map<string, string>();
  for (const [index, item] of questions.entries()) {
    const { question } = item;
    const location = item.sourceLocation ?? '문서 위치 미상';
    const preview = blocksToPlainText(question.stem).slice(0, 20);
    const skip = (code: string, reason: string): void => {
      draft.diagnostics.push({
        severity: 'info',
        code,
        message: `${location}, 문제 "${preview}": ${reason}`,
      });
    };
    if (options?.requireObjective !== false && !question.objectiveCode) {
      skip(
        'SKIPPED_NO_OBJECTIVE',
        '학습목표 코드가 없어 제외했습니다. 학습목표 줄을 추가하거나 requireObjective를 false로 바꾸세요.',
      );
      continue;
    }
    if (includeGrades?.length && (!question.grade || !includeGrades.includes(question.grade))) {
      skip(
        'SKIPPED_BY_GRADE',
        `${question.grade ? `등급 ${question.grade}` : '등급 표시 없음'}으로 제외했습니다. 등급 필터를 바꾸면 가져올 수 있습니다.`,
      );
      continue;
    }
    const key = questionContentKey(question);
    const first = passages.get(key);
    if (options?.dedupeByPassage !== false && first !== undefined) {
      skip(
        'SKIPPED_DUPLICATE_PASSAGE',
        `지문이 같아 제외했습니다. 남긴 문제: ${first}. 선지가 달라도 같은 지문은 첫 문제만 가져옵니다.`,
      );
      continue;
    }
    passages.set(key, location);
    indices.set(index, draft.questions.length);
    if (
      options?.lockChoicesOnReference !== false &&
      referencesChoiceLabels([...question.explanation, ...question.stem, ...(question.passage ?? [])])
    ) {
      question.shufflePolicy = 'lock-all';
      draft.diagnostics.push({
        severity: 'info',
        code: 'CHOICES_LOCKED_BY_REFERENCE',
        message: `${location}, 문제 "${preview}": 해설·본문에 선지 번호(①~⑤)가 있어 선지 순서를 고정했습니다. 번호가 법 조항 등 선지와 무관하면 문제 편집에서 고정을 해제하세요`,
        ref: { draftIndex: draft.questions.length },
      });
    }
    draft.questions.push(item);
  }
  const usedAssets = new Set(
    draft.questions.flatMap(({ question }) =>
      collectAssetIds([
        ...question.stem,
        ...(question.passage ?? []),
        ...question.explanation,
        ...question.choices.flatMap((choice) => choice.content),
      ]),
    ),
  );

  for (const { diagnostic } of reader.diagnostics) {
    const original = diagnostic.ref?.draftIndex;
    if (original !== undefined && !indices.has(original)) continue;
    draft.diagnostics.push({
      ...diagnostic,
      ref: diagnostic.ref
        ? { ...diagnostic.ref, ...(original === undefined ? {} : { draftIndex: indices.get(original) }) }
        : undefined,
    });
  }
  return { questions: draft.questions, diagnostics: draft.diagnostics, usedAssetIds: [...usedAssets] };
}
