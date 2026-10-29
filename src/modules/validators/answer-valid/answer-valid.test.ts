import { expect, it } from 'vitest';
import { makeQuestion } from '../../../../tests/fixtures/builders';
import { answerValidValidator as validator } from './index';

it('정답 누락·존재하지 않는 ID·중복·개수 초과를 거부하고 복수 정답을 허용한다', () => {
  expect(validator.validate!(makeQuestion())).toEqual([]);
  expect(validator.validate!(makeQuestion({ answerChoiceIds: ['choice-1', 'choice-3'] }))).toEqual([]);
  expect(validator.validate!(makeQuestion({ answerChoiceIds: [] }))[0].code).toBe('ANSWER_MISSING');
  for (const answerChoiceIds of [['c99'], ['choice-1', 'choice-1'], Array.from({ length: 6 }, (_, i) => `choice-${i + 1}`)]) {
    expect(validator.validate!(makeQuestion({ answerChoiceIds }))[0]).toMatchObject({ code: 'ANSWER_INVALID', severity: 'error' });
  }
});
