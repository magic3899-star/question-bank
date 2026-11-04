import { describe, expect, it } from 'vitest';
import { blocksToPlainText } from '../../content-model/index';
import { extractPdfLines, PdfReadError } from './extract';
import { createPdfImporter, pdfImporter } from './index';

/** 글자를 줄별로 찍은 한 쪽짜리 PDF 를 코드로 만든다(내장 글꼴이라 영문만 가능). */
function makePdf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids: number[] = [];
  const pagesId = objects.length + 1 + pages.length * 2;
  for (const lines of pages) {
    const stream = `BT /F1 12 Tf ${lines
      .map((line, index) => `1 0 0 1 50 ${750 - index * 20} Tm (${line}) Tj`)
      .join(' ')} ET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
      ),
    );
  }
  add(`<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = out.length;
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

const questionLines = [
  '1. fake stem',
  '① a',
  '② b',
  '③ c',
  '④ d',
  '⑤ e',
  '정답: ②',
  '해설: fake note',
  '과목 1-1-1 (A)',
];
const options = { subject: 'dummy' };

describe('PDF 글자 추출', () => {
  it('쪽 순서와 줄 순서대로 글자를 돌려주고 빈 줄은 버린다', async () => {
    const result = await extractPdfLines(makePdf([['first line', 'second line'], ['page two']]));
    expect(result.pages).toBe(2);
    expect(result.lines).toEqual(['first line', 'second line', 'page two']);
  });

  it('PDF 가 아닌 데이터는 PDF_INVALID 로 알린다', async () => {
    await expect(extractPdfLines(new TextEncoder().encode('not a pdf'))).rejects.toMatchObject({
      code: 'PDF_INVALID',
    });
  });
});

describe('PDF 가져오기', () => {
  it('추출한 줄을 붙여넣기와 같은 규칙으로 해석하고 글자만 읽는다는 안내를 붙인다', async () => {
    const importer = createPdfImporter({ extract: async () => ({ lines: questionLines, pages: 3 }) });
    const draft = await importer.parse({ fileName: '가짜.pdf', data: new Uint8Array() }, options);
    expect(draft.questions).toHaveLength(1);
    const question = draft.questions[0]!.question;
    expect(blocksToPlainText(question.stem)).toContain('fake stem');
    expect(question.choices).toHaveLength(5);
    expect(question.answerChoiceIds).toEqual(['c2']);
    expect(draft.diagnostics[0]).toMatchObject({ code: 'PDF_TEXT_ONLY', severity: 'info' });
    expect(draft.diagnostics[0]!.message).toContain('3쪽');
  });

  it('쪽 번호와 줄바꿈으로 끊긴 선지를 PDF 복사 보정으로 정리한다', async () => {
    const importer = createPdfImporter({
      extract: async () => ({
        lines: [
          '1. fake stem that wraps',
          'onto a second line',
          '① a',
          '② b',
          '③ c',
          '④ d',
          '⑤ e',
          '정답: ②',
          '과목 1-1-1 (A)',
          '- 3 -',
        ],
        pages: 1,
      }),
    });
    const draft = await importer.parse({ fileName: '가짜.pdf', data: new Uint8Array() }, options);
    expect(blocksToPlainText(draft.questions[0]!.question.stem)).toBe(
      'fake stem that wraps onto a second line',
    );
    expect(draft.diagnostics.some((d) => d.code === 'PDF_ARTIFACT_SUSPECTED')).toBe(true);
  });

  it('글자가 없는 PDF(스캔본)는 가져오지 않고 이유를 알린다', async () => {
    const importer = createPdfImporter({ extract: async () => ({ lines: [], pages: 4 }) });
    const draft = await importer.parse({ fileName: '스캔.pdf', data: new Uint8Array() }, options);
    expect(draft.questions).toEqual([]);
    expect(draft.diagnostics).toHaveLength(1);
    expect(draft.diagnostics[0]).toMatchObject({ code: 'PDF_NO_TEXT', severity: 'error' });
    expect(draft.diagnostics[0]!.message).toContain('스캔.pdf');
  });

  it('암호 PDF·손상 PDF 는 파일 이름과 함께 오류로 돌려준다', async () => {
    const locked = createPdfImporter({
      extract: async () => {
        throw new PdfReadError('PDF_PASSWORD', '암호가 걸린 PDF입니다.');
      },
    });
    const draft = await locked.parse({ fileName: '잠금.pdf', data: new Uint8Array() }, options);
    expect(draft.diagnostics[0]).toMatchObject({ code: 'PDF_PASSWORD', severity: 'error' });
    const broken = await pdfImporter.parse(
      { fileName: '깨짐.pdf', data: new Uint8Array([1, 2, 3]) },
      options,
    );
    expect(broken.diagnostics[0]).toMatchObject({ code: 'PDF_INVALID', severity: 'error' });
    expect(broken.diagnostics[0]!.message).toContain('깨짐.pdf');
  });

  it('실제 PDF 바이트에서 문제까지 만든다', async () => {
    const data = makePdf([questionLines.map((line) => line.replace(/[^\x20-\x7e]/gu, '?'))]);
    const draft = await pdfImporter.parse({ fileName: '진짜.pdf', data }, options);
    expect(draft.diagnostics.some((d) => d.severity === 'error')).toBe(false);
    expect(draft.diagnostics[0]!.code).toBe('PDF_TEXT_ONLY');
  });
});
