import { expect, it } from 'vitest';
import { makeQuestion, para } from '../../../../tests/fixtures/builders';
import { duplicateChoicesValidator as validator } from './index';

it('같은 선지의 위치를 알리고 빈 선지는 중복 경고에서 제외한다', () => {
  const q = makeQuestion();
  expect(validator.validate!(q)).toEqual([]);
  q.choices[0].content = [para('가짜 TEST')];
  q.choices[1].content = [para(' 가짜　test ')];
  q.choices[2].content = [];
  q.choices[3].content = [];
  expect(validator.validate!(q)).toEqual([
    expect.objectContaining({
      code: 'DUPLICATE_CHOICES',
      severity: 'warn',
      message: expect.stringContaining('1번과 2번'),
    }),
  ]);
  q.choices[1].content = [para('서로 다른 글자')];
  q.choices[2].content = [{ type: 'image', assetId: 'fake-a' }];
  q.choices[3].content = [{ type: 'image', assetId: 'fake-b' }];
  expect(validator.validate!(q)).toEqual([]);
});
