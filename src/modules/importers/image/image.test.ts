import { describe, expect, it, vi } from 'vitest';
import { blocksToPlainText } from '../../content-model/index';
import { cleanupOcrLines } from '../text/index';
import { createPdfImporter } from '../pdf/index';
import { createImageImporter } from './index';

const options = { subject: 'dummy' };
const bytes = new Uint8Array([1, 2, 3]);

/** 인식기가 흔히 내는 모양: 동그라미 숫자가 기호·숫자로 깨져 나온다. */
const ocrLines = [
  '1. 가짜 본문은 이렇습니다',
  '<@ 가',
  '<) 나',
  '(3) 다',
  '@) 라',
  '(5) 마',
  '정답: ②',
  '해설: 가짜 설명입니다',
  '과목 1-1-1 (A)',
];

describe('OCR 줄 다듬기', () => {
  it('깨져 나온 선지 머리를 순서대로 ①~⑤ 로 다시 붙인다', () => {
    expect(cleanupOcrLines(ocrLines).slice(1, 6)).toEqual(['① 가', '② 나', '③ 다', '④ 라', '⑤ 마']);
  });

  it('한 줄에 선지가 둘 이상이면 나누고 이미 맞는 ①~⑤ 는 그대로 둔다', () => {
    expect(cleanupOcrLines(['<@ 가짜 하나 <) 가짜 둘', '(3) 가짜 셋'])).toEqual([
      '① 가짜 하나',
      '② 가짜 둘',
      '③ 가짜 셋',
    ]);
    expect(cleanupOcrLines(['① 가', '② 나'])).toEqual(['① 가', '② 나']);
  });

  it('선지가 아닌 줄은 건드리지 않는다(번호 있는 본문·(가) 보기·한 줄뿐인 기호)', () => {
    const lines = [
      '1. 본문',
      '11. 다음 (가)에 들어갈 것은?',
      '(가) 보기 문장',
      '(나) 보기 문장',
      '<@ 외톨이 선지',
    ];
    expect(cleanupOcrLines(lines)).toEqual(lines);
  });

  it('공백을 하나로 줄이고 빈 줄을 버린다', () => {
    expect(cleanupOcrLines(['  가   나 다  ', '', '   '])).toEqual(['가 나 다']);
  });

  it('6개 이상 이어진 기호 줄은 5개씩 끊어 처리한다', () => {
    const six = ['<@ 가', '<) 나', '(3) 다', '@) 라', '(5) 마', '<@ 바'];
    expect(cleanupOcrLines(six)).toEqual(['① 가', '② 나', '③ 다', '④ 라', '⑤ 마', '<@ 바']);
  });
});

describe('이미지 가져오기', () => {
  it('인식한 줄을 다듬어 문제로 만들고 인식 오류 확인 안내를 붙인다', async () => {
    const importer = createImageImporter({ ocr: async () => ocrLines });
    const draft = await importer.parse({ fileName: '스캔.png', data: bytes }, options);
    expect(draft.diagnostics[0]).toMatchObject({ code: 'IMAGE_OCR_USED', severity: 'warn' });
    expect(draft.questions).toHaveLength(1);
    const question = draft.questions[0]!.question;
    expect(question.choices.map((c) => blocksToPlainText(c.content))).toEqual(['가', '나', '다', '라', '마']);
    expect(question.answerChoiceIds).toEqual(['c2']);
  });

  it('진행 상황을 알린다', async () => {
    const onProgress = vi.fn();
    await createImageImporter({ ocr: async () => ocrLines }).parse(
      { fileName: '스캔.png', data: bytes },
      { ...options, onProgress },
    );
    expect(onProgress).toHaveBeenLastCalledWith({ label: '글자 인식(OCR)', done: 1, total: 1 });
  });

  it('인식기가 없거나 실패하거나 글자가 없으면 파일 이름과 함께 오류를 알린다', async () => {
    const none = await createImageImporter().parse({ fileName: '없음.png', data: bytes }, options);
    expect(none.diagnostics[0]).toMatchObject({ code: 'OCR_UNAVAILABLE', severity: 'error' });
    const broken = await createImageImporter({
      ocr: async () => {
        throw new Error('boom');
      },
    }).parse({ fileName: '깨짐.png', data: bytes }, options);
    expect(broken.diagnostics[0]).toMatchObject({ code: 'OCR_FAILED' });
    expect(broken.diagnostics[0]!.message).toContain('깨짐.png');
    const blank = await createImageImporter({ ocr: async () => ['  '] }).parse(
      { fileName: '빈.png', data: bytes },
      options,
    );
    expect(blank.diagnostics[0]).toMatchObject({ code: 'OCR_NO_TEXT' });
  });
});

describe('스캔본 PDF 글자 인식', () => {
  const pages = (count: number) =>
    (async function* () {
      for (let page = 1; page <= count; page++) yield { png: new Uint8Array([page]), page, pages: count };
    })();

  it('글자 없는 PDF 는 쪽마다 인식해 순서대로 이어 붙이고 진행을 알린다', async () => {
    const calls: number[] = [];
    const onProgress = vi.fn();
    const importer = createPdfImporter({
      extract: async () => ({ lines: [], pages: 3 }),
      renderPages: () => pages(3),
      ocr: async (image) => {
        calls.push(image[0]!);
        // 쪽 1 에 문제 전체, 나머지 쪽은 쪽 번호 같은 군더더기
        return image[0] === 1 ? ocrLines : [`- ${image[0]} -`];
      },
    });
    const draft = await importer.parse({ fileName: '스캔.pdf', data: bytes }, { ...options, onProgress });
    expect(calls.sort()).toEqual([1, 2, 3]);
    expect(onProgress).toHaveBeenLastCalledWith({ label: '글자 인식(OCR)', done: 3, total: 3 });
    expect(draft.diagnostics[0]).toMatchObject({ code: 'PDF_OCR_USED', severity: 'warn' });
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0]!.question.choices).toHaveLength(5);
  });

  it('인식기가 없으면 이유를 알리고, 너무 긴 스캔본은 나누라고 안내한다', async () => {
    const noOcr = createPdfImporter({ extract: async () => ({ lines: [], pages: 2 }) });
    const first = await noOcr.parse({ fileName: '스캔.pdf', data: bytes }, options);
    expect(first.diagnostics[0]).toMatchObject({ code: 'PDF_NO_TEXT', severity: 'error' });
    const tooLong = createPdfImporter({
      extract: async () => ({ lines: [], pages: 101 }),
      ocr: async () => [],
    });
    const second = await tooLong.parse({ fileName: '긴.pdf', data: bytes }, options);
    expect(second.diagnostics[0]).toMatchObject({ code: 'PDF_TOO_LONG_FOR_OCR' });
  });

  it('인식 결과에 글자가 없거나 인식이 실패하면 오류로 알린다', async () => {
    const empty = createPdfImporter({
      extract: async () => ({ lines: [], pages: 1 }),
      renderPages: () => pages(1),
      ocr: async () => ['-'],
    });
    expect((await empty.parse({ fileName: 'a.pdf', data: bytes }, options)).diagnostics[0]).toMatchObject({
      code: 'OCR_NO_TEXT',
    });
    const failing = createPdfImporter({
      extract: async () => ({ lines: [], pages: 1 }),
      renderPages: () => pages(1),
      ocr: async () => {
        throw new Error('boom');
      },
    });
    expect((await failing.parse({ fileName: 'b.pdf', data: bytes }, options)).diagnostics[0]).toMatchObject({
      code: 'OCR_FAILED',
    });
  });

  it('글자가 있는 PDF 는 인식기를 부르지 않는다', async () => {
    const ocr = vi.fn(async () => ['x']);
    const importer = createPdfImporter({
      extract: async () => ({ lines: ocrLines.map((line) => line.replace(/^[<@(].*?\s/u, '')), pages: 1 }),
      ocr,
    });
    await importer.parse({ fileName: '글자있음.pdf', data: bytes }, options);
    expect(ocr).not.toHaveBeenCalled();
  });
});
