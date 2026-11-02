import { afterEach, describe, expect, it, vi } from 'vitest';
const effects = vi.hoisted(() => [] as (() => void | (() => void))[]);
vi.mock('react', () => ({ useEffect: (effect: () => void | (() => void)) => effects.push(effect) }));
import { useReadySignal } from './useReadySignal';

afterEach(() => {
  effects.length = 0;
  vi.unstubAllGlobals();
});
describe('화면 준비 신호', () => {
  function setup() {
    const dataset: Record<string, string> = { ready: 'previous' };
    vi.stubGlobal('document', { body: { dataset } });
    return dataset;
  }
  it('로딩 중 이전 화면 신호를 지우고 준비된 화면과 오류를 기록한다', () => {
    const dataset = setup();
    useReadySignal('bank', true);
    effects.pop()!();
    expect(dataset.ready).toBeUndefined();
    useReadySignal('bank', false, '목록을 다시 불러오세요.');
    const cleanup = effects.pop()!();
    expect(dataset).toEqual({ ready: 'bank', error: '목록을 다시 불러오세요.' });
    cleanup?.();
    expect(dataset.ready).toBeUndefined();
  });
  it('앱 셸이 비활성일 때 자식 화면의 신호를 지우지 않는다', () => {
    const dataset = setup();
    useReadySignal('home', false, '', false);
    effects.pop()!();
    expect(dataset.ready).toBe('previous');
  });
});
