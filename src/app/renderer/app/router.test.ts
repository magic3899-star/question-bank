import { describe, expect, it } from 'vitest';
import { routeIds } from '../../shared/index';
import { parseHash } from './router';

describe('공통 라우트의 해시 라우터', () => {
  it.each(routeIds)('%s 화면을 해석한다', (id) => {
    expect(parseHash(`#/${id}?subject=law`).route).toBe(id);
    expect(parseHash(`#/${id}?subject=law`).query.get('subject')).toBe('law');
  });
  it.each(['', '#/', '#/missing', '#/constructor'])('알 수 없는 경로 %s는 홈으로 이동한다', (hash) => {
    expect(parseHash(hash).route).toBe('home');
  });
});
