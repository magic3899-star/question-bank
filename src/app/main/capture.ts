import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { routeIds as routes } from '../shared/index';
import type { ImportReview } from '../shared/index';

export const CAPTURE_COMPOSITOR_SETTLE_MS = 400;
export const CAPTURE_PASTE_READY_TIMEOUT_MS = 60000;

export async function prepareCaptureSize(
  window: BrowserWindow,
  width: number,
  height: number,
): Promise<void> {
  if (window.isFullScreen())
    await captureDeadline(
      new Promise<void>((resolve) => {
        window.once('leave-full-screen', () => resolve());
        window.setFullScreen(false);
      }),
      '전체 화면 해제',
    );
  if (window.isMaximized())
    await captureDeadline(
      new Promise<void>((resolve) => {
        window.once('unmaximize', () => resolve());
        window.unmaximize();
      }),
      '최대화 해제',
    );
  window.setContentSize(width, height);
}

export function captureDeadline<T>(action: Promise<T>, stage: string, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${stage}: ${Math.max(1, Math.ceil(timeoutMs / 1000))}초 안에 완료되지 않았습니다. 화면 상태를 확인하고 다시 캡처하세요.`,
          ),
        ),
      timeoutMs,
    );
    action.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

export function writeCaptureFailure(directory: string, message: string): void {
  mkdirSync(directory, { recursive: true });
  const report = ['light', 'dark'].flatMap((theme) =>
    ['1360x840', '1100x700'].flatMap((size) =>
      routes.map((route) => ({ route, file: `${route}-${theme}-${size}.png`, waitMs: 0, error: message })),
    ),
  );
  writeFileSync(join(directory, 'capture-report.json'), JSON.stringify(report, null, 2), 'utf8');
}
export async function captureRoutes(
  window: BrowserWindow,
  directory: string,
  options: { timeoutMs?: number; importReview?: ImportReview; pasteText?: string } = {},
): Promise<boolean> {
  mkdirSync(directory, { recursive: true });
  const report: { route: string; file: string; waitMs: number; error: string | null }[] = [];
  for (const theme of ['light', 'dark'])
    for (const [width, height] of [
      [1360, 840],
      [1100, 700],
    ]) {
      await prepareCaptureSize(window, width!, height!);
      const targets = routes.flatMap((route) =>
        route === 'import' && options.importReview
          ? [route, 'import-review']
          : route === 'add' && options.pasteText
            ? [route, 'add-paste']
            : [route],
      );
      for (const target of targets) {
        const route = target === 'import-review' ? 'import' : target === 'add-paste' ? 'add' : target;
        const file = `${target}-${theme}-${width}x${height}.png`;
        const started = Date.now();
        let error: string | null = null;
        try {
          const run = (code: string, stage: string) =>
            captureDeadline(window.webContents.executeJavaScript(code), stage, options.timeoutMs);
          if (target === 'add-paste')
            await run(
              `sessionStorage.setItem('qb-capture-paste', ${JSON.stringify(options.pasteText)});`,
              '붙여넣기 글자 전달',
            );
          if (target === 'import-review')
            await run(
              `sessionStorage.setItem('qb-capture-import-review', ${JSON.stringify(JSON.stringify(options.importReview))});`,
              '검수 결과 전달',
            );
          await run(
            `document.body.dataset.ready = ''; document.documentElement.dataset.captureTheme = '${theme}'; document.documentElement.dataset.theme = '${theme}'; location.hash = '#/${route}?capture=${theme}-${width}-${height}${target === 'import-review' ? '&captureReview=1' : target === 'add-paste' ? '&capturePaste=1' : ''}';`,
            '화면 이동',
          );
          let ready = false;
          const readyStarted = Date.now();
          const readyTimeout =
            options.timeoutMs ?? (target === 'add-paste' ? CAPTURE_PASTE_READY_TIMEOUT_MS : 10000);
          while (Date.now() - readyStarted < readyTimeout) {
            ready = (await run(`document.body.dataset.ready === '${route}'`, '화면 준비 확인')) as boolean;
            if (ready) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (!ready)
            throw new Error(
              `화면 준비 신호를 ${Math.max(1, Math.ceil(readyTimeout / 1000))}초 안에 받지 못했습니다. 붙여넣기 해석과 현재 미리보기 상태를 확인하세요.`,
            );
          await run(
            `document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))`,
            '글꼴과 그리기 대기',
          );
          await run(
            `new Promise(resolve => setTimeout(resolve, ${CAPTURE_COMPOSITOR_SETTLE_MS}))`,
            '미리보기 합성 대기',
          );
          const screenshot = await captureDeadline(
            window.webContents.capturePage(),
            'PNG 캡처',
            options.timeoutMs,
          );
          writeFileSync(join(directory, file), screenshot.toPNG());
          const screenError = (await run(`document.body.dataset.error || ''`, '화면 오류 확인')) as string;
          if (screenError) error = screenError;
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
        }
        report.push({ route: target, file, waitMs: Date.now() - started, error });
      }
    }
  writeFileSync(join(directory, 'capture-report.json'), JSON.stringify(report, null, 2), 'utf8');
  return report.every((entry) => entry.error === null);
}
