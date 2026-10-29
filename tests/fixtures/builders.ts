import type {
  Choice, SelectedExam, HistoryEntry, InlineRun, ParagraphBlock, Question, RuleSet,
} from '../../src/contracts/index';

export function para(text: string, style: Omit<InlineRun, 'text'> = {}): ParagraphBlock {
  return { type: 'paragraph', runs: [{ text, ...style }] };
}

export function makeChoice(overrides: Partial<Choice> = {}): Choice {
  return { id: 'choice-1', content: [para('가짜 선지 1')], ...overrides };
}

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'question-1', schemaVersion: 1, subject: 'dummy', type: 'mcq',
    passage: [para('가짜 지문 1')], stem: [para('가짜 문제 1')],
    choices: Array.from({ length: 5 }, (_, i) => makeChoice({
      id: `choice-${i + 1}`, content: [para(`가짜 선지 ${i + 1}`)],
    })),
    answerChoiceIds: ['choice-1'], explanation: [para('가짜 해설 1')],
    shufflePolicy: 'free', objectiveCode: '가짜목표 1-1', tags: ['가짜태그'], extra: {},
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeRuleSet(overrides: Partial<RuleSet> = {}): RuleSet {
  return {
    id: 'rules-1', schemaVersion: 1, name: '가짜 규칙 1', subject: 'dummy',
    examCount: 1, startNumber: 1,
    slots: [{ id: 'slot-1', label: '가짜 영역 1', count: 1, filter: { kind: 'all' } }],
    constraints: [], ...overrides,
  };
}

export function makeHistoryEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    examId: 'exam-1', createdAt: '2026-01-01T00:00:00.000Z', ruleSetId: 'rules-1',
    seed: 'dummy-seed', title: '가짜 시험 1', questionIds: ['question-1'], ...overrides,
  };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function makePool(count: number): Question[] {
  return Array.from({ length: count }, (_, index) => makeQuestion({
    id: `q${index}`, stem: [para(`가짜 문제 ${index}`)],
    objectiveCode: `과목 ${index % 9 + 1}-${Math.floor(index / 9) + 1}-${index + 1}`,
  }));
}

export function makeSelectedExam(overrides: Partial<SelectedExam> = {}): SelectedExam {
  return { questions: [], slotOfQuestion: {}, blanks: [], ...overrides };
}

export function makeSegmentPool(segmentCount: number, questionsPerSegment: number, unit = 1): Question[] {
  return Array.from({ length: segmentCount }, (_, segment) => Array.from({ length: questionsPerSegment }, (_, item) => {
    const id = `law${unit}-segment${segment + 1}-item${item + 1}`;
    return makeQuestion({ id, subject: 'law', stem: [para(`가짜 문제 ${id}`)], objectiveCode: `법규 ${unit}-${segment + 1}-${item + 1}` });
  })).flat();
}
