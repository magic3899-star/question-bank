import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PdfRenderer } from '../../modules/exporters/index';

export interface PrintWindow {
  loadFile(path: string): Promise<void>;
  waitForFonts(): Promise<void>;
  printToPDF(options: Record<string, unknown>): Promise<Uint8Array>;
  close(): void;
}

const PRINT_TIMEOUT_MS = 30_000;
const footer =
  '<div style="width:100%;font-size:8px;color:#666;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>';

/**
 * 숨은 창에서 HTML 을 인쇄해 PDF 로 만든다. 요청은 한 번에 하나씩(창을 여러 개 띄우지 않음) 처리한다.
 * Electron 의존은 createWindow 로 주입받아 단위 테스트에서 가짜 창을 쓸 수 있게 한다.
 */
export function createPdfRenderer(deps: { tempDir: string; createWindow: () => PrintWindow }): PdfRenderer {
  let queue: Promise<unknown> = Promise.resolve();
  const printOnce = async (html: string, pageNumbers: boolean): Promise<Uint8Array> => {
    mkdirSync(deps.tempDir, { recursive: true });
    const file = join(deps.tempDir, `print-${randomUUID()}.html`);
    writeFileSync(file, html, 'utf8');
    const win = deps.createWindow();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = (async () => {
        await win.loadFile(file);
        await win.waitForFonts();
        return win.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: pageNumbers,
          headerTemplate: '<div></div>',
          footerTemplate: footer,
        });
      })();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('PDF 변환이 30초 안에 끝나지 않았습니다. 이미지가 매우 큰지 확인하세요.')),
          PRINT_TIMEOUT_MS,
        );
      });
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      try {
        win.close();
      } catch {
        /* 창 정리 실패는 다음 인쇄에 영향을 주지 않는다. */
      }
      rmSync(file, { force: true });
    }
  };
  return (html, page) => {
    const job = queue.then(() => printOnce(html, page.pageNumbers));
    queue = job.catch(() => undefined);
    return job;
  };
}
