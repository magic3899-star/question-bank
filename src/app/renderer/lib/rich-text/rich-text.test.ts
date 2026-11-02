import { describe, expect, it } from 'vitest';
import type { Block } from '../../../../contracts/index';
import {
  blocksToEditor,
  editorHtml,
  editorToBlocks,
  normalizeRuns,
  treeToRuns,
  replaceParagraphs,
} from './index';

describe('DOM 없는 편집기 변환', () => {
  it('편집 중 문단 밖의 기존 이미지·표를 보존하고 빈 DOM 문단을 복원한다', () => {
    const image: Block = { type: 'image', assetId: 'fake' };
    const table: Block = { type: 'table', rows: [[[]]] };
    expect(replaceParagraphs([image, table], [{ type: 'paragraph', runs: [{ text: '추가' }] }])).toEqual([
      image,
      table,
      { type: 'paragraph', runs: [{ text: '추가' }] },
    ]);
    expect(editorToBlocks([{ tag: 'p', children: [{ tag: 'br', children: [] }] }])).toEqual([
      { type: 'paragraph', runs: [] },
    ]);
    expect(treeToRuns([{ text: '첫' }, { tag: 'div', children: [{ text: '둘째' }] }])).toEqual([
      { text: '첫\n둘째' },
    ]);
  });
  it('중첩 서식을 조합하고 같은 서식을 합치며 빈 run을 버린다', () => {
    expect(
      treeToRuns([
        {
          tag: 'b',
          children: [
            { tag: 'u', children: [{ text: '가' }, { text: '' }, { text: '나' }] },
            { tag: 'i', children: [{ tag: 'sup', children: [{ text: '2' }] }] },
          ],
        },
      ]),
    ).toEqual([
      { text: '가나', bold: true, underline: true },
      { text: '2', bold: true, italic: true, superscript: true },
    ]);
    expect(normalizeRuns([{ text: '', bold: true }, { text: '가', bold: false }, { text: '나' }])).toEqual([
      { text: '가나' },
    ]);
  });
  it('허용하지 않은 태그는 텍스트만 보존하고 HTML을 실행 가능한 형태로 출력하지 않는다', () => {
    const tree = [
      { tag: 'script', children: [{ text: '<alert>' }] },
      { tag: 'style', children: [{ text: '색' }] },
      { tag: 'a', children: [{ text: '링크' }] },
      { tag: 'img', children: [] },
    ];
    expect(treeToRuns(tree)).toEqual([{ text: '<alert>색링크' }]);
    expect(editorHtml(tree)).toBe('&lt;alert&gt;색링크');
  });
  it('문단·줄바꿈과 아래첨자를 보존한다', () => {
    expect(
      editorToBlocks([
        { text: '첫' },
        { tag: 'br', children: [] },
        { text: '줄' },
        { tag: 'div', children: [{ tag: 'sub', children: [{ text: '아래' }] }] },
      ]),
    ).toEqual([
      { type: 'paragraph', runs: [{ text: '첫\n줄' }] },
      { type: 'paragraph', runs: [{ text: '아래', subscript: true }] },
    ]);
  });
  it('정규 문단 모델은 모든 서식 조합·빈 문단·줄바꿈을 왕복한다', () => {
    const blocks: Block[] = [
      {
        type: 'paragraph',
        runs: [
          { text: '가\n나', underline: true, bold: true, italic: true, superscript: true, subscript: true },
          { text: ' 끝' },
        ],
      },
      { type: 'paragraph', runs: [] },
    ];
    expect(editorToBlocks(blocksToEditor(blocks))).toEqual(blocks);
    expect(editorHtml(blocksToEditor(blocks))).toContain('<sub><sup><i><b><u>');
  });
});
