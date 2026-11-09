import { describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../shared/index';
import { createUpdater } from './updater';
import type { UpdaterLike } from './updater';

function fakeUpdater() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const updater: UpdaterLike & { emit(event: string, value?: unknown): void } = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: (event, listener) => listeners.set(event, listener),
    checkForUpdates: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
    emit: (event, value) => listeners.get(event)?.(value),
  };
  return updater;
}

describe('업데이트 확인', () => {
  it('개발 실행에서는 확인하지 않는다', async () => {
    const updater = createUpdater({ enabled: false, notify: () => undefined });
    expect((await updater.check()).state).toBe('unsupported');
  });

  it('새 버전을 내려받으면 다시 시작 설치를 허용한다', async () => {
    const fake = fakeUpdater();
    const seen: UpdateStatus[] = [];
    const updater = createUpdater({ enabled: true, updater: fake, notify: (s) => seen.push(s) });
    expect(fake.autoDownload).toBe(true);
    expect(() => updater.install()).toThrow('준비되지');
    fake.emit('update-available', { version: '0.2.0' });
    fake.emit('download-progress', { percent: 42.4 });
    fake.emit('update-downloaded', { version: '0.2.0' });
    expect(seen.map((s) => s.state)).toEqual(['available', 'downloading', 'ready']);
    expect(seen[1]!.percent).toBe(42);
    updater.install();
    // 조용히 설치하고 다시 실행해야 한다(설치 마법사를 띄우지 않는다).
    expect(fake.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('확인 실패는 오류 상태로만 알리고 예외를 던지지 않는다', async () => {
    const fake = fakeUpdater();
    fake.checkForUpdates = vi.fn(async () => {
      throw new Error('네트워크 없음');
    });
    const updater = createUpdater({ enabled: true, updater: fake, notify: () => undefined });
    expect((await updater.check()).state).toBe('error');
  });
});
