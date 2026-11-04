import { describe, expect, it } from 'vitest';
import type { SelectedExam } from '../../../contracts/index';
import { createRng } from '../../rng/index';
import { deepFreeze, makeChoice, makeQuestion, para } from '../../../../tests/fixtures/builders';
import { standardShuffler } from './index';

const options = { shuffleQuestionOrder: true, shuffleChoices: true, balanceAnswerPositions: true };
describe('기본 섞기', () => {
  it('입력을 깊이 복사하고 떨어진 지문 묶음도 연속으로 배치한다', () => {
    const exam: SelectedExam = {
      questions: [
        makeQuestion({ id: 'a', passageGroupId: 'g' }),
        makeQuestion({ id: 'b' }),
        makeQuestion({ id: 'c', passageGroupId: 'g' }),
      ],
      blanks: [],
      slotOfQuestion: { a: 's', b: 's', c: 't' },
    };
    const result = standardShuffler.apply(deepFreeze(exam), options, createRng('g'));
    const group = result.questions.filter((question) => question.passageGroupId === 'g');
    expect(group.map((question) => question.id)).toEqual(['a', 'c']);
    expect(result.questions.indexOf(group[1]) - result.questions.indexOf(group[0])).toBe(1);
    expect(result.questions[0]).not.toBe(
      exam.questions.find((question) => question.id === result.questions[0].id),
    );
    expect(result.slotOfQuestion).toEqual(exam.slotOfQuestion);
  });
  it('학습목표 순 정렬: 숫자 순서로 배치하고 예문 묶음은 붙여 두며 학습목표 없는 문제는 뒤로 보낸다', () => {
    const codes = ['법규 3-1-5', '법규 1-1-10', '법규 1-1-3', '법규 2-1-4', '법규 1-2-1'];
    const questions = [
      ...codes.map((objectiveCode, index) => makeQuestion({ id: `q${index}`, objectiveCode })),
      makeQuestion({ id: 'none', objectiveCode: undefined }),
      makeQuestion({ id: 'p1', passageGroupId: 'g', objectiveCode: '법규 4-1-1' }),
      makeQuestion({ id: 'p2', passageGroupId: 'g', objectiveCode: '법규 1-1-4' }),
    ];
    const exam = { questions, blanks: [], slotOfQuestion: {} };
    for (const seed of ['s1', 's2', 's3', 's4']) {
      const result = standardShuffler.apply(
        deepFreeze(exam),
        { ...options, sortByObjective: true },
        createRng(seed),
      );
      expect(result.questions.map((question) => question.objectiveCode)).toEqual([
        '법규 1-1-3',
        '법규 4-1-1',
        '법규 1-1-4',
        '법규 1-1-10',
        '법규 1-2-1',
        '법규 2-1-4',
        '법규 3-1-5',
        undefined,
      ]);
    }
  });
  it('학습목표 순 정렬: 같은 학습목표 안의 순서는 시드에 따라 달라지고 같은 시드면 같다', () => {
    const questions = Array.from({ length: 8 }, (_, index) =>
      makeQuestion({ id: `same${index}`, objectiveCode: '법규 1-1-1' }),
    );
    const exam = { questions, blanks: [], slotOfQuestion: {} };
    const run = (seed: string) =>
      standardShuffler
        .apply(exam, { ...options, sortByObjective: true }, createRng(seed))
        .questions.map((question) => question.id)
        .join();
    expect(run('a')).toBe(run('a'));
    expect(new Set(['a', 'b', 'c', 'd', 'e'].map(run)).size).toBeGreaterThan(1);
  });
  it('고정 정답·모든 선지 고정·복수 정답·빈 시험을 처리한다', () => {
    const questions = [
      makeQuestion({
        id: 'fixed',
        choices: [makeChoice({ id: 'a', fixedPosition: true }), makeChoice({ id: 'b' })],
        answerChoiceIds: ['a'],
      }),
      makeQuestion({ id: 'all', choices: [makeChoice({ fixedPosition: true })] }),
      makeQuestion({ id: 'multi', answerChoiceIds: ['choice-1', 'choice-2'] }),
    ];
    const exam = { questions, blanks: [], slotOfQuestion: {} };
    const result = standardShuffler.apply(exam, options, createRng('edge'));
    expect(result.questions.find((question) => question.id === 'fixed')?.choices[0].id).toBe('a');
    expect(result.questions.find((question) => question.id === 'all')?.choices).toEqual(questions[1].choices);
    expect(result.questions.find((question) => question.id === 'multi')?.answerChoiceIds).toEqual([
      'choice-1',
      'choice-2',
    ]);
    expect(
      standardShuffler.apply({ questions: [], blanks: [], slotOfQuestion: {} }, options, createRng('empty')),
    ).toEqual({ questions: [], blanks: [], slotOfQuestion: {} });
  });
  it('용도별 fork 때문에 문제 순서 옵션이 선지 순서를 바꾸지 않는다', () => {
    const exam = {
      questions: Array.from({ length: 15 }, (_, index) =>
        makeQuestion({ id: String(index), stem: [para(`가짜 ${index}`)] }),
      ),
      blanks: [],
      slotOfQuestion: {},
    };
    const first = standardShuffler.apply(exam, options, createRng('isolation'));
    const second = standardShuffler.apply(
      exam,
      { ...options, shuffleQuestionOrder: false },
      createRng('isolation'),
    );
    for (const question of first.questions)
      expect(question.choices).toEqual(second.questions.find((item) => item.id === question.id)?.choices);
  });
  it('고정 위치 제약 때문에 앞선 배정을 바꿔야 해도 가능한 균형을 찾는다', () => {
    for (let seed = 0; seed < 30; seed++) {
      const exam = {
        questions: [
          [0, 1],
          [0, 1],
          [0, 2],
          [0, 2],
          [1, 2],
          [1, 2],
        ].map((allowed, index) =>
          makeQuestion({
            id: String(index),
            choices: Array.from({ length: 3 }, (_, position) =>
              makeChoice({ id: `c${position}`, fixedPosition: !allowed.includes(position) }),
            ),
            answerChoiceIds: [`c${allowed[0]}`],
          }),
        ),
        blanks: [],
        slotOfQuestion: {},
      };
      const result = standardShuffler.apply(exam, options, createRng(String(seed)));
      const counts = [0, 0, 0];
      for (const question of result.questions)
        counts[question.choices.findIndex((choice) => choice.id === question.answerChoiceIds[0])]++;
      expect(counts.every((count) => count >= 1)).toBe(true);
    }
  });
});

it.each([7, 20, 21, 100])('%i문제에서 최소 10퍼센트를 보장하며 편중도 허용한다', (count) => {
  const exam: SelectedExam = {
    questions: Array.from({ length: count }, (_, i) => makeQuestion({ id: `q${i}` })),
    slotOfQuestion: {},
    blanks: [{ slotId: 's', count: 2 }],
  };
  let uneven = false;
  for (let seed = 0; seed < 30; seed++) {
    const result = standardShuffler.apply(exam, options, createRng(String(seed)));
    const counts = Array.from({ length: 5 }, () => 0);
    for (const q of result.questions) counts[q.choices.findIndex((c) => c.id === q.answerChoiceIds[0])]++;
    const raw = Math.ceil(0.1 * count);
    const m = 5 * raw > count ? Math.floor(count / 5) : raw;
    expect(counts.every((n) => n >= m)).toBe(true);
    if (Math.max(...counts) - Math.min(...counts) > 1) uneven = true;
    expect(result.blanks).toEqual(exam.blanks);
  }
  if (count !== 7) expect(uneven).toBe(true);
});
it('최소 비율 0은 균형 옵션을 끈 결과와 정확히 같다', () => {
  const exam: SelectedExam = {
    questions: Array.from({ length: 20 }, (_, i) => makeQuestion({ id: `q${i}` })),
    slotOfQuestion: {},
    blanks: [],
  };
  for (let seed = 0; seed < 30; seed++) {
    expect(
      standardShuffler.apply(exam, { ...options, minAnswerPositionShare: 0 }, createRng(String(seed))),
    ).toEqual(
      standardShuffler.apply(exam, { ...options, balanceAnswerPositions: false }, createRng(String(seed))),
    );
  }
});
it('사용자 지정 최소 비율과 불가능한 최소 비율의 내림 대체를 적용한다', () => {
  const exam: SelectedExam = {
    questions: Array.from({ length: 20 }, (_, i) => makeQuestion({ id: `q${i}` })),
    slotOfQuestion: {},
    blanks: [],
  };
  for (const share of [0.2, 0.5]) {
    const result = standardShuffler.apply(
      exam,
      { ...options, minAnswerPositionShare: share },
      createRng('custom'),
    );
    const counts = [0, 0, 0, 0, 0];
    for (const q of result.questions) counts[q.choices.findIndex((c) => c.id === q.answerChoiceIds[0])]++;
    expect(counts).toEqual([4, 4, 4, 4, 4]);
  }
});
