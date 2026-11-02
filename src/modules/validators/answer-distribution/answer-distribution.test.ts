import { expect, it } from 'vitest';
import { makeQuestion } from '../../../../tests/fixtures/builders';
import { answerDistributionValidator as validator } from './index';

it('균형·빈 정답은 통과하고 평균 1.5배 초과 쏠림을 알린다', () => {
  expect(validator.validateAll!([])).toEqual([]);
  expect(validator.validateAll!([makeQuestion({ answerChoiceIds: [] })])).toEqual([]);
  const balanced = Array.from({ length: 5 }, (_, i) =>
    makeQuestion({ answerChoiceIds: [`choice-${i + 1}`] }),
  );
  expect(validator.validateAll!(balanced)).toEqual([]);
  const diagnostics = validator.validateAll!(Array.from({ length: 10 }, () => makeQuestion()));
  expect(diagnostics).toEqual([
    expect.objectContaining({
      code: 'ANSWER_SKEW',
      severity: 'info',
      message: expect.stringContaining('1번 10개'),
    }),
  ]);
  const boundary = Array.from({ length: 5 }, (_, i) =>
    makeQuestion({
      choices: makeQuestion().choices.slice(0, 2),
      answerChoiceIds: [i < 3 ? 'choice-1' : 'choice-2'],
    }),
  );
  expect(validator.validateAll!(boundary)).toEqual([]);
});
