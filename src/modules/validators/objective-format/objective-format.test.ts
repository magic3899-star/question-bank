import { expect, it } from 'vitest';
import { makeQuestion } from '../../../../tests/fixtures/builders';
import { objectiveFormatValidator as validator } from './index';

it('과목·일반 공백·코드 형식을 검사하며 누락 검사는 분리한다', () => {
  for (const objectiveCode of ['법규 1-1-3', undefined, ''])
    expect(validator.validate!(makeQuestion({ objectiveCode }))).toEqual([]);
  for (const objectiveCode of ['법규1-1-3', '법규　1-1-3', '법규  1-1', '법규 1', '법규 1-x']) {
    expect(validator.validate!(makeQuestion({ objectiveCode }))[0]).toMatchObject({
      code: 'OBJECTIVE_FORMAT',
      severity: 'warn',
    });
  }
});
