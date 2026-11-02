import { describe, expect, it } from 'vitest';
import { unwrap } from './unwrap';

describe('IPC 결과 메시지', () => {
  it('성공 값과 한국어 수정 안내를 전달한다', async () => {
    expect(await unwrap(Promise.resolve({ ok: true, value: 3 }))).toBe(3);
    await expect(unwrap(Promise.resolve({ ok: false, message: '경로를 다시 선택하세요.' }))).rejects.toThrow(
      '경로를 다시 선택하세요.',
    );
  });
  it('영문 연결 예외에는 앱 재실행 안내를 제공한다', async () => {
    await expect(unwrap(Promise.reject(new Error('private failure')))).rejects.toThrow('앱을 다시 실행');
  });
});
