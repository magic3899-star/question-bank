import type { ConstraintSpec, RuleSet } from '../../../../contracts/index';

export type SegmentMode = 'strict-unless-single' | 'strict' | 'prefer';

/** 화면에서 다루는 제약 설정(직원이 이해하기 쉬운 형태). */
export interface ConstraintForm {
  noOverlap: boolean;
  noDuplicate: boolean;
  duplicateScope: 'run' | 'exam';
  distinctMiddle: boolean;
  middleMode: SegmentMode;
  distinctObjective: boolean;
  excludeRecent: number;
  /** 화면에서 다루지 않는 제약은 그대로 보존한다. */
  others: ConstraintSpec[];
  unconfirmed: { kind: string; note?: string }[];
}

const isMiddle = (spec: ConstraintSpec) =>
  spec.kind === 'distinct-by-segment' && spec.params.scope === 'slot' && Number(spec.params.depth) === 2;
const isObjective = (spec: ConstraintSpec) =>
  spec.kind === 'distinct-by-segment' && spec.params.scope === 'exam' && Number(spec.params.depth) === 3;

export function toConstraintForm(rules: RuleSet): ConstraintForm {
  const specs = rules.constraints;
  const duplicate = specs.find((spec) => spec.kind === 'no-duplicate-content');
  const middle = specs.find(isMiddle);
  const recent = specs.find((spec) => spec.kind === 'exclude-recent');
  return {
    noOverlap: specs.some((spec) => spec.kind === 'no-overlap-across-exams'),
    noDuplicate: !!duplicate,
    duplicateScope: duplicate?.params.scope === 'exam' ? 'exam' : 'run',
    distinctMiddle: !!middle,
    middleMode: (['strict', 'prefer'].includes(String(middle?.params.mode))
      ? middle?.params.mode
      : 'strict-unless-single') as SegmentMode,
    distinctObjective: specs.some(isObjective),
    excludeRecent: Number(recent?.params.lastNExams ?? 0) || 0,
    others: specs.filter(
      (spec) =>
        !['no-overlap-across-exams', 'no-duplicate-content', 'exclude-recent'].includes(spec.kind) &&
        !isMiddle(spec) &&
        !isObjective(spec),
    ),
    unconfirmed: specs
      .filter((spec) => spec.needsConfirmation)
      .map((spec) => ({ kind: spec.kind, note: spec.note })),
  };
}

/** 화면 설정을 규칙의 제약 목록으로 되돌린다. 확인 필요 표시는 사용자가 확인하면 지운다. */
export function fromConstraintForm(
  form: ConstraintForm,
  keepConfirmation: boolean,
  previous: RuleSet,
): ConstraintSpec[] {
  const flag = (kind: string, match: (spec: ConstraintSpec) => boolean) => {
    const old = previous.constraints.find(match);
    return keepConfirmation && old?.needsConfirmation
      ? { needsConfirmation: true, note: old.note }
      : old?.note && !old.needsConfirmation
        ? { note: old.note }
        : {};
  };
  const specs: ConstraintSpec[] = [];
  if (form.noOverlap)
    specs.push({
      kind: 'no-overlap-across-exams',
      params: { scope: 'all' },
      ...flag('no-overlap', (s) => s.kind === 'no-overlap-across-exams'),
    });
  if (form.noDuplicate)
    specs.push({
      kind: 'no-duplicate-content',
      params: { scope: form.duplicateScope },
      ...flag('dup', (s) => s.kind === 'no-duplicate-content'),
    });
  if (form.distinctObjective)
    specs.push({
      kind: 'distinct-by-segment',
      params: { depth: 3, scope: 'exam', mode: 'strict' },
      ...flag('obj', isObjective),
    });
  if (form.distinctMiddle)
    specs.push({
      kind: 'distinct-by-segment',
      params: { depth: 2, scope: 'slot', mode: form.middleMode },
      ...flag('mid', isMiddle),
    });
  if (form.excludeRecent > 0)
    specs.push({ kind: 'exclude-recent', params: { lastNExams: Math.floor(form.excludeRecent) } });
  return [...specs, ...form.others];
}

export function parsePrefixes(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,，\n]/u)
        .map((item) => item.replace(/\s+/gu, ' ').trim())
        .filter(Boolean),
    ),
  ];
}
