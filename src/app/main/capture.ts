import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { routeIds as routes } from '../shared/index';

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
  options: { timeoutMs?: number } = {},
): Promise<boolean> {
  mkdirSync(directory, { recursive: true });
  const report: { route: string; file: string; waitMs: number; error: string | null }[] = [];
  for (const theme of ['light', 'dark'])
    for (const [width, height] of [
      [1360, 840],
      [1100, 700],
    ]) {
      window.setContentSize(width!, height!);
      for (const route of routes) {
        const file = `${route}-${theme}-${width}x${height}.png`;
        const started = Date.now();
        let error: string | null = null;
        try {
          await window.webContents.executeJavaScript(
            `document.body.dataset.ready = ''; document.documentElement.dataset.captureTheme = '${theme}'; document.documentElement.dataset.theme = '${theme}'; location.hash = '#/${route}?capture=${theme}-${width}-${height}';`,
          );
          let ready = false;
          while (Date.now() - started < (options.timeoutMs ?? 10000)) {
            ready = (await window.webContents.executeJavaScript(
              `document.body.dataset.ready === '${route}'`,
            )) as boolean;
            if (ready) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (!ready) throw new Error('화면 준비 신호를 10초 안에 받지 못했습니다.');
          await window.webContents.executeJavaScript(
            `document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))`,
          );
          const screenshot = await window.webContents.capturePage();
          writeFileSync(join(directory, file), screenshot.toPNG());
          const screenError = (await window.webContents.executeJavaScript(
            `document.body.dataset.error || ''`,
          )) as string;
          if (screenError) error = screenError;
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
        }
        report.push({ route, file, waitMs: Date.now() - started, error });
      }
    }
  writeFileSync(join(directory, 'capture-report.json'), JSON.stringify(report, null, 2), 'utf8');
  return report.every((entry) => entry.error === null);
}
