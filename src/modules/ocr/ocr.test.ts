import { describe, expect, it } from 'vitest';
import { findGutter, mergeColumns, orderOcrLines } from './index';
import type { OcrLine } from './index';

const word = (text: string, x0: number, x1: number) => ({ text, x0, x1, y0: 0, y1: 30 });
const line = (...words: ReturnType<typeof word>[]): OcrLine => ({
  text: words.map((entry) => entry.text).join(' '),
  words,
  top: Math.min(...words.map((entry) => entry.y0)),
  bottom: Math.max(...words.map((entry) => entry.y1)),
});

/** 쪽 너비 1000, 왼쪽 단은 x 100~450, 오른쪽 단은 x 550~900 인 2단 조판의 줄들. */
function twoColumns(rows: number): OcrLine[] {
  return Array.from({ length: rows }, (_, row) =>
    line(
      word(`L${row}a`, 100, 250),
      word(`L${row}b`, 270, 450),
      word(`R${row}a`, 550, 700),
      word(`R${row}b`, 720, 900),
    ),
  );
}

describe('OCR 읽기 순서', () => {
  it('2단 조판은 왼쪽 단을 다 읽은 뒤 오른쪽 단을 읽는다', () => {
    const lines = twoColumns(4);
    const gutter = findGutter(lines);
    expect(gutter).toBeGreaterThan(450);
    expect(gutter).toBeLessThan(550);
    expect(orderOcrLines(lines)).toEqual([
      'L0a L0b',
      'L1a L1b',
      'L2a L2b',
      'L3a L3b',
      'R0a R0b',
      'R1a R1b',
      'R2a R2b',
      'R3a R3b',
    ]);
  });

  it('전체 폭에 걸친 제목 한 줄이 있어도 단을 나눈다', () => {
    const result = orderOcrLines([line(word('제목', 100, 900)), ...twoColumns(6)]);
    expect(result).toHaveLength(13);
    expect(result.slice(0, 2)).toEqual(['제목', 'L0a L0b']);
    expect(result.at(-1)).toBe('R5a R5b');
  });

  it('본문 가운데 전체 폭 줄(소제목)이 끼면 그 앞뒤에서 단을 따로 읽는다', () => {
    const rows = twoColumns(4);
    const result = orderOcrLines([rows[0]!, rows[1]!, line(word('소제목', 100, 900)), rows[2]!, rows[3]!]);
    expect(result).toEqual([
      'L0a L0b',
      'L1a L1b',
      'R0a R0b',
      'R1a R1b',
      '소제목',
      'L2a L2b',
      'L3a L3b',
      'R2a R2b',
      'R3a R3b',
    ]);
  });

  it('1단 조판은 인식기가 판단한 문장(띄어쓰기 포함)을 그대로 쓴다', () => {
    const single: OcrLine[] = Array.from({ length: 8 }, (_, row) => ({
      text: `가나다 라마  바사${row}`,
      words: [word('가나다', 100, 300), word('라마', 320, 600), word(`바사${row}`, 620, 900)],
      top: 0,
      bottom: 30,
    }));
    expect(findGutter(single)).toBeUndefined();
    expect(orderOcrLines(single)[0]).toBe('가나다 라마 바사0');
    expect(findGutter(twoColumns(1))).toBeUndefined();
    expect(orderOcrLines([])).toEqual([]);
  });

  it('2단에서 음절 단위로 쪼개진 글자는 간격으로 띄어쓰기를 복원한다', () => {
    // 같은 낱말 안의 음절 간격은 글자 높이(30)의 0.3 배, 낱말 사이는 0.7 배
    const syllables = (x: number) => [
      word('가', x, x + 30),
      word('짜', x + 39, x + 69),
      word('법', x + 90, x + 120),
      word('상', x + 129, x + 159),
    ];
    const rows = Array.from({ length: 4 }, () => ({
      text: '가짜 법 상 가짜 법 상',
      words: [...syllables(100), ...syllables(600)],
      top: 0,
      bottom: 30,
    }));
    expect(orderOcrLines(rows)[0]).toBe('가짜 법상');
  });

  it('오른쪽에 단어가 몇 개뿐이면 단 구분이 아니라 여백으로 본다', () => {
    const sparse: OcrLine[] = [
      ...Array.from({ length: 5 }, (_, row) => line(word(`x${row}`, 100, 200), word(`y${row}`, 220, 400))),
      line(word('주', 700, 760), word('석', 780, 840), word('끝', 860, 900)),
    ];
    expect(findGutter(sparse)).toBeUndefined();
    expect(orderOcrLines(sparse)[5]).toBe('주 석 끝');
  });

  it('빈 단어는 버린다', () => {
    expect(orderOcrLines([line(word(' ', 0, 5), word('가', 10, 20))])).toEqual(['가']);
  });
});

describe('단을 따로 인식한 결과 합치기', () => {
  const at = (text: string, top: number): OcrLine => ({ text, words: [], top, bottom: top + 30 });
  it('왼쪽 단 → 오른쪽 단 순서로, 전체 폭 줄은 경계로 둔다', () => {
    const result = mergeColumns(
      [at('소제목', 300)],
      [at('좌2', 100), at('좌1', 40), at('좌3', 350)],
      [at('우1', 40), at('우3', 360), at('우2', 120)],
    );
    expect(result).toEqual(['좌1', '좌2', '우1', '우2', '소제목', '좌3', '우3']);
  });

  it('전체 폭 줄이 없으면 한 구역이고 빈 줄은 버린다', () => {
    expect(mergeColumns([], [at('  ', 10), at('가', 20)], [at('나', 5)])).toEqual(['가', '나']);
    expect(mergeColumns([], [], [])).toEqual([]);
  });
});
