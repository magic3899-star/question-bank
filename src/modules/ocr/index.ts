import { cropColumns } from './crop';
import { crossesGutter, findGutter, mergeColumns, orderOcrLines } from './layout';
import type { OcrLine } from './layout';
export { findGutter, mergeColumns, orderOcrLines } from './layout';
export type { OcrLine, OcrWord } from './layout';

export interface OcrEngineOptions {
  /** `kor.traineddata.gz` 등 인식 데이터가 들어 있는 폴더. 인터넷에서 내려받지 않는다. */
  langPath: string;
  languages?: string;
  /** 패키징된 앱에서는 asar 밖의 실제 경로를 넘긴다(작업 스레드가 asar 안을 읽지 못한다). */
  workerPath?: string;
  corePath?: string;
  /** 동시에 돌릴 인식기 수. 기본은 CPU 의 절반(1~3개). */
  workers?: number;
  timeoutMs?: number;
}

export interface OcrEngine {
  /** 이미지(PNG·JPG 등)의 글자를 읽기 순서의 줄 목록으로 돌려준다. */
  recognize(image: Uint8Array): Promise<string[]>;
  /** 인식기를 모두 닫는다. 다시 쓰면 새로 만든다. */
  close(): Promise<void>;
}

interface TesseractWord {
  text: string;
  bbox: { x0: number; x1: number; y0: number; y1: number };
}
interface TesseractResult {
  data: { blocks?: { paragraphs: { lines: { text: string; words: TesseractWord[] }[] }[] }[] | null };
}
interface TesseractScheduler {
  addWorker(worker: unknown): void;
  addJob(action: 'recognize', image: Uint8Array, options: object, output: object): Promise<TesseractResult>;
  terminate(): Promise<unknown>;
}
interface TesseractWorker {
  terminate(): Promise<unknown>;
}
interface TesseractModule {
  createWorker(languages: string, oem: number, options: Record<string, unknown>): Promise<TesseractWorker>;
  createScheduler(): TesseractScheduler;
}
interface SchedulerSession {
  ready?: Promise<TesseractScheduler>;
  value?: TesseractScheduler;
  closed: boolean;
}

async function loadTesseract(): Promise<TesseractModule> {
  const loaded = (await import('tesseract.js')) as unknown as TesseractModule & { default?: TesseractModule };
  return loaded.default ?? loaded;
}

function defaultWorkers(): number {
  // 일반 PC 에서 인식기 하나가 CPU 코어 하나와 약 300MB 를 쓰므로 많이 만들지 않는다.
  return 2;
}

export function createOcrEngine(options: OcrEngineOptions): OcrEngine {
  let session: SchedulerSession | undefined;
  const stop = async (current: SchedulerSession): Promise<void> => {
    if (session === current) session = undefined;
    if (current.closed) return;
    current.closed = true;
    try {
      await current.value?.terminate();
    } catch {}
  };
  const ensureOpen = (current: SchedulerSession): void => {
    if (current.closed) throw new Error('글자 인식기가 종료되었습니다. 다시 시도해 주세요.');
  };
  const start = async (current: SchedulerSession): Promise<TesseractScheduler> => {
    try {
      const tesseract = await loadTesseract();
      ensureOpen(current);
      const created = tesseract.createScheduler();
      current.value = created;
      const count = Math.max(1, options.workers ?? defaultWorkers());
      for (let i = 0; i < count; i++) {
        const worker = await tesseract.createWorker(options.languages ?? 'kor', 1, {
          langPath: options.langPath,
          cacheMethod: 'none',
          gzip: true,
          // 작업이 이미 reject 되어 호출자에게 전달되므로, 라이브러리가 던지는 예외로 앱이 죽지 않게 삼킨다
          errorHandler: () => undefined,
          ...(options.workerPath ? { workerPath: options.workerPath } : {}),
          ...(options.corePath ? { corePath: options.corePath } : {}),
        });
        if (current.closed) {
          // 생성 도중 종료되면 스케줄러에 등록되지 않은 작업자도 따로 정리한다.
          try {
            await worker.terminate();
          } catch {}
          ensureOpen(current);
        }
        created.addWorker(worker);
      }
      return created;
    } catch (cause) {
      void stop(current);
      throw cause;
    }
  };
  const readLines = async (current: SchedulerSession, image: Uint8Array): Promise<OcrLine[]> => {
    ensureOpen(current);
    const scheduler = await (current.ready ??= start(current));
    ensureOpen(current);
    const result = await scheduler.addJob('recognize', image, {}, { blocks: true, text: true });
    ensureOpen(current);
    const lines: OcrLine[] = [];
    for (const block of result.data.blocks ?? [])
      for (const paragraph of block.paragraphs)
        for (const line of paragraph.lines) {
          const words = line.words.map((word) => ({ text: word.text, ...word.bbox }));
          if (!words.length) continue;
          lines.push({
            text: line.text,
            words,
            top: Math.min(...words.map((word) => word.y0)),
            bottom: Math.max(...words.map((word) => word.y1)),
          });
        }
    return lines;
  };
  const recognize = async (current: SchedulerSession, image: Uint8Array): Promise<string[]> => {
    const whole = await readLines(current, image);
    const gutter = findGutter(whole);
    if (gutter === undefined) return orderOcrLines(whole);
    // 2단 조판: 한 줄로 섞인 좌우 글 대신, 단을 잘라 따로 읽으면 띄어쓰기와 줄 순서가 정확하다.
    const fullWidth = whole.filter((line) => crossesGutter(line, gutter));
    let columns: Awaited<ReturnType<typeof cropColumns>>;
    try {
      columns = await cropColumns(image, gutter, fullWidth);
    } catch {
      return orderOcrLines(whole);
    }
    if (!columns) return orderOcrLines(whole);
    const [left, right] = await Promise.all([
      readLines(current, columns.left),
      readLines(current, columns.right),
    ]);
    // 오른쪽 단의 x 좌표는 잘라 낸 이미지 기준이라 비교에 쓰지 않고 y 만 쓴다.
    return mergeColumns(fullWidth, left, right);
  };
  return {
    async recognize(image) {
      const current = (session ??= { closed: false });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          recognize(current, image),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error('글자 인식 시간이 초과되었습니다.'));
            }, options.timeoutMs ?? 120_000);
          }),
        ]);
      } catch (cause) {
        void stop(current);
        throw cause;
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      if (session) await stop(session);
    },
  };
}
