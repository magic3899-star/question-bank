import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { captureRoutes, writeCaptureFailure } from './capture';

describe('검수 캡처 실행기', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'qb-capture-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const report = () =>
    JSON.parse(readFileSync(join(directory, 'capture-report.json'), 'utf8')) as {
      route: string;
      file: string;
      waitMs: number;
      error: string | null;
    }[];
  it('준비 신호 이후에만 8라우트×2테마×2크기를 저장한다', async () => {
    const size = vi.fn();
    const scripts: string[] = [];
    const window = {
      setContentSize: size,
      webContents: {
        executeJavaScript: async (code: string) => {
          scripts.push(code);
          return code.includes('dataset.ready ===') ? true : '';
        },
        capturePage: async () => ({ toPNG: () => Buffer.from('fake-png') }),
      },
    } as unknown as BrowserWindow;
    expect(await captureRoutes(window, directory)).toBe(true);
    expect(size.mock.calls).toEqual([
      [1360, 840],
      [1100, 700],
      [1360, 840],
      [1100, 700],
    ]);
    expect(report()).toHaveLength(32);
    expect(report().every((row) => row.error === null)).toBe(true);
    expect(readdirSync(directory).filter((file) => file.endsWith('.png'))).toHaveLength(32);
    expect(scripts.some((script) => script.includes("dataset.captureTheme = 'dark'"))).toBe(true);
    expect(scripts.filter((script) => script.includes('document.fonts.ready'))).toHaveLength(32);
  });
  it('준비 시간 초과에는 PNG 없이 오류를 기록하고 실패를 반환한다', async () => {
    const capturePage = vi.fn();
    const window = {
      setContentSize: vi.fn(),
      webContents: { executeJavaScript: async () => false, capturePage },
    } as unknown as BrowserWindow;
    expect(await captureRoutes(window, directory, { timeoutMs: 0 })).toBe(false);
    expect(capturePage).not.toHaveBeenCalled();
    expect(report().every((row) => row.error?.includes('10초'))).toBe(true);
  });
  it('화면 서비스 오류를 캡처 보고서에 포함한다', async () => {
    const window = {
      setContentSize: vi.fn(),
      webContents: {
        executeJavaScript: async (code: string) =>
          code.includes('dataset.ready ===') ? true : code.includes('dataset.error') ? '저장소 오류' : '',
        capturePage: async () => ({ toPNG: () => Buffer.from('fake-png') }),
      },
    } as unknown as BrowserWindow;
    expect(await captureRoutes(window, directory)).toBe(false);
    expect(report()[0].error).toBe('저장소 오류');
  });
  it('창 시작 실패에도 32개의 대상과 원인을 기록한다', () => {
    writeCaptureFailure(directory, '창을 열 수 없습니다.');
    expect(report()).toHaveLength(32);
    expect(report()[31]).toMatchObject({
      route: 'settings',
      file: 'settings-dark-1100x700.png',
      error: '창을 열 수 없습니다.',
    });
  });
});
