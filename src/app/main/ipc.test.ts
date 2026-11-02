import { describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, value?: unknown) => Promise<unknown>>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (name: string) => handlers.delete(name),
    handle: (name: string, action: (event: IpcMainInvokeEvent, value?: unknown) => Promise<unknown>) =>
      handlers.set(name, action),
  },
}));
import { registerIpc, toResult } from './ipc';
import { channels } from '../shared/index';
import { defaultSettings } from './settings';

describe('IPC 오류와 요청 경계', () => {
  it('예외를 한국어 결과로 변환한다', async () => {
    expect(await toResult(() => 3)).toEqual({ ok: true, value: 3 });
    expect(
      await toResult(() => {
        throw new Error('English private detail');
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/[가-힣]/u) });
    expect(
      await toResult(() => {
        throw new Error('입력을 다시 확인하세요.');
      }),
    ).toEqual({ ok: false, message: '입력을 다시 확인하세요.' });
  });
  it('모든 채널을 등록하고 다른 창·iframe 요청과 준비되지 않은 DB를 거부한다', async () => {
    const contents = { mainFrame: {} } as WebContents;
    registerIpc({
      contents,
      info: () => ({
        version: '1',
        dataDir: '',
        dbPath: '',
        isPackaged: false,
        startupError: '백업을 확인하세요.',
      }),
      settings: { get: () => defaultSettings, update: () => defaultSettings },
      openDataDir: async () => {},
    });
    expect([...handlers.keys()]).toEqual(Object.values(channels));
    const event = { sender: contents, senderFrame: contents.mainFrame } as IpcMainInvokeEvent;
    expect(await handlers.get(channels.bankStats)!(event)).toEqual({
      ok: false,
      message: '백업을 확인하세요.',
    });
    expect(
      await handlers.get(channels.appInfo)!({ ...event, senderFrame: {} } as IpcMainInvokeEvent),
    ).toMatchObject({ ok: false });
    expect(
      await handlers.get(channels.appInfo)!({ ...event, sender: {} } as IpcMainInvokeEvent),
    ).toMatchObject({ ok: false });
    expect(await handlers.get(channels.settingsGet)!(event)).toMatchObject({ ok: true });
    expect(await handlers.get(channels.importAnalyze)!(event, {})).toEqual({
      ok: false,
      message: '백업을 확인하세요.',
    });
    for (const action of handlers.values()) {
      expect(await action({ ...event, senderFrame: {} } as IpcMainInvokeEvent)).toMatchObject({ ok: false });
    }
  });
});
