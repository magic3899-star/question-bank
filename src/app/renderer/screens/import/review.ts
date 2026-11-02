import type { ImportItem, ImportPatch, ImportReview, ImportStatus } from '../../../shared/index';
import { parseObjectiveCode } from '../../../../modules/objective-code/index';
import { referencesChoiceLabels } from '../../../../modules/content-model/index';

export const statusLabels: Record<ImportStatus, string> = {
  ok: '정상',
  warn: '경고',
  error: '오류',
  excluded: '제외',
};
export function editedItem(item: ImportItem, patch?: ImportPatch): ImportItem {
  const draft = {
    ...item.draft,
    objectiveCode: patch?.objectiveCode ?? item.draft.objectiveCode,
    grade: patch?.grade ?? item.draft.grade,
    shufflePolicy: patch?.shufflePolicy ?? item.draft.shufflePolicy,
  };
  const changedObjective = patch?.objectiveCode !== undefined;
  const diagnostics = item.diagnostics.filter(
    (d) =>
      !(
        changedObjective &&
        ['OBJECTIVE_FORMAT', 'OBJECTIVE_FORMAT_INVALID', 'OBJECTIVE_MISSING'].includes(d.code)
      ) && !(patch?.shufflePolicy !== undefined && d.code === 'CHOICE_LABEL_REFERENCE_UNLOCKED'),
  );
  if (changedObjective && draft.objectiveCode?.trim() && !parseObjectiveCode(draft.objectiveCode))
    diagnostics.push({
      code: 'OBJECTIVE_FORMAT_INVALID',
      severity: 'error',
      message: '학습목표는 과목명과 숫자 구간으로 입력하세요. 예: 법규 1-1-3',
    });
  if (changedObjective && !draft.objectiveCode?.trim())
    diagnostics.push({
      code: 'OBJECTIVE_MISSING',
      severity: 'warn',
      message: '학습목표가 없으면 출제 대상에서 빠집니다. 학습목표를 입력하세요.',
    });
  if (changedObjective && draft.objectiveCode?.trim() && !/^\S+ \d+(-\d+)+$/u.test(draft.objectiveCode))
    diagnostics.push({
      code: 'OBJECTIVE_FORMAT',
      severity: 'warn',
      message: '학습목표를 과목과 코드 사이 일반 공백 하나로 입력하세요. 예: 법규 1-1-3',
    });
  if (
    patch?.shufflePolicy === 'free' &&
    referencesChoiceLabels([...draft.stem, ...(draft.passage ?? []), ...draft.explanation])
  )
    diagnostics.push({
      code: 'CHOICE_LABEL_REFERENCE_UNLOCKED',
      severity: 'warn',
      message: '해설·본문에 선지 번호 참조가 있습니다. 참조를 확인하거나 선지 순서를 고정하세요.',
    });
  const excluded = patch?.include === false || (patch?.include !== true && item.status === 'excluded');
  const status: ImportStatus = excluded
    ? 'excluded'
    : diagnostics.some((d) => d.severity === 'error')
      ? 'error'
      : diagnostics.some((d) => d.severity === 'warn')
        ? 'warn'
        : 'ok';
  return {
    ...item,
    draft,
    diagnostics,
    status,
    summary: { ...item.summary, objectiveCode: draft.objectiveCode, grade: draft.grade },
  };
}
export function editedReview(review: ImportReview, patches: Record<number, ImportPatch>): ImportReview {
  const items = review.items.map((item) => editedItem(item, patches[item.index]));
  const counts = { ok: 0, warn: 0, error: 0, excluded: 0 };
  items.forEach((item) => counts[item.status]++);
  return { ...review, items, counts };
}
