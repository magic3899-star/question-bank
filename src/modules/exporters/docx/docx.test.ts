import { describe, expect, it } from 'vitest';
import { makeExportSnapshot, exportOptions } from '../../../../tests/fixtures/exportSnapshot';
import { docxPlainText, inspectDocx, parseWordXml } from '../../../../tests/fixtures/extractText';
import { expectedDocxParagraphs, snapshotCounts } from '../../../../tests/e2e/assertExportMatchesSnapshot';
import { para } from '../../../../tests/fixtures/builders';
import { docxExporter } from './index';

describe('Word 출력기', () => {
  it('실제 ZIP/XML을 열어 텍스트·밑줄·중첩 표·이미지·단 설정을 검사한다', async () => {
    const snapshot = makeExportSnapshot();
    const files = await docxExporter.export([snapshot], exportOptions);
    expect(files.map((file) => file.fileName)).toEqual(['가짜_시험_문제지.docx', '가짜_시험_정답지.docx', '가짜_시험_해설지.docx']);
    const counts = snapshotCounts(snapshot);
    let images = 0; let underline = 0; let tables = 0;
    for (const [index, file] of files.entries()) {
      expect(file.part).toBe(exportOptions.parts[index]);
      const output = await inspectDocx(file.data);
      expect(output.paragraphs.filter(Boolean)).toEqual(expectedDocxParagraphs(snapshot, [exportOptions.parts[index]]));
      for (const entry of Object.values(output.zip.files).filter((entry) => entry.name.endsWith('.xml') || entry.name.endsWith('.rels'))) {
        parseWordXml(await entry.async('string'));
      }
      images += (output.xml.match(/<a:blip /gu) ?? []).length;
      underline += (output.xml.match(/<w:u /gu) ?? []).length;
      tables += (output.xml.match(/<w:tbl>/gu) ?? []).length;
      if (index === 0) {
        expect(output.xml).toContain('w:num="2"');
        expect(output.xml).toContain('w:sep="true"');
        expect(output.xml).toContain('w:val="dashed"');
        const settings = await output.zip.file('word/styles.xml')!.async('string');
        expect(settings).toContain('w:eastAsia="바탕"');
        expect(settings).toContain('w:ascii="Batang"');
        expect(settings).toContain('w:val="20"');
        expect(output.xml).toContain('맑은 고딕');
        expect(Object.keys(output.zip.files).some((name) => /\.odttf$/u.test(name))).toBe(false);
      }
      if (output.xml.includes('<a:blip ')) expect(Object.keys(output.zip.files).some((name) => name.startsWith('word/media/') && !name.endsWith('/'))).toBe(true);
    }
    expect(images).toBe(counts.images);
    expect(underline).toBe(counts.underline);
    expect(tables).toBe(counts.tables + 1);
  });

  it('결합 구역·다회차·충돌·빈 입력을 처리한다', async () => {
    const snapshot = makeExportSnapshot();
    const files = await docxExporter.export([snapshot, snapshot, snapshot], { ...exportOptions, combineParts: true });
    expect(files.map((file) => file.fileName)).toEqual(['가짜_시험_전체.docx', '가짜_시험_전체-2.docx', '가짜_시험_전체-3.docx']);
    expect(files.every((file) => file.part === 'combined')).toBe(true);
    const output = await inspectDocx(files[0].data);
    expect(output.paragraphs.filter(Boolean)).toEqual(expectedDocxParagraphs(snapshot));
    expect((output.xml.match(/<w:sectPr>/gu) ?? []).length).toBe(4);
    expect(await docxExporter.export([], exportOptions)).toEqual([]);
    expect(await docxExporter.export([snapshot], { ...exportOptions, parts: [] })).toEqual([]);
    const duplicate = await docxExporter.export([snapshot], { ...exportOptions, parts: ['answers', 'answers'] });
    expect(duplicate).toHaveLength(1);
  });

  it('모든 run 서식·줄바꿈·탭·이미지 축소·누락 및 지원 외 이미지를 처리한다', async () => {
    const snapshot = structuredClone(makeExportSnapshot());
    snapshot.items = [snapshot.items[0]];
    snapshot.items[0].stem = [para('밑줄\n다음\t탭', { underline: true, bold: true, italic: true, superscript: true }),
      para('아래', { subscript: true }), { type: 'image', assetId: 'passage', widthPx: 900, heightPx: 450 },
      { type: 'image', assetId: 'missing' }, { type: 'image', assetId: 'webp' }];
    snapshot.assets.webp = { ...snapshot.assets.passage, id: 'webp', mime: 'image/webp' };
    const [file] = await docxExporter.export([snapshot], { ...exportOptions, parts: ['questions'] });
    const { xml } = await inspectDocx(file.data);
    expect(await docxPlainText(file.data)).toContain('밑줄\n다음\t탭');
    for (const text of ['<w:u ', '<w:b', '<w:i', 'w:val="superscript"', 'w:val="subscript"', '<w:tab/>', '<w:cr/>',
      'cx="2857500" cy="1428750"', '[이미지 없음]', '[지원하지 않는 이미지]']) expect(xml).toContain(text);
    expect((xml.match(/<w:u /gu) ?? []).length).toBe(3);
    expect(xml).not.toMatch(/<w:r>\s*<w:r>/u);
  });

  it('이미지 데이터가 깨졌으면 한국어 변환 오류를 반환한다', async () => {
    const snapshot = structuredClone(makeExportSnapshot());
    snapshot.assets.passage.dataBase64 = '!';
    await expect(docxExporter.export([snapshot], exportOptions)).rejects.toThrow('Word 변환에 실패했습니다');
  });
});
