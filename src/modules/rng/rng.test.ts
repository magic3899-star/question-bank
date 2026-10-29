import { describe, expect, it } from 'vitest';
import { createRng, shuffled, shuffleInPlace } from './index';

const sequence = (seed: string) => {
  const rng = createRng(seed);
  return Array.from({ length: 100 }, () => rng.next());
};

describe('시드 난수', () => {
  it('같은 시드는 같은 열, 다른 시드는 다른 열을 만든다', () => {
    expect(sequence('가짜 시드')).toEqual(sequence('가짜 시드'));
    expect(sequence('가짜 시드')).not.toEqual(sequence('다른 시드'));
    expect(sequence('')).toEqual(sequence(''));
  });

  it('next와 int의 범위를 지킨다', () => {
    const rng = createRng('range');
    for (const n of [1, 2, 5, 100, Number.MAX_SAFE_INTEGER]) {
      for (let i = 0; i < 1000; i++) {
        const value = rng.int(n);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(n);
        const next = rng.next();
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(1);
      }
    }
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('잘못된 범위 %s를 거부한다', (n) => {
    expect(() => createRng('invalid').int(n)).toThrow('양의 안전한 정수');
  });

  it('fork는 부모 소비량과 다른 fork의 소비량에 영향을 받지 않는다', () => {
    const parent = createRng('parent');
    const child = parent.fork('child');
    expect(child.seed).toBe('parent/child');
    const expected = createRng('parent/child');
    for (let i = 0; i < 100; i++) {
      parent.next();
      parent.fork('other').next();
      expect(child.next()).toBe(expected.next());
    }
    expect(parent.fork('child').next()).toBe(createRng('parent/child').next());
    const control = createRng('parent');
    for (let i = 0; i < 100; i++) control.next();
    expect(parent.next()).toBe(control.next());
  });

  it('int(5) 1만 회에서 각 구간이 기대값 2000의 ±10%(1800~2200)에 들어간다', () => {
    const rng = createRng('distribution-10000');
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) counts[rng.int(5)]++;
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(1800);
      expect(count).toBeLessThanOrEqual(2200);
    }
  });
});

describe('Fisher-Yates 섞기', () => {
  it('같은 시드로 재현하고 원소를 보존한다', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const output = shuffled(input, createRng('shuffle'));
    expect(output).toEqual(shuffled(input, createRng('shuffle')));
    expect(output).not.toEqual(input);
    expect([...output].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(shuffleInPlace(input, createRng('shuffle'))).toBe(input);
    expect(input).toEqual(output);
  });

  it('빈 배열과 단일 원소 배열을 처리한다', () => {
    expect(shuffled([], createRng('empty'))).toEqual([]);
    expect(shuffled(['가짜'], createRng('single'))).toEqual(['가짜']);
  });
});
