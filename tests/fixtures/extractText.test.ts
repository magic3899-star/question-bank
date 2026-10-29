import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { docxPlainText, parseWordXml, xlsxCellText } from './extractText';

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
