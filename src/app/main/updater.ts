import type { UpdateStatus } from '../shared/index';

/** electron-updater 의 autoUpdater 중 이 앱이 쓰는 부분(테스트에서 가짜로 바꿀 수 있게). */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

/**
 * 시작할 때 GitHub Releases 에서 새 버전을 확인하고, 있으면 내려받아 "다시 시작하면 적용" 상태로 둔다.
 * 확인에 실패해도(인터넷 없음, 저장소 비공개 등) 프로그램 사용에는 지장이 없다.
 */
export function createUpdater(deps: {
  updater?: UpdaterLike;
  enabled: boolean;
  notify: (status: UpdateStatus) => void;
}) {
  let status: UpdateStatus = deps.enabled
    ? { state: 'idle' }
    : { state: 'unsupported', message: '개발 실행에서는 업데이트를 확인하지 않습니다.' };
  const set = (next: UpdateStatus) => {
    status = next;
    deps.notify(status);
  };
  const updater = deps.updater;
  if (deps.enabled && updater) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => set({ state: 'checking' }));
    updater.on('update-available', (info) =>
      set({ state: 'available', version: (info as { version?: string })?.version }),
    );
    updater.on('update-not-available', () => set({ state: 'none', message: '최신 버전을 사용 중입니다.' }));
    updater.on('download-progress', (progress) =>
      set({
        state: 'downloading',
        version: status.version,
        percent: Math.round((progress as { percent?: number })?.percent ?? 0),
      }),
    );
    updater.on('update-downloaded', (info) =>
      set({
        state: 'ready',
        version: (info as { version?: string })?.version ?? status.version,
        message: '프로그램을 다시 시작하면 새 버전이 적용됩니다.',
      }),
    );
    updater.on('error', () =>
      set({
        state: 'error',
        message:
          '업데이트를 확인하지 못했습니다. 인터넷 연결을 확인하세요. 프로그램 사용에는 지장이 없습니다.',
      }),
    );
  }
  return {
    status: () => status,
    async check(): Promise<UpdateStatus> {
      if (!deps.enabled || !updater) return status;
      try {
        await updater.checkForUpdates();
      } catch {
        set({
          state: 'error',
          message:
            '업데이트를 확인하지 못했습니다. 인터넷 연결을 확인하세요. 프로그램 사용에는 지장이 없습니다.',
        });
      }
      return status;
    },
    install(): void {
      if (status.state !== 'ready' || !updater)
        throw new Error('설치할 업데이트가 아직 준비되지 않았습니다.');
      // 설치 마법사(다음·설치 단추)를 띄우지 않고 조용히 설치한 뒤 프로그램을 다시 켠다.
      // 마법사를 띄우면 직원이 창을 닫아 버려 업데이트가 안 되는 일이 생긴다.
      updater.quitAndInstall(true, true);
    },
  };
}
