import { expect, it } from 'vitest';
import { deepFreeze, para } from '../../../tests/fixtures/builders';
import { referencesChoiceLabels } from './index';

it('①부터 ⑩까지의 참조를 찾고 중첩 표와 여러 run을 검사한다', () => {
  for (const label of '①②③④⑤⑥⑦⑧⑨⑩') {
    expect(
      referencesChoiceLabels(
        deepFreeze([
          {
            type: 'table',
            rows: [
              [
                [
                  {
                    type: 'table',
                    rows: [[[para(`가짜 ${label} 설명`)]]],
                  },
                ],
              ],
            ],
          },
        ]),
      ),
    ).toBe(true);
  }
  expect(referencesChoiceLabels([{ type: 'paragraph', runs: [{ text: '앞' }, { text: '⑩' }] }])).toBe(true);
});

it('빈 블록·빈 표·일반 번호·이미지의 대체 텍스트는 참조가 아니다', () => {
  expect(referencesChoiceLabels([])).toBe(false);
  expect(
    referencesChoiceLabels([
      para('1. (2) ⑪ 가짜 본문'),
      { type: 'table', rows: [] },
      { type: 'image', assetId: '①', alt: '②' },
    ]),
  ).toBe(false);
});
