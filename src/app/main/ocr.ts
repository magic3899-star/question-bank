import { dirname, join } from 'node:path';
import { createOcrEngine } from '../../modules/ocr/index';
import type { OcrEngine } from '../../modules/ocr/index';

/** 패키징된 앱에서는 작업 스레드가 asar 안을 읽지 못하므로 풀어 둔 폴더의 경로로 바꾼다. */
const unpacked = (path: string) => path.replace(/app\.asar(?=[\\/])/u, 'app.asar.unpacked');

/**
 * 이 앱의 글자 인식기. 한국어 인식 데이터는 설치 파일에 들어 있어 인터넷 없이 동작하고,
 * 처음 쓸 때 만들어 앱이 끝날 때 닫는다.
 */
export function createAppOcr(): OcrEngine {
  let engine: OcrEngine | undefined;
  const get = (): OcrEngine => {
    engine ??= createOcrEngine({
      // 경로는 처음 쓸 때 해석한다(시작 시간과 테스트에 영향이 없게).
      langPath: join(dirname(unpacked(require.resolve('@tesseract.js-data/kor'))), '4.0.0_best_int'),
      workerPath: join(
        dirname(dirname(unpacked(require.resolve('tesseract.js')))),
        'src',
        'worker-script',
        'node',
        'index.js',
      ),
      languages: 'kor',
    });
    return engine;
  };
  return {
    recognize: (image) => get().recognize(image),
    async close() {
      const current = engine;
      engine = undefined;
      await current?.close();
    },
  };
}
