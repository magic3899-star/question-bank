import { describe, expect, it } from 'vitest';
import { routeIds } from '../../shared/index';
import { routes } from './routes';

describe('공유 라우트와 화면 자동 등록', () => {
  it('사이드바·라우터·캡처가 같은 순서와 ID를 사용한다', () => {
    expect(routes.map(({ id }) => id)).toEqual(routeIds);
    expect(new Set(routeIds).size).toBe(routeIds.length);
  });
  it.each(routes)('$id 화면 컴포넌트를 연결한다', ({ title, description, icon, component }) => {
    expect(title).toMatch(/[가-힣]/u);
    expect(description).toMatch(/[가-힣]/u);
    expect(icon).toBeDefined();
    expect(typeof component).toBe('function');
  });
});
