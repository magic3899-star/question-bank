import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { channels } from '../shared/api';
import type { AppInfo, Result } from '../shared/api';
import type { createBankService } from './services/bank';
import type { createSettingsService } from './settings';

export async function toResult<T>(action: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (cause) {
    const message =
      cause instanceof Error && /[가-힣]/u.test(cause.message)
        ? cause.message
        : '작업을 완료하지 못했습니다. 데이터 폴더와 파일 권한을 확인한 뒤 다시 시도하세요.';
    return { ok: false, message };
  }
}
export function registerIpc(deps: {
  contents: WebContents;
  info: () => AppInfo;
  settings: ReturnType<typeof createSettingsService>;
  bank?: ReturnType<typeof createBankService>;
  openDataDir: () => Promise<void>;
}): void {
  const bank = () => {
    if (!deps.bank)
      throw new Error(
        deps.info().startupError ?? '저장소가 준비되지 않았습니다. 데이터 폴더와 백업을 확인하세요.',
      );
    return deps.bank;
  };
  const handlers: Record<string, (value: unknown) => unknown> = {
    [channels.appInfo]: deps.info,
    [channels.openDataDir]: deps.openDataDir,
    [channels.settingsGet]: deps.settings.get,
    [channels.settingsUpdate]: (value) => deps.settings.update(value),
    [channels.bankStats]: () => bank().stats(),
    [channels.bankList]: (value) => bank().list(value),
    [channels.bankTree]: (value) => bank().objectiveTree(value),
    [channels.bankGet]: (value) => bank().get(value),
  };
  for (const [channel, action] of Object.entries(handlers)) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, value: unknown) =>
      toResult(() => {
        if (event.sender !== deps.contents || event.senderFrame !== deps.contents.mainFrame)
          throw new Error('이 화면에서는 요청할 수 없습니다. 프로그램의 기본 창에서 다시 시도하세요.');
        return action(value);
      }),
    );
  }
}
