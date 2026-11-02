import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { QuestionDetail } from '../../shared/index';
import { newQuestion } from '../lib/editor/index';

const state = vi.hoisted(() => ({
  html: undefined as string | undefined,
  effects: [] as (() => void | (() => void))[],
  cancel: { current: () => {} },
}));
vi.mock('react', () => ({
  useMemo: (create: () => unknown) => create(),
  useState: () => [
    state.html,
    (html: string) => {
      state.html = html;
    },
  ],
  useRef: () => state.cancel,
  useEffect: (effect: () => void | (() => void)) => state.effects.push(effect),
}));
import { PreviewFrame } from './PreviewFrame';

afterEach(() => {
  state.html = undefined;
  state.effects = [];
  state.cancel.current();
  vi.unstubAllGlobals();
});

describe('현재 내용의 미리보기 그리기', () => {
  it('이전 iframe의 대기를 취소하고 현재 HTML의 두 프레임 이후에만 현재 폼을 준비로 알린다', () => {
    let nextFrame = 0;
    const frames = new Map<number, () => void>();
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const ready = vi.fn();
    const first: QuestionDetail = { question: newQuestion('fake'), assets: {} };
    const second: QuestionDetail = {
      ...first,
      question: { ...first.question, stem: [{ type: 'paragraph', runs: [{ text: '바뀐 가짜 폼' }] }] },
    };
    const render = (detail: QuestionDetail) => {
      const element = PreviewFrame({ detail, onReady: ready });
      const iframe = element.props.children[1] as ReactElement<{ onLoad: () => void; srcDoc: string }>;
      const cleanup = state.effects.shift()!();
      state.effects.shift()!();
      return { iframe, cleanup };
    };
    const previous = render(first);
    previous.iframe.props.onLoad();
    expect(ready).not.toHaveBeenCalled();
    previous.cleanup?.();
    expect(frames.size).toBe(0);
    const current = render(second);
    expect(current.iframe.key).not.toBe(previous.iframe.key);
    current.iframe.props.onLoad();
    const frame = () => {
      const [id, callback] = [...frames][0]!;
      frames.delete(id);
      callback();
    };
    frame();
    expect(ready).not.toHaveBeenCalled();
    frame();
    render(second);
    expect(ready).toHaveBeenCalledExactlyOnceWith(second);
  });
});
