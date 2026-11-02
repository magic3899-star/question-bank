import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Block } from '../../contracts/index';
import { para } from '../../../tests/fixtures/builders';
import {
  canonicalJson,
  questionContentKey,
  blocksEqual,
  blocksToPlainText,
  collectAssetIds,
  hashBlocks,
  isEmptyBlocks,
  normalizeBlocks,
  sha256Hex,
} from './index';

describe('내용 블록', () => {
  it('canonicalJson은 중첩 키를 정렬하고 undefined를 제외하며 배열 순서를 유지한다', () => {
    expect(canonicalJson({ z: undefined, b: [3, undefined, { z: 1, a: 2 }], a: null })).toBe(
      '{"a":null,"b":[3,{"a":2,"z":1}]}',
    );
    expect(canonicalJson({ a: { b: false, a: '한글' } })).toBe(canonicalJson({ a: { a: '한글', b: false } }));
  });
  it.each([
    '',
    'abc',
    '가짜 한글 문자열 🧪',
    ...[55, 56, 63, 64, 65, 1024 * 1024].map((length) => Uint8Array.from({ length }, (_, i) => i % 251)),
    new Uint8Array(0),
  ])('브라우저 SHA-256이 Node 구현과 일치한다: %#', (data) => {
    expect(sha256Hex(data)).toBe(createHash('sha256').update(data).digest('hex'));
  });
  const nested: Block[] = [
    para('가짜 문단'),
    {
      type: 'table',
      rows: [
        [
          [para('가짜 셀 1')],
          [{ type: 'table', rows: [[[para('가짜 중첩 셀')], [{ type: 'image', assetId: 'asset-1' }]]] }],
        ],
        [[para('가짜 셀 2')], [{ type: 'image', assetId: 'asset-2' }]],
      ],
    },
    { type: 'image', assetId: 'asset-1' },
  ];

  it('중첩 표를 탭과 줄바꿈으로 변환하고 이미지 표식을 넣는다', () => {
    expect(blocksToPlainText(nested)).toBe(
      '가짜 문단\n가짜 셀 1\t가짜 중첩 셀\t[이미지]\n가짜 셀 2\t[이미지]\n[이미지]',
    );
    expect(blocksToPlainText([])).toBe('');
    expect(collectAssetIds(nested)).toEqual(['asset-1', 'asset-2']);
  });

  it('같은 서식 병합, 빈 run 제거, 문단 끝 공백 정리와 밑줄을 보존한다', () => {
    const input: Block[] = [
      {
        type: 'paragraph',
        runs: [
          { text: '가짜 ', underline: true },
          { text: '' },
          { text: '문장', underline: true, bold: false },
          { text: ' ', italic: true },
          { text: '\t ', bold: true },
        ],
      },
    ];
    const original = JSON.stringify(input);
    expect(normalizeBlocks(input)).toEqual([para('가짜 문장', { underline: true })]);
    expect(JSON.stringify(input)).toBe(original);
    expect(blocksEqual(input, [para('가짜 문장', { underline: true })])).toBe(true);
    expect(blocksEqual(input, [para('가짜 문장')])).toBe(false);
  });

  it('중첩 표에서도 모든 서식을 보존하며 멱등적이다', () => {
    const input: Block[] = [
      {
        type: 'table',
        rows: [
          [
            [
              {
                type: 'table',
                rows: [
                  [
                    [
                      para('가짜  ', {
                        underline: true,
                        bold: true,
                        italic: true,
                        superscript: true,
                        subscript: true,
                      }),
                    ],
                  ],
                ],
              },
            ],
          ],
        ],
      },
    ];
    const expected: Block[] = [
      {
        type: 'table',
        rows: [
          [
            [
              {
                type: 'table',
                rows: [
                  [
                    [
                      para('가짜', {
                        underline: true,
                        bold: true,
                        italic: true,
                        superscript: true,
                        subscript: true,
                      }),
                    ],
                  ],
                ],
              },
            ],
          ],
        ],
      },
    ];
    expect(normalizeBlocks(input)).toEqual(expected);
    expect(normalizeBlocks(normalizeBlocks(input))).toEqual(expected);
    expect(normalizeBlocks(normalizeBlocks(nested))).toEqual(normalizeBlocks(nested));
  });

  it('키 순서와 run 분할에 무관한 canonical SHA-256을 만든다', () => {
    expect(
      hashBlocks([{ type: 'paragraph', runs: [{ text: '가짜' }, { text: ' 문장  ', bold: false }] }]),
    ).toBe(hashBlocks([para('가짜 문장')]));
    expect(hashBlocks([{ type: 'image', assetId: 'a', widthPx: 10 }])).toBe(
      hashBlocks([{ widthPx: 10, assetId: 'a', type: 'image' }]),
    );
    expect(hashBlocks([])).toBe(createHash('sha256').update('[]').digest('hex'));
    expect(hashBlocks([para('가짜 문장', { underline: true })])).toBe(
      createHash('sha256')
        .update('[{"runs":[{"text":"가짜 문장","underline":true}],"type":"paragraph"}]')
        .digest('hex'),
    );
    expect(hashBlocks([para('가짜', { underline: true })])).not.toBe(hashBlocks([para('가짜')]));
    expect(hashBlocks(nested)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('공백과 빈 표는 비었고 이미지와 중첩 표 안의 글자는 비지 않았다', () => {
    expect(isEmptyBlocks([])).toBe(true);
    expect(isEmptyBlocks([para(' \t\n')])).toBe(true);
    expect(isEmptyBlocks([{ type: 'table', rows: [[[para(' ')]]] }])).toBe(true);
    expect(isEmptyBlocks(nested)).toBe(false);
    expect(isEmptyBlocks([{ type: 'image', assetId: 'a' }])).toBe(false);
    expect(normalizeBlocks([para(' '), para('')])).toEqual([
      { type: 'paragraph', runs: [] },
      { type: 'paragraph', runs: [] },
    ]);
  });
});

describe('questionContentKey', () => {
  it('앞 번호·공백·전각공백·대소문자를 제거하고 선지를 포함하지 않는다', () => {
    const a = { stem: [para('01. 가 짜 TEST')], passage: [para('보기　문장')] };
    const b = { stem: [para('가짜test')], passage: [para('보기문장')], choices: [para('다른 선지')] };
    expect(questionContentKey(a)).toBe(questionContentKey(b));
    expect(questionContentKey({ ...b, passage: [para('다른 보기')] })).not.toBe(questionContentKey(a));
    expect(questionContentKey({ stem: [para('정의 1. 유지')] })).not.toBe(
      questionContentKey({ stem: [para('정의 유지')] }),
    );
  });
  it('중첩 표 이미지의 asset id를 포함하고 선지 이미지는 제외한다', () => {
    const stem: Block[] = [{ type: 'table', rows: [[[{ type: 'image', assetId: 'one' }]]] }];
    const other: Block[] = [{ type: 'table', rows: [[[{ type: 'image', assetId: 'two' }]]] }];
    expect(questionContentKey({ stem })).not.toBe(questionContentKey({ stem: other }));
    expect(questionContentKey({ stem })).toBe(questionContentKey({ stem: structuredClone(stem) }));
  });
});
