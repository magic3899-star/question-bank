import { describe, expect, it, vi } from 'vitest';
import { makeExportSnapshot, exportOptions } from '../../../../tests/fixtures/exportSnapshot';
import { createPdfExporter } from './index';
import type { PdfRenderer } from './index';

describe('PDF 출력기', () => {
  it('회차×파트 HTML·페이지·폰트 옵션을 전달하고 이름 충돌을 해결한다', async () => {
    const snapshot = makeExportSnapshot();
    const render = vi.fn<PdfRenderer>(async () => new Uint8Array([37, 80, 68, 70]));
    const fontFaceCss = '@font-face { font-family: fake; src: url(data:font/woff2;base64,YWJj); }';
    const exporter = createPdfExporter(render, { fontFaceCss });
    expect([exporter.id, exporter.label, exporter.extension]).toEqual(['pdf', 'PDF', 'pdf']);
    const files = await exporter.export([snapshot, snapshot, snapshot], exportOptions);
    expect(files).toHaveLength(9);
    expect(render).toHaveBeenCalledTimes(9);
    for (const [index, call] of render.mock.calls.entries()) {
      expect(call[1]).toEqual({ paper: 'A4', marginMm: 18, printBackground: true, pageNumbers: true });
      expect(call[0]).toContain(fontFaceCss);
      expect(call[0]).toContain(`qb-${exportOptions.parts[index % 3]}-part`);
      expect(files[index].mime).toBe('application/pdf');
      expect(files[index].part).toBe(exportOptions.parts[index % 3]);
    }
    expect(files.filter((file) => file.part === 'questions').map((file) => file.fileName)).toEqual([
      '가짜_시험_문제지.pdf',
      '가짜_시험_문제지-2.pdf',
      '가짜_시험_문제지-3.pdf',
    ]);
  });
  it('결합·중복 파트·빈 입력과 변환 실패를 처리한다', async () => {
    const render = vi.fn(async (html: string) => new TextEncoder().encode(html));
    const exporter = createPdfExporter(render);
    const [file] = await exporter.export([makeExportSnapshot()], { ...exportOptions, combineParts: true });
    expect(file.fileName).toBe('가짜_시험_전체.pdf');
    expect(file.part).toBe('combined');
    expect(render).toHaveBeenCalledTimes(1);
    const html = new TextDecoder().decode(file.data);
    expect(html.indexOf('qb-questions-part')).toBeLessThan(html.indexOf('qb-answers-part'));
    expect(html.indexOf('qb-answers-part')).toBeLessThan(html.indexOf('qb-explanations-part'));
    expect(await exporter.export([], exportOptions)).toEqual([]);
    expect(await exporter.export([makeExportSnapshot()], { ...exportOptions, parts: [] })).toEqual([]);
    expect(
      await exporter.export([makeExportSnapshot()], { ...exportOptions, parts: ['answers', 'answers'] }),
    ).toHaveLength(1);
    const cause = new Error('가짜 변환 오류');
    await expect(
      createPdfExporter(async () => {
        throw cause;
      }).export([makeExportSnapshot()], exportOptions),
    ).rejects.toMatchObject({ message: expect.stringContaining('PDF 변환에 실패했습니다'), cause });
  });
});
