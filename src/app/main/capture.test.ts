import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { captureDeadline, captureRoutes, writeCaptureFailure } from './capture';
import type { ImportReview } from '../shared/index';
import { routeIds } from '../shared/index';

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
  it('준비 신호 이후에만 공통 라우트×2테마×2크기를 저장한다', async () => {
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
    expect(report()).toHaveLength(routeIds.length * 4);
    expect(report().every((row) => row.error === null)).toBe(true);
    expect(readdirSync(directory).filter((file) => file.endsWith('.png'))).toHaveLength(routeIds.length * 4);
    expect(scripts.some((script) => script.includes("dataset.captureTheme = 'dark'"))).toBe(true);
    expect(scripts.filter((script) => script.includes('document.fonts.ready'))).toHaveLength(
      routeIds.length * 4,
    );
    expect([...new Set(report().map((row) => row.route))]).toEqual(routeIds);
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
  it('창 시작 실패에도 공통 라우트의 모든 대상과 원인을 기록한다', () => {
    writeCaptureFailure(directory, '창을 열 수 없습니다.');
    expect(report()).toHaveLength(routeIds.length * 4);
    expect(report().at(-1)).toMatchObject({
      route: routeIds.at(-1),
      file: `${routeIds.at(-1)}-dark-1100x700.png`,
      error: '창을 열 수 없습니다.',
    });
  });
  it('가져오기 분석 결과가 있으면 검수 표 전달과 테마·크기별 추가 PNG를 기록한다', async () => {
    const scripts: string[] = [];
    const window = {
      setContentSize: vi.fn(),
      webContents: {
        executeJavaScript: async (code: string) => {
          scripts.push(code);
          return code.includes('dataset.ready ===') ? true : '';
        },
        capturePage: async () => ({ toPNG: () => Buffer.from('fake-png') }),
      },
    } as unknown as BrowserWindow;
    const review: ImportReview = {
      batchId: 'fake',
      files: [],
      items: [],
      assets: {},
      skipped: [],
      diagnostics: [],
      counts: { ok: 0, warn: 0, error: 0, excluded: 0 },
    };
    expect(await captureRoutes(window, directory, { importReview: review })).toBe(true);
    expect(report()).toHaveLength((routeIds.length + 1) * 4);
    expect(
      report()
        .filter((r) => r.route === 'import-review')
        .map((r) => r.file),
    ).toEqual([
      'import-review-light-1360x840.png',
      'import-review-light-1100x700.png',
      'import-review-dark-1360x840.png',
      'import-review-dark-1100x700.png',
    ]);
    expect(
      scripts.filter((s) => s.includes("sessionStorage.setItem('qb-capture-import-review'")),
    ).toHaveLength(4);
    expect(scripts.some((s) => s.includes('&captureReview=1'))).toBe(true);
  });
  it.each(['navigation', 'ready', 'fonts', 'capture', 'errors'])(
    '%s 단계가 영원히 응답하지 않아도 보고서를 쓴다',
    async (stage) => {
      const never = new Promise<never>(() => {});
      const window = {
        setContentSize: vi.fn(),
        webContents: {
          executeJavaScript: (code: string) => {
            if (
              (stage === 'navigation' && code.includes('location.hash')) ||
              (stage === 'ready' && code.includes('dataset.ready ===')) ||
              (stage === 'fonts' && code.includes('document.fonts.ready')) ||
              (stage === 'errors' && code.includes('dataset.error ||'))
            )
              return never;
            return Promise.resolve(code.includes('dataset.ready ===') ? true : '');
          },
          capturePage: () =>
            stage === 'capture' ? never : Promise.resolve({ toPNG: () => Buffer.from('fake-png') }),
        },
      } as unknown as BrowserWindow;
      expect(await captureRoutes(window, directory, { timeoutMs: 2 })).toBe(false);
      expect(report().every((r) => r.error?.includes('초'))).toBe(true);
    },
  );
  it('대기 제한은 성공·실패를 전달하고 멈춘 작업에 한국어 오류를 낸다', async () => {
    expect(await captureDeadline(Promise.resolve(3), '가짜 단계', 10)).toBe(3);
    await expect(captureDeadline(Promise.reject(new Error('가짜 실패')), '가짜 단계', 10)).rejects.toThrow(
      '가짜 실패',
    );
    await expect(captureDeadline(new Promise(() => {}), '가짜 단계', 1)).rejects.toThrow('가짜 단계');
  });
});
