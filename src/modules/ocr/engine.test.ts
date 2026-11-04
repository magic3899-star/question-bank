import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOcrEngine } from './index';

const { createWorker, createScheduler } = vi.hoisted(() => ({
  createWorker: vi.fn(),
  createScheduler: vi.fn(),
}));

vi.mock('tesseract.js', () => ({
  createWorker,
  createScheduler,
  default: { createWorker, createScheduler },
}));

const image = new Uint8Array([1, 2, 3]);
const result = {
  data: {
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                text: '가짜 인식 결과',
                words: [{ text: '가짜', bbox: { x0: 0, x1: 30, y0: 0, y1: 20 } }],
              },
            ],
          },
        ],
      },
    ],
  },
};

function fakeScheduler() {
  return {
    addWorker: vi.fn(),
    addJob: vi.fn<() => Promise<typeof result>>().mockResolvedValue(result),
    terminate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('OCR 엔진 복구', () => {
  let scheduler: ReturnType<typeof fakeScheduler>;

  beforeEach(() => {
    vi.resetAllMocks();
    scheduler = fakeScheduler();
    createScheduler.mockReturnValue(scheduler);
    createWorker.mockResolvedValue({ terminate: vi.fn().mockResolvedValue(undefined) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('정상 인식 결과를 줄 문자열로 반환하고 스케줄러를 재사용한다', async () => {
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 1 });

    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);
    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);

    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(scheduler.addJob).toHaveBeenCalledWith('recognize', image, {}, { blocks: true, text: true });
    expect(scheduler.terminate).not.toHaveBeenCalled();
    await engine.close();
  });

  it('모든 작업자 생성 옵션에 errorHandler 함수를 전달한다', async () => {
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 2 });

    await engine.recognize(image);

    expect(createWorker).toHaveBeenCalledTimes(2);
    for (const call of createWorker.mock.calls) {
      expect(call).toEqual([
        'kor',
        1,
        expect.objectContaining({ errorHandler: expect.any(Function), langPath: 'fake-languages' }),
      ]);
    }
    await engine.close();
  });

  it('인식 실패를 전달하고 스케줄러를 종료한 뒤 다음 호출에서 작업자를 새로 만든다', async () => {
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 1 });
    const next = fakeScheduler();
    createScheduler.mockReturnValueOnce(scheduler).mockReturnValue(next);
    scheduler.addJob.mockRejectedValueOnce(new Error('가짜 인식 실패'));

    await expect(engine.recognize(image)).rejects.toThrow('가짜 인식 실패');
    expect(scheduler.terminate).toHaveBeenCalledTimes(1);
    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(next.terminate).not.toHaveBeenCalled();
    await engine.close();
  });

  it('일부 작업자를 만든 뒤 생성에 실패해도 스케줄러를 정리하고 재시작한다', async () => {
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 2 });
    const worker = { terminate: vi.fn().mockResolvedValue(undefined) };
    createWorker.mockResolvedValueOnce(worker).mockRejectedValueOnce(new Error('가짜 생성 실패'));

    await expect(engine.recognize(image)).rejects.toThrow('가짜 생성 실패');
    expect(scheduler.addWorker).toHaveBeenCalledWith(worker);
    expect(scheduler.terminate).toHaveBeenCalledTimes(1);

    createScheduler.mockReturnValue(fakeScheduler());
    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);
    expect(createWorker).toHaveBeenCalledTimes(4);
    await engine.close();
  });

  it.each(['비동기 거부', '동기 예외'])('종료 중 %s가 발생해도 원래 오류를 전달한다', async (failure) => {
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 1 });
    scheduler.addJob.mockRejectedValueOnce(new Error('가짜 인식 실패'));
    scheduler.terminate.mockImplementation(() => {
      if (failure === '동기 예외') throw new Error('가짜 종료 실패');
      return Promise.reject(new Error('가짜 종료 실패'));
    });

    await expect(engine.recognize(image)).rejects.toThrow('가짜 인식 실패');
    createScheduler.mockReturnValue(fakeScheduler());
    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);
    await engine.close();
  });

  it.each([undefined, 1_000])(
    '끝나지 않는 인식은 제한 시간(%s ms) 뒤 실패하고 재시작한다',
    async (timeoutMs) => {
      vi.useFakeTimers();
      const engine = createOcrEngine({ langPath: 'fake-languages', workers: 1, timeoutMs });
      const started = deferred<void>();
      scheduler.addJob.mockImplementation(() => {
        started.resolve();
        return new Promise(() => {});
      });
      const rejected = expect(engine.recognize(image)).rejects.toThrow('글자 인식 시간이 초과되었습니다.');
      await started.promise;

      await vi.advanceTimersByTimeAsync((timeoutMs ?? 120_000) - 1);
      expect(scheduler.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(scheduler.terminate).toHaveBeenCalledTimes(1);

      createScheduler.mockReturnValue(fakeScheduler());
      await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);
      expect(createWorker).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      await engine.close();
    },
  );

  it('종료가 끝나지 않아도 오류 전달과 재시작을 막지 않는다', async () => {
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 1 });
    scheduler.addJob.mockRejectedValueOnce(new Error('가짜 인식 실패'));
    scheduler.terminate.mockImplementation(() => new Promise(() => {}));

    await expect(engine.recognize(image)).rejects.toThrow('가짜 인식 실패');
    createScheduler.mockReturnValue(fakeScheduler());
    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);
    await engine.close();
  });

  it('이전 동시 호출이 늦게 실패해도 중복 종료하거나 새 스케줄러를 비우지 않는다', async () => {
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 1 });
    const first = deferred<typeof result>();
    const second = deferred<typeof result>();
    scheduler.addJob.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstRejected = expect(engine.recognize(image)).rejects.toThrow('첫 가짜 실패');
    const secondRejected = expect(engine.recognize(image)).rejects.toThrow('늦은 가짜 실패');
    await vi.waitFor(() => expect(scheduler.addJob).toHaveBeenCalledTimes(2));

    first.reject(new Error('첫 가짜 실패'));
    await firstRejected;
    const next = fakeScheduler();
    createScheduler.mockReturnValue(next);
    await engine.recognize(image);
    second.reject(new Error('늦은 가짜 실패'));
    await secondRejected;
    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);

    expect(scheduler.terminate).toHaveBeenCalledTimes(1);
    expect(next.terminate).not.toHaveBeenCalled();
    expect(createWorker).toHaveBeenCalledTimes(2);
    await engine.close();
  });

  it('작업자 생성도 시간 제한에 포함하고 늦게 생성된 작업자를 정리한다', async () => {
    vi.useFakeTimers();
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 1, timeoutMs: 1_000 });
    const started = deferred<void>();
    const worker = { terminate: vi.fn().mockResolvedValue(undefined) };
    const pending = deferred<typeof worker>();
    createWorker.mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });
    const rejected = expect(engine.recognize(image)).rejects.toThrow('글자 인식 시간이 초과되었습니다.');
    await started.promise;

    await vi.advanceTimersByTimeAsync(1_000);
    await rejected;
    expect(scheduler.terminate).toHaveBeenCalledTimes(1);
    pending.resolve(worker);
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(scheduler.addWorker).not.toHaveBeenCalled();
    expect(scheduler.addJob).not.toHaveBeenCalled();

    createScheduler.mockReturnValue(fakeScheduler());
    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);
    await engine.close();
  });

  it('close는 한 번만 종료하고 이후 인식은 새 작업자로 시작한다', async () => {
    const engine = createOcrEngine({ langPath: 'fake-languages', workers: 1 });
    await engine.close();
    expect(createScheduler).not.toHaveBeenCalled();
    await engine.recognize(image);

    await Promise.all([engine.close(), engine.close()]);
    expect(scheduler.terminate).toHaveBeenCalledTimes(1);
    const next = fakeScheduler();
    createScheduler.mockReturnValue(next);
    await expect(engine.recognize(image)).resolves.toEqual(['가짜 인식 결과']);
    expect(createWorker).toHaveBeenCalledTimes(2);
    await engine.close();
    expect(next.terminate).toHaveBeenCalledTimes(1);
  });
});
