import { buildSnapshot } from '../../src/modules/exam-snapshot/index';
import { createRng } from '../../src/modules/rng/index';
import { shufflers } from '../../src/modules/shuffler/index';
import { makePool, makeRuleSet, makeSelectedExam, para } from './builders';

export function makeVariantExam() {
  const sources = makePool(24);
  sources.forEach((question, index) => {
    question.passage = [para(`가짜 지문 ${index}`), { type: 'table', rows: [[[para(`가짜 표 ${index}`)]]] }];
    question.explanation = [para(`가짜 해설 ${index}`)];
    question.grade = 'A';
    question.choices.forEach((choice, position) => {
      choice.content = [para(`가짜 문제 ${index}의 선지 ${position}`)];
    });
  });
  sources[0]!.shufflePolicy = 'lock-all';
  sources[1]!.choices[1]!.fixedPosition = true;
  sources[1]!.choices[4]!.fixedPosition = true;
  sources[2]!.passageGroupId = 'fake-group';
  sources[3]!.passageGroupId = 'fake-group';
  const rules = makeRuleSet({ startNumber: 21 });
  const shuffle = {
    shuffleQuestionOrder: true,
    shuffleChoices: true,
    balanceAnswerPositions: true,
    minAnswerPositionShare: 0.1,
    sortByObjective: true,
  };
  const selected = makeSelectedExam({
    questions: sources,
    slotOfQuestion: Object.fromEntries(sources.map((question) => [question.id, 'slot-1'])),
    blanks: [{ slotId: 'slot-1', count: 2 }],
  });
  const snapshot = buildSnapshot({
    exam: shufflers[0]!.apply(selected, shuffle, createRng('fake-odd')),
    rules,
    examIndex: 0,
    seed: 'fake-variant',
    title: '가짜 시험',
    examId: 'fake-variant',
    createdAt: '2026-01-01T00:00:00Z',
    assets: {},
  }).snapshot;
  return { rules, sources, assets: {}, snapshot, seed: 'fake-even', shuffle };
}
