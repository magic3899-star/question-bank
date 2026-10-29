import { expect, it } from 'vitest';
import { makeQuestion } from '../../../../tests/fixtures/builders';
import { objectiveMissingValidator as validator } from './index';

it('누락·빈 학습목표를 경고하고 정상 목표는 통과한다', () => {
  expect(validator.validate!(makeQuestion())).toEqual([]);
  for (const objectiveCode of [undefined, '', '　 \t']) {
    expect(validator.validate!(makeQuestion({ objectiveCode }))).toEqual([expect.objectContaining({ code: 'OBJECTIVE_MISSING', severity: 'warn', message: expect.stringContaining('학습목표가 없으면 출제 규칙 대상에서 빠집니다') })]);
  }
});
