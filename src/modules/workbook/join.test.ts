import { describe, expect, it } from 'vitest';
import { joinWrapped } from './join';
import { buildVocabulary } from './vocabulary';

describe('책 전체 낱말 빈도와 줄 이음', () => {
  it('줄의 첫·마지막 토큰을 제외하고 내부 토큰·인접 쌍만 센다', () => {
    const vocab = buildVocabulary([
      '조각 (사과나무), 바나나! 끝조각',
      '조각 사과나무 끝조각',
      '조각 사과나무 • 바나나 끝조각',
    ]);
    expect([...vocab.token]).toEqual([
      ['사과나무', 3],
      ['바나나', 2],
    ]);
    expect(vocab.pair.get('사과나무 바나나')).toBe(2);
    expect(vocab.token.has('조각')).toBe(false);
  });

  it('완전한 낱말 빈도가 높으면 원문의 문장부호를 보존하며 붙인다', () => {
    const vocab = buildVocabulary(['앞 사과나무 뒤', '앞 사과나무 뒤', '앞 사과 나무 뒤']);
    expect(joinWrapped('가짜 사과', '나무, 가짜', vocab)).toEqual({
      text: '가짜 사과나무, 가짜',
      joined: true,
      estimated: false,
    });
  });

  it('인접 쌍 빈도가 높거나 동수이면 띄운다', () => {
    expect(joinWrapped('사과', '나무', buildVocabulary(['앞 사과 나무 뒤']))).toMatchObject({
      joined: false,
      estimated: false,
    });
    expect(joinWrapped('사과', '나무', buildVocabulary(['앞 사과나무 뒤', '앞 사과 나무 뒤']))).toMatchObject(
      { joined: false, estimated: false },
    );
  });

  it('미등록 조사·어미는 붙이고 다른 미등록 낱말은 띄우며 추정으로 센다', () => {
    const empty = buildVocabulary([]);
    expect(joinWrapped('사과나무', '는 바나나', empty)).toMatchObject({
      text: '사과나무는 바나나',
      estimated: true,
    });
    expect(joinWrapped('사과나무', '바나나', empty)).toMatchObject({ joined: false, estimated: true });
    expect(joinWrapped('사과나무,', '는 바나나', empty).joined).toBe(false);
  });

  it.each(['.', '?', '!', ':'])('문장 끝 %s에서는 빈도와 관계없이 띄운다', (end) => {
    expect(joinWrapped(`사과${end}`, '나무', buildVocabulary(['앞 사과나무 뒤']))).toMatchObject({
      joined: false,
      estimated: false,
    });
  });

  it.each([
    ['abc', 'def'],
    ['123', '456'],
    ['사과', '123'],
    ['abc', '나무'],
    ['사과', '→'],
  ])('영문·숫자·기호 경계 %s / %s는 띄운다', (prev, next) => {
    expect(joinWrapped(prev, next, buildVocabulary([]))).toEqual({
      text: `${prev} ${next}`,
      joined: false,
      estimated: false,
    });
  });

  it('빈 줄에서는 불필요한 공백을 만들지 않는다', () => {
    expect(joinWrapped('', '사과', buildVocabulary([])).text).toBe('사과');
    expect(joinWrapped('사과', '', buildVocabulary([])).text).toBe('사과');
  });
});
