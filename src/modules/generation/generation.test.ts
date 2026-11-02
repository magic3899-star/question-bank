import { describe, expect, it, vi } from 'vitest';
import type { Selector, Shuffler } from '../../contracts/index';
import {
  deepFreeze,
  makeHistoryEntry,
  makeQuestion,
  makeRuleSet,
  makeSelectedExam,
} from '../../../tests/fixtures/builders';
import { createRng } from '../rng/index';
import { generateExams } from './index';
import type { GenerationInput } from './index';

function input(): GenerationInput {
  return {
    rules: makeRuleSet({ examCount: 4 }),
    candidates: [makeQuestion()],
    assets: {},
    history: [makeHistoryEntry()],
    seed: 'fake-seed',
    shuffle: { shuffleQuestionOrder: true, shuffleChoices: true, balanceAnswerPositions: true },
    titleTemplate: '가짜 시험 {회차}회 ({회차})',
    createdAt: '2026-01-01T00:00:00Z',
    examIdPrefix: 'fake',
  };
}

function dependencies() {
  const precheck = vi.fn<Selector['precheck']>(() => []);
  const select = vi.fn<Selector['select']>((rules, candidates) => ({
    diagnostics: [],
    exams: Array.from({ length: rules.examCount }, () =>
      makeSelectedExam({
        questions: candidates,
        slotOfQuestion: { 'question-1': 'slot-1' },
        blanks: [{ slotId: 'slot-1', count: 1 }],
      }),
    ),
  }));
  const apply = vi.fn<Shuffler['apply']>((exam) => structuredClone(exam));
  return {
    selector: { precheck, select },
    shufflers: [{ kind: 'shuffler' as const, id: 'standard', label: '가짜 섞기', apply }],
  };
}

describe('생성 파이프라인 주입', () => {
  it('모든 회차·제목·이력을 생성하고 빈 번호를 이력에서 제외한다', () => {
    const data = deepFreeze(input());
    const before = structuredClone(data);
    const deps = dependencies();
    const result = generateExams(data, deps);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.snapshots).toHaveLength(4);
    expect(result.snapshots.map((s) => s.title)).toEqual([1, 2, 3, 4].map((i) => `가짜 시험 ${i}회 (${i})`));
    expect(result.historyEntries).toEqual(
      result.snapshots.map((snapshot) => ({
        examId: snapshot.examId,
        createdAt: data.createdAt,
        ruleSetId: data.rules.id,
        seed: data.seed,
        title: snapshot.title,
        questionIds: ['question-1'],
      })),
    );
    expect(result.snapshots.every((s) => s.items[1].blank)).toBe(true);
    expect(deps.selector.precheck).toHaveBeenCalledOnce();
    const ctx = deps.selector.select.mock.calls[0][2];
    expect(ctx.history).toEqual(data.history);
    expect(ctx.rng.next()).toBe(createRng(data.seed).fork('select').next());
    deps.shufflers[0].apply.mock.calls.forEach((call, i) => {
      expect(call[1]).toEqual(data.shuffle);
      expect(call[2].next()).toBe(createRng(data.seed).fork(`shuffle/exam${i}`).next());
    });
    expect(generateExams(data, dependencies())).toStrictEqual(result);
    expect(data).toStrictEqual(before);
  });

  it('존재하지 않는 섞기 ID와 사용 가능한 목록을 알리고 선택 전에 중단한다', () => {
    const deps = dependencies();
    const result = generateExams({ ...input(), shufflerId: 'unknown' }, deps);
    expect(result).toMatchObject({
      ok: false,
      snapshots: [],
      historyEntries: [],
      diagnostics: [{ code: 'SHUFFLER_NOT_FOUND', severity: 'error' }],
    });
    expect(result.diagnostics[0].message).toContain('unknown');
    expect(result.diagnostics[0].message).toContain('standard');
    expect(deps.selector.precheck).not.toHaveBeenCalled();
    expect(generateExams(input(), { ...deps, shufflers: [] }).diagnostics[0].message).toContain('(없음)');
  });

  it('선택 오류가 있으면 부분 선택 결과가 있어도 확정본과 이력을 만들지 않는다', () => {
    const deps = dependencies();
    deps.selector.select.mockReturnValue({
      exams: [makeSelectedExam()],
      diagnostics: [
        { severity: 'error', code: 'FAKE_SELECT_ERROR', message: '가짜 선택 실패입니다. 규칙을 수정하세요.' },
      ],
    });
    const result = generateExams(input(), deps);
    expect(result).toMatchObject({ ok: false, snapshots: [], historyEntries: [] });
    expect(deps.shufflers[0].apply).not.toHaveBeenCalled();
  });

  it('precheck 진단과 빈 번호 경고를 전달하고 오류 여부로 ok를 결정한다', () => {
    const deps = dependencies();
    const diagnostic = {
      severity: 'warn' as const,
      code: 'SLOT_SHORTAGE',
      message: '문제가 부족합니다. 문제를 추가하세요.',
    };
    deps.selector.precheck.mockReturnValue([diagnostic]);
    expect(generateExams(input(), deps)).toMatchObject({ ok: true, diagnostics: [diagnostic] });
    deps.selector.precheck.mockReturnValue([{ ...diagnostic, severity: 'error' }]);
    expect(generateExams(input(), deps).ok).toBe(false);
  });

  it('선택기가 회차 수를 잘못 반환하면 중단한다', () => {
    const deps = dependencies();
    deps.selector.select.mockReturnValue({ exams: [], diagnostics: [] });
    expect(generateExams(input(), deps)).toMatchObject({
      ok: false,
      snapshots: [],
      diagnostics: [{ code: 'EXAM_COUNT_MISMATCH' }],
    });
  });

  it('확정본 생성과 검증 진단을 모두 전달한다', () => {
    const data = input();
    data.candidates[0].stem.push({ type: 'image', assetId: 'missing' });
    const result = generateExams(data, dependencies());
    expect(result.ok).toBe(false);
    expect(result.snapshots).toHaveLength(4);
    expect(result.diagnostics.filter((d) => d.code === 'ASSET_MISSING')).toHaveLength(8);
  });

  it('실수로 입력을 수정하는 주입 플러그인도 호출자의 데이터는 바꾸지 않는다', () => {
    const data = deepFreeze(input());
    const before = structuredClone(data);
    const deps = dependencies();
    deps.selector.precheck.mockImplementation((rules, candidates, ctx) => {
      rules.name = '변경';
      candidates[0].grade = 'B';
      ctx.history.length = 0;
      return [];
    });
    deps.shufflers[0].apply.mockImplementation((exam) => {
      exam.questions[0].grade = 'C';
      return exam;
    });
    expect(() => generateExams(data, deps)).not.toThrow();
    expect(data).toStrictEqual(before);
    expect(deps.selector.select.mock.calls[0][0].name).toBe(data.rules.name);
  });

  it('명시한 섞기 플러그인을 사용한다', () => {
    const deps = dependencies();
    deps.shufflers[0].id = 'custom';
    expect(generateExams({ ...input(), shufflerId: 'custom' }, deps).ok).toBe(true);
    expect(deps.shufflers[0].apply).toHaveBeenCalledTimes(4);
  });
});
