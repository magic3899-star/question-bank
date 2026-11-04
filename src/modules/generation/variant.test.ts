import { describe, expect, it } from 'vitest';
import type { ExamSnapshot, Shuffler } from '../../contracts/index';
import { makeVariantExam } from '../../../tests/fixtures/variantExam';
import { deepFreeze, para } from '../../../tests/fixtures/builders';
import { verifySnapshot } from '../exam-snapshot/index';
import { createRng } from '../rng/index';
import { shufflers } from '../shuffler/index';
import { deriveVariant } from './index';

function assertPreserved(before: ExamSnapshot, after: ExamSnapshot) {
  expect(after.items).toHaveLength(before.items.length);
  expect(after.items.filter((item) => item.blank)).toHaveLength(
    before.items.filter((item) => item.blank).length,
  );
  const ids = (snapshot: ExamSnapshot) =>
    snapshot.items
      .filter((item) => !item.blank)
      .map((item) => item.sourceQuestionId)
      .sort();
  expect(ids(after)).toEqual(ids(before));
  for (const odd of before.items.filter((item) => !item.blank)) {
    const even = after.items.find((item) => item.sourceQuestionId === odd.sourceQuestionId)!;
    for (const key of ['passage', 'stem', 'explanation', 'objectiveCode', 'grade'] as const)
      expect(even[key]).toEqual(odd[key]);
    const choices = (item: typeof odd) =>
      Object.fromEntries(item.choices.map((choice) => [choice.sourceChoiceId, choice.content]));
    expect(choices(even)).toEqual(choices(odd));
    const answers = (item: typeof odd) =>
      item.answerLabels
        .map((label) => item.choices.find((choice) => choice.label === label)!.sourceChoiceId)
        .sort();
    expect(answers(even)).toEqual(answers(odd));
  }
  expect(verifySnapshot(after)).toEqual([]);
}

describe('홀수형에서 짝수형 파생', () => {
  it('결정적이며 내용·정답·번호·메타데이터·원본 입력을 보존하고 순서는 달라진다', () => {
    const input = deepFreeze(makeVariantExam());
    const result = deriveVariant(input, { shufflers });
    expect(result.diagnostics).toEqual([]);
    const even = result.snapshot!;
    expect(deriveVariant(input, { shufflers })).toEqual(result);
    assertPreserved(input.snapshot, even);
    expect(even.items.map((item) => item.sourceQuestionId)).not.toEqual(
      input.snapshot.items.map((item) => item.sourceQuestionId),
    );
    expect(even.items.map((item) => item.number)).toEqual(input.snapshot.items.map((item) => item.number));
    expect(even).toMatchObject({
      examId: input.snapshot.examId,
      title: input.snapshot.title,
      createdAt: input.snapshot.createdAt,
      seed: input.snapshot.seed,
    });
  });

  it('고정 선지와 지문 묶음을 지키고 학습목표 정렬 옵션을 무시한다', () => {
    const input = makeVariantExam();
    const even = deriveVariant(input, { shufflers }).snapshot!;
    const choices = (snapshot: ExamSnapshot, id: string) =>
      snapshot.items
        .find((item) => item.sourceQuestionId === id)!
        .choices.map((choice) => choice.sourceChoiceId);
    expect(choices(even, 'q0')).toEqual(choices(input.snapshot, 'q0'));
    for (const position of [1, 4])
      expect(choices(even, 'q1')[position]).toBe(choices(input.snapshot, 'q1')[position]);
    const group = input.snapshot.items
      .filter((item) => ['q2', 'q3'].includes(item.sourceQuestionId))
      .map((item) => item.sourceQuestionId);
    const index = even.items.findIndex((item) => item.sourceQuestionId === group[0]);
    expect(even.items.slice(index, index + 2).map((item) => item.sourceQuestionId)).toEqual(group);
    expect(
      deriveVariant({ ...input, shuffle: { ...input.shuffle, sortByObjective: false } }, { shufflers })
        .snapshot,
    ).toEqual(even);
    expect(even.items.map((item) => item.objectiveCode)).not.toEqual(
      input.snapshot.items.map((item) => item.objectiveCode),
    );
  });

  it.each([
    'stem',
    'passage',
    'explanation',
    'objectiveCode',
    'grade',
    'choices',
    'answer',
    'addedChoice',
    'missing',
  ])('원본 변경 %s는 결과 없이 한국어 오류다', (kind) => {
    const input = makeVariantExam();
    const question = input.sources[0]!;
    switch (kind) {
      case 'stem':
        question.stem = [para('가짜 변경 본문')];
        break;
      case 'passage':
        question.passage = [para('가짜 변경 지문')];
        break;
      case 'explanation':
        question.explanation = [para('가짜 변경 해설')];
        break;
      case 'objectiveCode':
        question.objectiveCode = '가짜 99';
        break;
      case 'grade':
        question.grade = 'B';
        break;
      case 'choices':
        question.choices[0]!.content = [para('가짜 변경 선지')];
        break;
      case 'answer':
        question.answerChoiceIds = [question.choices[1]!.id];
        break;
      case 'addedChoice':
        question.choices.push({ id: 'extra', content: [para('가짜 추가')] });
        break;
      case 'missing':
        input.sources.shift();
        break;
    }
    const result = deriveVariant(input, { shufflers });
    expect(result.snapshot).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('시험을 다시 만들어 주세요'),
      }),
    );
  });

  it('기본 셔플러 누락과 손상 확정본은 결과 없이 거부한다', () => {
    const input = makeVariantExam();
    expect(deriveVariant(input, { shufflers: [] }).snapshot).toBeUndefined();
    expect(
      deriveVariant({ ...input, snapshot: { ...input.snapshot, contentHash: 'broken' } }, { shufflers })
        .snapshot,
    ).toBeUndefined();
  });

  it.each(['stem', 'choices', 'answer', 'missing'])('셔플러가 %s를 훼손하면 결과 없이 거부한다', (kind) => {
    const input = makeVariantExam();
    const broken: Shuffler = {
      ...shufflers[0]!,
      apply(exam) {
        const result = structuredClone(exam);
        const first = result.questions[0]!;
        const second = result.questions[1]!;
        if (kind === 'stem') [first.stem, second.stem] = [second.stem, first.stem];
        if (kind === 'choices') [first.choices, second.choices] = [second.choices, first.choices];
        if (kind === 'answer')
          first.answerChoiceIds = [
            first.choices.find((choice) => !first.answerChoiceIds.includes(choice.id))!.id,
          ];
        if (kind === 'missing') result.questions.pop();
        return result;
      },
    };
    expect(deriveVariant(input, { shufflers: [broken] }).snapshot).toBeUndefined();
  });

  it('난수로 만든 시드 20개에서 문제 집합·모든 내용·정답 불변조건을 유지한다', () => {
    const input = makeVariantExam();
    const rng = createRng('fake-property-seeds');
    for (let index = 0; index < 20; index++) {
      const result = deriveVariant({ ...input, seed: `${rng.int(0x7fffffff)}` }, { shufflers });
      expect(result.snapshot, JSON.stringify(result.diagnostics)).toBeDefined();
      assertPreserved(input.snapshot, result.snapshot!);
    }
  });
});
