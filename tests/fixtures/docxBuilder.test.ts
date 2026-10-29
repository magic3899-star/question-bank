import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { alternateContent, buildDocx, emptyP, image, p, raw, run, table, textbox } from './docxBuilder';

it('가짜 DOCX의 필수 파트와 VML, DrawingML, 관계, 중첩 표, 서식을 생성한다', async () => {
  const bytes = await buildDocx({ body: [p('1. 가짜 <문제>'), emptyP(),
    p([run('밑줄', { underline: true, bold: false }), raw('<w:r><w:br/></w:r>')], { autoNumber: true }),
    table([[[p('셀 첫 문단'), p('셀 둘째 문단'), table([[[p('중첩')]]])]]]),
    alternateContent([textbox([p('가짜 보기')], { shaded: true })]),
    ...[{}, { anchor: true }, { legacy: true }].map((mode) => image({ bytes: new Uint8Array([1, 2]), ...mode })),
  ] });
  const zip = await JSZip.loadAsync(bytes);
  for (const path of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/media/image1.png']) {
    expect(zip.file(path)).not.toBeNull();
  }
  const document = await zip.file('word/document.xml')!.async('string');
  for (const fragment of ['&lt;문제&gt;', '<w:u w:val="single"', '<w:b w:val="0"', '<w:numPr>', '<wp:anchor', '<wp:inline', '<v:imagedata', '<w:txbxContent>', '<w:shd', '<mc:Fallback>']) {
    expect(document).toContain(fragment);
  }
  expect(document.match(/<w:tbl>/g)).toHaveLength(2);
  expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('Target="media/image3.png"');
  expect([...await zip.file('word/media/image1.png')!.async('uint8array')]).toEqual([1, 2]);
});
