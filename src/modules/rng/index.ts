import type { Rng } from '../../contracts/index';

function hashSeed(seed: string): number {
  let hash = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function createRng(seed: string): Rng {
  let state = hashSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    int(n) {
      if (!Number.isSafeInteger(n) || n <= 0) {
        throw new RangeError('난수 범위가 올바르지 않습니다. 양의 안전한 정수를 입력하세요.');
      }
      return Math.floor(next() * n);
    },
    fork: (label) => createRng(`${seed}/${label}`),
  };
}

export function shuffleInPlace<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  return shuffleInPlace([...arr], rng);
}
