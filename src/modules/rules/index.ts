import type { Diagnostic, RuleSet } from '../../contracts/index';
import { matchesObjectivePrefix } from '../objective-code/index';
export { subjectRuleSet } from './subject';

export const RULESET_SCHEMA_VERSION = 1 as const;

export function slotsTotalCount(rules: RuleSet): number {
  return rules.slots.reduce((sum, slot) => sum + slot.count, 0);
}

export function validateRuleSet(rules: RuleSet, knownConstraintKinds?: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const error = (message: string): void => {
    diagnostics.push({ severity: 'error', code: 'RULESET_INVALID', message });
  };
  for (const key of ['id', 'name', 'subject'] as const) {
    if (typeof rules[key] !== 'string' || !rules[key].trim())
      error(`${key} 값이 비었습니다. 규칙 식별자·이름·과목을 입력하세요.`);
  }
  if (rules.schemaVersion !== RULESET_SCHEMA_VERSION)
    error('규칙 버전이 올바르지 않습니다. 버전 1 형식으로 저장하세요.');
  if (!Number.isSafeInteger(rules.examCount) || rules.examCount < 1)
    error('회차 수는 1 이상의 정수로 입력하세요.');
  if (!Number.isSafeInteger(rules.startNumber)) error('시작 번호는 정수로 입력하세요.');
  if (!Array.isArray(rules.slots) || !rules.slots.length)
    error('슬롯이 없습니다. 출제 영역을 하나 이상 추가하세요.');
  const ids = new Set<string>();
  const nonemptyStrings = (value: unknown): value is string[] =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry: unknown) => typeof entry === 'string' && !!entry.trim());
  for (const slot of Array.isArray(rules.slots) ? rules.slots : []) {
    if (!slot.id?.trim() || ids.has(slot.id))
      error(`슬롯 '${slot.label}'의 식별자가 비었거나 중복됩니다. 고유한 식별자를 입력하세요.`);
    ids.add(slot.id);
    if (!Number.isSafeInteger(slot.count) || slot.count < 1)
      error(`슬롯 '${slot.label}' 문제 수를 양의 정수로 입력하세요.`);
    const filter = slot.filter;
    if (!filter || typeof filter !== 'object') {
      error(`슬롯 '${slot.label}' 필터가 없습니다. 출제 영역 필터를 지정하세요.`);
      continue;
    }
    switch (filter.kind) {
      case 'all':
        break;
      case 'objectivePrefix':
        if (
          !nonemptyStrings(filter.prefixes) ||
          filter.prefixes.some(
            (prefix) =>
              !matchesObjectivePrefix(
                `${prefix
                  .trim()
                  .replace(/\s*-\s*/gu, '-')
                  .replace(/-$/, '')}-1`,
                prefix,
              ) && !matchesObjectivePrefix(`${prefix.trim()} 1`, prefix),
          )
        ) {
          error(
            `슬롯 '${slot.label}' 학습목표 접두어가 올바르지 않습니다. '해부 1' 같은 접두어를 하나 이상 입력하세요.`,
          );
        }
        break;
      case 'tag':
        if (!nonemptyStrings(filter.tags)) error(`슬롯 '${slot.label}' 태그를 하나 이상 입력하세요.`);
        break;
      case 'sourceTag':
        if (!nonemptyStrings(filter.values)) error(`슬롯 '${slot.label}' 출처 태그를 하나 이상 입력하세요.`);
        break;
      default:
        error(`슬롯 '${slot.label}' 필터 종류를 all, objectivePrefix, tag, sourceTag 중 하나로 고치세요.`);
    }
  }
  if (!Array.isArray(rules.constraints))
    error('제약 목록을 배열로 입력하세요. 제약이 없으면 빈 배열을 사용하세요.');
  for (const spec of Array.isArray(rules.constraints) ? rules.constraints : []) {
    if (
      typeof spec.kind !== 'string' ||
      !spec.kind.trim() ||
      (knownConstraintKinds && !knownConstraintKinds.includes(spec.kind))
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'UNKNOWN_CONSTRAINT',
        message: `알 수 없는 제약 '${spec.kind}'입니다. 등록된 제약 종류로 고치세요.`,
      });
    }
    if (spec.needsConfirmation)
      diagnostics.push({
        severity: 'info',
        code: 'UNCONFIRMED_RULE',
        message: `제약 '${spec.kind}'은 확인이 필요합니다. ${spec.note ?? '출제 규칙의 의미를 확인하고 확정하세요.'}`,
      });
  }
  return diagnostics;
}

export function describeRuleSet(rules: RuleSet): string[] {
  const filterText = (slot: RuleSet['slots'][number]): string => {
    switch (slot.filter.kind) {
      case 'all':
        return '전체 문제';
      case 'objectivePrefix':
        return `학습목표 ${slot.filter.prefixes.join(', ')}`;
      case 'tag':
        return `태그 ${slot.filter.tags.join(', ')}`;
      case 'sourceTag':
        return `출처 ${slot.filter.values.join(', ')}`;
    }
  };
  const labels: Record<string, string> = {
    'no-overlap-across-exams': '회차 간 동일 문제 금지',
    'no-duplicate-content': '같은 지문 중복 금지',
    'distinct-by-segment': '학습목표 구간 중복 금지',
    'exclude-recent': '최근 출제 문제 제외',
  };
  const constraintText = (spec: RuleSet['constraints'][number]): string => {
    switch (spec.kind) {
      case 'no-overlap-across-exams':
        return '모든 회차 사이에서 같은 문제를 사용하지 않습니다';
      case 'no-duplicate-content':
        return `${spec.params.scope === 'exam' ? '각 회차 안' : '전체 출제'}에서 지문이 같은 문제를 사용하지 않습니다`;
      case 'distinct-by-segment':
        return `${spec.params.scope === 'slot' ? '슬롯' : '회차'} 안에서 학습목표 앞 ${String(spec.params.depth)}개 구간을 ${spec.params.mode === 'prefer' ? '가능하면 ' : '반드시 '}서로 다르게 선택합니다${(spec.params.mode ?? 'strict-unless-single') === 'strict-unless-single' && spec.params.scope === 'slot' ? '. 슬롯의 정적 후보 풀에 구간이 하나뿐이면 면제하며, 구간이 문제 수보다 적으면 남는 자리는 빈 번호로 남습니다' : ''}`;
      case 'exclude-recent':
        return `최근 ${String(spec.params.lastNExams)}개 시험에서 사용한 문제를 제외합니다`;
      default:
        return '등록된 제약의 설명을 확인하세요';
    }
  };
  return [
    `회차 ${rules.examCount}개, 각 ${slotsTotalCount(rules)}문제`,
    `시작 번호 ${rules.startNumber}번`,
    '후보가 모자라면 빈 번호로 남습니다',
    ...rules.slots.map((slot) => `슬롯 '${slot.label}': ${slot.count}문제 (${filterText(slot)})`),
    ...rules.constraints.map(
      (spec) =>
        `제약: ${labels[spec.kind] ?? spec.kind} · ${constraintText(spec)}${spec.needsConfirmation ? ' · 확인 필요' : ''}${spec.note ? ` · ${spec.note}` : ''}`,
    ),
    ...(rules.note ? [rules.note] : []),
  ];
}

export function presetRuleSets(): RuleSet[] {
  return [
    {
      id: 'anatomy',
      schemaVersion: 1,
      name: '구강해부학',
      subject: 'anatomy',
      examCount: 4,
      startNumber: 21,
      slots: [
        {
          id: 'a12',
          label: '해부 1~2단원',
          count: 2,
          filter: { kind: 'objectivePrefix', prefixes: ['해부 1', '해부 2'] },
        },
        ...[3, 4, 5, 6].map((unit) => ({
          id: `a${unit}`,
          label: `해부 ${unit}단원`,
          count: 1,
          filter: { kind: 'objectivePrefix' as const, prefixes: [`해부 ${unit}`] },
        })),
        {
          id: 'a789',
          label: '해부 7~9단원',
          count: 1,
          filter: { kind: 'objectivePrefix', prefixes: ['해부 7', '해부 8', '해부 9'] },
        },
      ],
      constraints: [
        { kind: 'no-overlap-across-exams', params: { scope: 'all' } },
        { kind: 'no-duplicate-content', params: { scope: 'run' } },
      ],
    },
    {
      id: 'law',
      schemaVersion: 1,
      name: '의료관계법규',
      subject: 'law',
      examCount: 4,
      startNumber: 1,
      slots: [1, 2, 3, 4].map((unit) => ({
        id: `law${unit}`,
        label: `법규 ${unit}단원`,
        count: 5,
        filter: { kind: 'objectivePrefix' as const, prefixes: [`법규 ${unit}`] },
      })),
      constraints: [
        { kind: 'no-overlap-across-exams', params: { scope: 'all' } },
        { kind: 'no-duplicate-content', params: { scope: 'run' } },
        { kind: 'distinct-by-segment', params: { depth: 3, scope: 'exam', mode: 'strict' } },
        {
          kind: 'distinct-by-segment',
          params: { depth: 2, scope: 'slot', mode: 'strict-unless-single' },
          needsConfirmation: false,
          note: '한 대단원의 문제는 중단원이 서로 달라야 하며, 중단원이 하나뿐인 대단원은 면제합니다. 중단원이 문제 수보다 적으면 남는 자리는 빈 번호로 남습니다.',
        },
      ],
    },
  ];
}
