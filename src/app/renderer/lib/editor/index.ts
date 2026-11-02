import type { Question } from '../../../../contracts/index';
import type { ParsedExplanation } from '../../../shared/index';
import { referencesChoiceLabels } from '../../../../modules/content-model/index';

export function newQuestion(subject: string, previous?: Question): Question {
  return {
    id: '',
    schemaVersion: 1,
    subject,
    type: 'mcq',
    stem: [],
    passage: [],
    choices: Array.from({ length: 5 }, (_, i) => ({ id: `c${i + 1}`, content: [] })),
    answerChoiceIds: [],
    explanation: [],
    shufflePolicy: 'free',
    objectiveCode: previous?.objectiveCode,
    grade: previous?.grade,
    tags: [],
    extra: {},
    createdAt: '',
    updatedAt: '',
  };
}
export function autoPolicy(q: Question): Question {
  const reference = referencesChoiceLabels([...q.stem, ...(q.passage ?? []), ...q.explanation]);
  return reference && !q.extra.allowChoiceShuffle ? { ...q, shufflePolicy: 'lock-all' } : q;
}
export function matchExplanations(questions: Question[], explanations: ParsedExplanation[]) {
  return {
    rows: questions.map((question, index) => {
      const number = String(question.extra.originalNumber ?? question.extra.addOrder ?? index + 1);
      const matches = explanations.filter((e) => e.number === number);
      const unique =
        questions.filter((q, i) => String(q.extra.originalNumber ?? q.extra.addOrder ?? i + 1) === number)
          .length === 1;
      return {
        question,
        number,
        explanation: unique && matches.length === 1 ? matches[0] : undefined,
        ambiguous: !unique || matches.length > 1,
      };
    }),
    unmatched: explanations.filter(
      (e) =>
        !questions.some((q, i) => String(q.extra.originalNumber ?? q.extra.addOrder ?? i + 1) === e.number),
    ),
  };
}
