import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendSwitch: vi.fn(),
  exit: vi.fn(),
  quit: vi.fn(),
  setPath: vi.fn(),
  disableHardwareAcceleration: vi.fn(),
  whenReady: vi.fn(),
}));
vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:/fake',
    setPath: mocks.setPath,
    disableHardwareAcceleration: mocks.disableHardwareAcceleration,
    requestSingleInstanceLock: () => false,
    commandLine: { appendSwitch: mocks.appendSwitch },
    exit: mocks.exit,
    quit: mocks.quit,
    whenReady: mocks.whenReady,
  },
  BrowserWindow: vi.fn(),
  dialog: {},
  screen: {},
  shell: {},
  ipcMain: {},
}));
describe('단일 실행 잠금 실패와 캡처 시작 옵션', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'qb-startup-'));
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('QB_DATA_DIR', directory);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  it('캡처는 앱 준비 전에 백그라운드 제한을 끄고 잠금 실패 보고서를 쓴 뒤 코드 1로 종료한다', async () => {
    vi.stubEnv('QB_CAPTURE_DIR', directory);
    await import('./index');
    expect(mocks.appendSwitch.mock.calls).toEqual([
      ['disable-features', 'CalculateNativeWinOcclusion'],
      ['disable-renderer-backgrounding'],
      ['disable-background-timer-throttling'],
    ]);
    expect(mocks.whenReady).not.toHaveBeenCalled();
    expect(mocks.exit).toHaveBeenCalledWith(1);
    expect(mocks.quit).not.toHaveBeenCalled();
    const report = JSON.parse(readFileSync(join(directory, 'capture-report.json'), 'utf8')) as {
      error: string;
    }[];
    expect(
      report.every(
        (row) =>
          row.error ===
          '이미 실행 중인 문제은행 창이 있어 캡처할 수 없습니다. 창을 모두 닫고 다시 실행하세요.',
      ),
    ).toBe(true);
  });
  it('일반 실행은 캡처 옵션 없이 종료한다', async () => {
    vi.stubEnv('QB_CAPTURE_DIR', '');
    await import('./index');
    expect(mocks.appendSwitch).not.toHaveBeenCalled();
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.exit).not.toHaveBeenCalled();
  });
});
