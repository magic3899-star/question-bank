import { expect, it } from 'vitest';
import { makeQuestion, para } from '../../../../tests/fixtures/builders';
import { emptyContentValidator as validator } from './index';

it('빈 본문을 거부하며 글자·이미지·표 내용은 허용한다', () => {
  for (const stem of [[], [para('　 \n')], [{ type: 'table' as const, rows: [[[para(' ')]]] }]]) {
    expect(validator.validate!(makeQuestion({ stem }))[0]).toMatchObject({
      code: 'STEM_EMPTY',
      severity: 'error',
    });
  }
  expect(validator.validate!(makeQuestion())).toEqual([]);
  expect(validator.validate!(makeQuestion({ stem: [{ type: 'image', assetId: 'fake' }] }))).toEqual([]);
  expect(
    validator.validate!(makeQuestion({ stem: [{ type: 'table', rows: [[[para('가짜 셀')]]] }] })),
  ).toEqual([]);
});
