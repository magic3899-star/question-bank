import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPdfRenderer } from './pdf-renderer';
import type { PrintWindow } from './pdf-renderer';

const page = { paper: 'A4' as const, marginMm: 18, printBackground: true as const, pageNumbers: true };
let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('PDF 인쇄기', () => {
  it('요청을 하나씩 순서대로 처리하고 임시 파일과 창을 정리한다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'qb-print-'));
    const events: string[] = [];
    let open = 0;
    const createWindow = (): PrintWindow => {
      open++;
      expect(open).toBe(1);
      return {
        loadFile: async (path) => {
          expect(existsSync(path)).toBe(true);
          events.push('load');
        },
        waitForFonts: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
        printToPDF: async (options) => {
          expect(options.pageSize).toBe('A4');
          expect(options.displayHeaderFooter).toBe(true);
          events.push('print');
          return new TextEncoder().encode('%PDF-가짜');
        },
        close: () => {
          open--;
          events.push('close');
        },
      };
    };
    const render = createPdfRenderer({ tempDir: dir, createWindow });
    const [a, b] = await Promise.all([render('<p>가</p>', page), render('<p>나</p>', page)]);
    expect(new TextDecoder().decode(a)).toBe('%PDF-가짜');
    expect(b.length).toBeGreaterThan(0);
    expect(events).toEqual(['load', 'print', 'close', 'load', 'print', 'close']);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('인쇄 실패를 전달해도 다음 요청은 계속 처리한다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'qb-print-'));
    let calls = 0;
    const render = createPdfRenderer({
      tempDir: dir,
      createWindow: () => ({
        loadFile: async () => undefined,
        waitForFonts: async () => undefined,
        printToPDF: async () => {
          calls++;
          if (calls === 1) throw new Error('가짜 실패');
          return new Uint8Array([1]);
        },
        close: () => undefined,
      }),
    });
    await expect(render('<p>1</p>', page)).rejects.toThrow('가짜 실패');
    await expect(render('<p>2</p>', page)).resolves.toEqual(new Uint8Array([1]));
    expect(readdirSync(dir)).toEqual([]);
  });
});
