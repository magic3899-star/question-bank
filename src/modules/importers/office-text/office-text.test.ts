import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { blocksToPlainText } from '../../content-model/index';
import { decodeTextBytes, textImporter } from '../text/index';
import { extractHtmlLines } from './html';
import { extractRtfLines } from './rtf';
import { officeTextImporter } from './index';

const questionLines = [
  '1. 가짜 본문',
  '① 가',
  '② 나',
  '③ 다',
  '④ 라',
  '⑤ 마',
  '정답: ②',
  '해설: 가짜 설명',
  '과목 1-1-1 (A)',
];
const options = { subject: 'dummy' };
const encode = (text: string) => new TextEncoder().encode(text);

async function hwpx(paragraphs: string[], extra = ''): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip');
  const body = paragraphs.map((text) => `<hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p>`).join('');
  zip.file(
    'Contents/section0.xml',
    `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="s" xmlns:hp="p">${body}${extra}</hs:sec>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

async function odt(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    'content.xml',
    `<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:text="t"><office:body><office:text>${paragraphs
      .map((text) => `<text:p>${text}</text:p>`)
      .join('')}</office:text></office:body></office:document-content>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

const expectOneQuestion = (draft: Awaited<ReturnType<typeof officeTextImporter.parse>>) => {
  expect(draft.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(draft.questions).toHaveLength(1);
  const question = draft.questions[0]!.question;
  expect(blocksToPlainText(question.stem)).toContain('가짜 본문');
  expect(question.choices.map((c) => blocksToPlainText(c.content))).toEqual(['가', '나', '다', '라', '마']);
  expect(question.answerChoiceIds).toEqual(['c2']);
};

describe('한글(.hwpx) 가져오기', () => {
  it('문단마다 한 줄로 읽어 문제를 만든다', async () => {
    const data = await hwpx(questionLines);
    const draft = await officeTextImporter.parse({ fileName: '가짜.hwpx', data }, options);
    expectOneQuestion(draft);
    expect(draft.diagnostics[0]).toMatchObject({ code: 'DOCUMENT_TEXT_ONLY', severity: 'info' });
  });

  it('표 안의 문단이 바깥 문단과 섞이지 않고 탭·줄바꿈을 처리한다', async () => {
    const table =
      '<hp:p><hp:run><hp:t>바깥</hp:t><hp:tbl><hp:tr><hp:tc><hp:p><hp:run><hp:t>칸A</hp:t></hp:run></hp:p></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>';
    const breaks = '<hp:p><hp:run><hp:t>위<hp:lineBreak/>아래<hp:tab/>끝</hp:t></hp:run></hp:p>';
    const data = await hwpx([], table + breaks);
    const zip = await JSZip.loadAsync(data);
    expect(Object.keys(zip.files)).toContain('Contents/section0.xml');
    const draft = await officeTextImporter.parse({ fileName: '표.hwpx', data }, options);
    // 글자 수가 모자라면 오류이므로 본문이 읽혔다는 것만 본다(문단 분리는 줄 수로 확인).
    expect(draft.diagnostics[0]!.code).toBe('DOCUMENT_NO_TEXT');
    const lines = (await import('./hwpx')).extractHwpxLines;
    expect(await lines(data)).toEqual(['바깥', '칸A', '위', '아래\t끝']);
  });

  it('본문이 없거나 ZIP 이 아니면 파일 이름과 함께 오류를 알린다', async () => {
    const empty = await new JSZip().file('mimetype', 'x').generateAsync({ type: 'uint8array' });
    const noBody = await officeTextImporter.parse({ fileName: '빈.hwpx', data: empty }, options);
    expect(noBody.diagnostics[0]).toMatchObject({ code: 'DOCUMENT_INVALID', severity: 'error' });
    expect(noBody.diagnostics[0]!.message).toContain('빈.hwpx');
    const broken = await officeTextImporter.parse(
      { fileName: '깨짐.hwpx', data: encode('zip 아님') },
      options,
    );
    expect(broken.diagnostics[0]!.code).toBe('DOCUMENT_INVALID');
  });
});

describe('OpenDocument(.odt) 가져오기', () => {
  it('문단을 읽어 문제를 만든다', async () => {
    const draft = await officeTextImporter.parse(
      { fileName: '가짜.odt', data: await odt(questionLines) },
      options,
    );
    expectOneQuestion(draft);
  });
});

describe('RTF 가져오기', () => {
  it('한글 CP949 바이트와 유니코드 이스케이프, 문단 나눔을 읽는다', () => {
    // 가(b0a1)·나(b3aa)는 CP949 바이트, 다(U+B2E4)는 부호 있는 16비트 유니코드 이스케이프로 쓴다.
    const b = String.fromCharCode(92);
    const unicode = `${b}u${0xb2e4 - 65536}?`;
    const rtf =
      `{${b}rtf1${b}ansi${b}ansicpg949{${b}fonttbl{${b}f0 Malgun;}}${b}f0 ` +
      `${b}'b0${b}'a1${b}'b3${b}'aa${unicode}${b}par second{${b}*${b}generator skip;}}`;
    expect(extractRtfLines(encode(rtf))).toEqual(['가나다', 'second']);
  });

  it('RTF 가 아니면 오류를 알린다', async () => {
    const draft = await officeTextImporter.parse({ fileName: '가짜.rtf', data: encode('plain') }, options);
    expect(draft.diagnostics[0]!.code).toBe('DOCUMENT_INVALID');
  });

  it('문단 단위 RTF 로 문제를 만든다', async () => {
    const b = String.fromCharCode(92);
    const escape = (line: string) =>
      [...line]
        .map((c) =>
          c.charCodeAt(0) < 128 ? c : `${b}u${c.charCodeAt(0) - (c.charCodeAt(0) > 32767 ? 65536 : 0)}?`,
        )
        .join('');
    const rtf = `{${b}rtf1${b}ansi ${questionLines.map(escape).join(`${b}par `)}}`;
    const draft = await officeTextImporter.parse({ fileName: '가짜.rtf', data: encode(rtf) }, options);
    expectOneQuestion(draft);
  });
});

describe('HTML 가져오기', () => {
  it('태그·스크립트를 걷어내고 엔티티를 풀어 문제를 만든다', async () => {
    const html = `<html><head><title>x</title><style>p{}</style></head><body><script>var a=1;</script>${questionLines
      .map((line) => `<p>${line.replace('가짜 본문', '가짜&nbsp;<b>본문</b>')}</p>`)
      .join('\n')}</body></html>`;
    expect(extractHtmlLines('<p>a&amp;b&#44;&lt;c&gt;</p><br>d')[0]).toBe('a&b,<c>');
    const draft = await officeTextImporter.parse({ fileName: '가짜.html', data: encode(html) }, options);
    expect(draft.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(draft.questions).toHaveLength(1);
  });
});

describe('텍스트 파일 인코딩', () => {
  it('UTF-8 이 아니면 CP949 로 읽는다', async () => {
    // 가나다(b0a1 b3aa b4d9) 뒤에 원문자 ①(a8e7)②(a8e8)
    const bytes = new Uint8Array([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9, 0x20, 0xa8, 0xe7, 0xa8, 0xe8]);
    expect(decodeTextBytes(bytes)).toBe('가나다 ①②');
    const draft = await textImporter.parse({ fileName: '메모장.txt', data: bytes }, options);
    expect(draft.diagnostics.some((d) => d.code === 'TEXT_INVALID')).toBe(false);
  });

  it('.md 도 텍스트로 읽고, 어느 인코딩도 아닌 바이트는 오류로 알린다', async () => {
    expect(textImporter.extensions).toContain('.md');
    const draft = await textImporter.parse(
      { fileName: '깨짐.txt', data: new Uint8Array([0xff, 0xfe, 0x00, 0x01]) },
      options,
    );
    expect(draft.diagnostics[0]!.code).toBe('TEXT_INVALID');
  });
});
