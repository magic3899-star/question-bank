import { expect, it } from 'vitest';
import { makeChoice, makeQuestion, para } from '../../../../tests/fixtures/builders';
import { choiceCountValidator as validator } from './index';

it('선지 수·빈 내용·중복 ID와 이미지 선지를 검사한다', () => {
  expect(validator.validate!(makeQuestion())).toEqual([]);
  for (const count of [0, 1, 2, 4, 6]) {
    const q = makeQuestion({ choices: Array.from({ length: count }, (_, i) => makeChoice({ id: `c${i}` })) });
    expect(validator.validate!(q)[0]).toMatchObject({ code: count < 2 ? 'CHOICES_TOO_FEW' : 'CHOICE_COUNT_UNUSUAL', severity: count < 2 ? 'error' : 'warn' });
  }
  const q = makeQuestion();
  q.choices[0].content = [para('　 ')]; q.choices[1].id = q.choices[0].id;
  q.choices[2].content = [{ type: 'image', assetId: 'fake' }];
  expect(validator.validate!(q).map((d) => d.code)).toEqual(['CHOICE_EMPTY', 'CHOICE_ID_DUPLICATE']);
});
