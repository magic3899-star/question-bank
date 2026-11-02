import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { docxPlainText, parseWordXml, wordParagraphs, xlsxCellText } from './extractText';

it('손상된 XML과 Word 본문 없는 ZIP은 실패한다', async () => {
  expect(() => parseWordXml('<a><b></a>')).toThrow('Word XML이 올바르지 않습니다');
  await expect(docxPlainText(await new JSZip().generateAsync({ type: 'uint8array' }))).rejects.toThrow('Word 본문이 없습니다');
});

it('Excel의 빈 값·숫자·서식 텍스트를 손실 없이 읽는다', () => {
  expect(xlsxCellText(null)).toBe('');
  expect(xlsxCellText(undefined)).toBe('');
  expect(xlsxCellText(21)).toBe('21');
  expect(xlsxCellText({ richText: [{ text: '가짜  ' }, { text: '\n내용', font: { underline: true } }] })).toBe('가짜  \n내용');
});

it('한 문단의 번호·본문과 중첩 표 안 문단도 공백·서식 run 경계를 보존해 추출한다', () => {
  const document = parseWordXml('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:r><w:t xml:space="preserve">21. </w:t></w:r><w:r><w:t xml:space="preserve">가짜  본문 </w:t><w:cr/><w:t>다음</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>예문</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  expect(wordParagraphs(document.documentElement!)).toEqual(['21. 가짜  본문 \n다음', '예문']);
});
