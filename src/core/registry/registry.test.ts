import { describe, expect, it } from 'vitest';
import type { Constraint, Validator } from '../../contracts/index';
import { createRegistry } from './index';

describe('플러그인 등록소', () => {
  const validator: Validator = { kind: 'validator', id: 'dummy', label: '가짜 검사', validate: () => [] };
  const constraint: Constraint = { kind: 'constraint', id: 'dummy', label: '가짜 제약' };

  it('종류별 등록 및 조회와 없는 플러그인을 처리한다', () => {
    const registry = createRegistry();
    expect(registry.all('validator')).toEqual([]);
    expect(registry.get('validator', 'missing')).toBeUndefined();
    registry.register(validator);
    registry.register(constraint);
    expect(registry.all('validator')).toEqual([validator]);
    expect(registry.get('validator', 'dummy')).toBe(validator);
    expect(registry.get('constraint', 'dummy')).toBe(constraint);
    registry.all('validator').pop();
    expect(registry.all('validator')).toEqual([validator]);
    expect(createRegistry().all('validator')).toEqual([]);
  });

  it('같은 kind와 id의 중복 등록에 한국어 오류를 반환한다', () => {
    const registry = createRegistry();
    registry.register(validator);
    expect(() => registry.register({ ...validator })).toThrow('다른 ID를 사용하세요');
    expect(registry.all('validator')).toEqual([validator]);
  });
});
