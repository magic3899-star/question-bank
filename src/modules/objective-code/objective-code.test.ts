import { describe, expect, it } from 'vitest';
import { compareObjectiveCodes, matchesObjectivePrefix, parseObjectiveCode, segmentKey } from './index';

describe('학습목표 코드', () => {
  it('공백과 숫자를 정규화한다', () => {
    expect(parseObjectiveCode('　해부　 2 - 2-004 ')).toEqual({ subject: '해부', segments: [2, 2, 4] });
    expect(parseObjectiveCode('과목 999999999999')).toEqual({ subject: '과목', segments: [999999999999] });
    expect(segmentKey('해부 2-2-4', 2)).toBe('해부 2-2');
    expect(segmentKey('해부 2', 20)).toBe('해부 2');
    expect(segmentKey('해부 2', 0)).toBeNull();
    expect(segmentKey('해부 2', 1.5)).toBeNull();
  });
  it.each(['', ' ', '해부', '해부1-2', '해부 1-', '해부 -1', '해부 1--2', '해부 1.2', '해부 1-x', '해부 9007199254740992', '? 1'])('잘못된 코드: %s', (code) => {
    expect(parseObjectiveCode(code)).toBeNull();
    expect(matchesObjectivePrefix(code, '해부')).toBe(false);
    expect(segmentKey(code, 2)).toBeNull();
  });
  it('문자 접두가 아니라 구간을 비교한다', () => {
    for (const prefix of ['해부', '해부 1', '해부 1-', ' 해부　1　- ']) expect(matchesObjectivePrefix('해부 1-2-3', prefix)).toBe(true);
    expect(matchesObjectivePrefix('해부 2-2-4', '해부 2-2')).toBe(true);
    expect(matchesObjectivePrefix('해부 14-1-3', '해부 1')).toBe(false);
    expect(matchesObjectivePrefix('법규 1-2', '해부 1')).toBe(false);
    expect(matchesObjectivePrefix('해부 1', '해부 1-2')).toBe(false);
    expect(matchesObjectivePrefix('해부 1', '')).toBe(false);
  });
  it('과목 다음 숫자 순서로 정렬하며 잘못된 코드도 결정적으로 정렬한다', () => {
    expect(['해부 14', '해부 1-10', '해부 1-2', '법규 1', '해부 1'].sort(compareObjectiveCodes))
      .toEqual(['법규 1', '해부 1', '해부 1-2', '해부 1-10', '해부 14']);
    expect(compareObjectiveCodes('해부 01', '해부 1')).toBe(0);
    expect(compareObjectiveCodes('오류', '해부 1')).toBeGreaterThan(0);
    expect(compareObjectiveCodes('해부 1', '오류')).toBeLessThan(0);
    expect(compareObjectiveCodes('', '오류')).toBeLessThan(0);
  });
});
