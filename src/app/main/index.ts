import { app, BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import { openStorage } from '../../modules/storage/index';
import type { Storage } from '../../modules/storage/index';
import type { Settings } from '../shared/index';
import { backupBeforeMigrate, getPaths, preparePaths } from './paths';
import { createSettingsService, defaultSettings } from './settings';
import { createAppInfoService } from './services/app-info';
import { createBankService } from './services/bank';
import { registerIpc } from './ipc';
import { captureRoutes, writeCaptureFailure } from './capture';

const paths = getPaths(app.getPath('appData'), process.env.QB_DATA_DIR);
app.setPath('userData', paths.dataDir);
if (process.env.QB_CAPTURE_DIR) app.disableHardwareAcceleration();
let window: BrowserWindow | undefined;
let storage: Storage | undefined;
const now = (): string => new Date().toISOString();
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  void app
    .whenReady()
    .then(async () => {
      let startupError: string | undefined;
      let settings: ReturnType<typeof createSettingsService> = {
        get: () => structuredClone(defaultSettings),
        update: (): Settings => {
          throw new Error('설정을 저장할 수 없습니다. 데이터 폴더의 권한을 확인하세요.');
        },
      };
      try {
        preparePaths(paths);
        settings = createSettingsService(paths.settingsPath, now);
        storage = openStorage(paths.dbPath, { beforeMigrate: backupBeforeMigrate(paths, now) });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        startupError = `데이터를 열지 못했습니다. ${message} 데이터 폴더의 접근 권한을 확인하고, 손상된 DB는 보관한 뒤 backups 폴더의 백업에서 복원하세요.`;
      }
      const saved = settings.get().window;
      const onScreen =
        saved &&
        screen
          .getAllDisplays()
          .some(
            ({ workArea }) =>
              saved.x !== undefined &&
              saved.y !== undefined &&
              saved.x >= workArea.x &&
              saved.x < workArea.x + workArea.width - 100 &&
              saved.y >= workArea.y &&
              saved.y < workArea.y + workArea.height - 100,
          );
      window = new BrowserWindow({
        width: saved?.width ?? 1360,
        height: saved?.height ?? 840,
        ...(onScreen ? { x: saved.x, y: saved.y } : {}),
        minWidth: 1100,
        minHeight: 700,
        title: '문제은행',
        autoHideMenuBar: true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      const win = window;
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (event) => event.preventDefault());
      win.webContents.on('will-redirect', (event) => event.preventDefault());
      win.webContents.on('will-attach-webview', (event) => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      win.webContents.session.setPermissionCheckHandler(() => false);
      const info = createAppInfoService({
        version: app.getVersion(),
        ...paths,
        isPackaged: app.isPackaged,
        startupError,
      });
      registerIpc({
        contents: win.webContents,
        info: info.get,
        settings,
        bank: storage ? createBankService(storage, settings.get) : undefined,
        openDataDir: async () => {
          const message = await shell.openPath(paths.dataDir);
          if (message) throw new Error('데이터 폴더를 열지 못했습니다. 폴더 경로와 접근 권한을 확인하세요.');
        },
      });
      win.on('close', () => {
        if (process.env.QB_CAPTURE_DIR) return;
        try {
          settings.update({ window: win.getNormalBounds() });
        } catch {
          /* 종료는 설정 쓰기 실패와 무관하게 보장한다. */
        }
      });
      if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL);
      else await win.loadFile(join(__dirname, '../renderer/index.html'));
      if (process.env.QB_CAPTURE_DIR) {
        try {
          const success = await captureRoutes(win, process.env.QB_CAPTURE_DIR);
          app.exit(success ? 0 : 1);
        } catch (cause) {
          console.error('캡처 저장에 실패했습니다. 출력 폴더와 쓰기 권한을 확인하세요.', cause);
          app.exit(1);
        }
      }
    })
    .catch((cause: unknown) => {
      const message = `프로그램 창을 열지 못했습니다. 설치 파일을 다시 실행하세요. ${cause instanceof Error ? cause.message : String(cause)}`;
      console.error(message);
      if (process.env.QB_CAPTURE_DIR) {
        try {
          writeCaptureFailure(process.env.QB_CAPTURE_DIR, message);
        } catch {
          console.error('캡처 보고서를 저장하지 못했습니다. 출력 폴더의 권한을 확인하세요.');
        }
      }
      app.exit(1);
    });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => storage?.close());
}
