import { describe, expect, it, vi } from 'vitest';
import { afterTwoFrames } from './afterTwoFrames';

function scheduler() {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  return {
    request: (callback: FrameRequestCallback) => {
      queue.set(++id, callback);
      return id;
    },
    cancel: (key: number) => {
      queue.delete(key);
    },
    flush: () => {
      const current = [...queue.values()];
      queue.clear();
      current.forEach((callback) => callback(0));
    },
  };
}
describe('미리보기 그리기 준비 신호', () => {
  it('iframe load 이후 두 번째 프레임이 끝나기 전에는 준비되지 않는다', () => {
    const frames = scheduler();
    const ready = vi.fn();
    afterTwoFrames(ready, frames.request, frames.cancel);
    expect(ready).not.toHaveBeenCalled();
    frames.flush();
    expect(ready).not.toHaveBeenCalled();
    frames.flush();
    expect(ready).toHaveBeenCalledTimes(1);
  });
  it.each([0, 1])('%i 프레임 뒤 문항 변경·해제 시 이전 준비 신호를 취소한다', (count) => {
    const frames = scheduler();
    const ready = vi.fn();
    const cancel = afterTwoFrames(ready, frames.request, frames.cancel);
    for (let i = 0; i < count; i++) frames.flush();
    cancel();
    frames.flush();
    frames.flush();
    expect(ready).not.toHaveBeenCalled();
  });
});
