import { describe, expect, it } from 'vitest';
import { exportOptions, makeExportSnapshot } from '../../../../tests/fixtures/exportSnapshot';
import { readXlsx } from '../../../../tests/fixtures/extractText';
import { xlsxExporter } from './index';

describe('Excel 시험지 머리', () => {
  it.each([true, false])(
    '응시자 칸 %s일 때 제목 아래 행과 인쇄·고정 행을 맞춘다',
    async (candidateFields) => {
      const snapshot = makeExportSnapshot();
      const [file] = await xlsxExporter.export([snapshot], {
        ...exportOptions,
        combineParts: true,
        header: { period: '1교시', durationMinutes: 85, pointsPerQuestion: 1, candidateFields },
      });
      const workbook = await readXlsx(file.data);
      const sheet = workbook.getWorksheet('문제')!;
      const headerRow = candidateFields ? 4 : 3;
      expect(sheet.getCell('A1').value).toBe(snapshot.title);
      expect(sheet.getCell('A1').font.name).toBe('맑은 고딕');
      expect(sheet.getCell('A2').font.name).toBe('맑은 고딕');
      expect(sheet.getCell('A2').value).toBe(
        `1교시 · 시험 시간 85분 · 총 ${snapshot.items.length}문항 · 문항당 1점`,
      );
      if (candidateFields)
        expect(sheet.getCell('A3').value).toBe('성명: ____________________　수험번호: ____________________');
      expect(sheet.getRow(headerRow).values).toEqual([
        undefined,
        '번호',
        '학습목표',
        '예문',
        '문제',
        '①',
        '②',
        '③',
        '④',
        '⑤',
        '정답',
      ]);
      expect(sheet.getCell(`A${headerRow + 1}`).value).toBe(snapshot.items[0].number);
      expect(sheet.getCell('J2').isMerged).toBe(true);
      expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: headerRow });
      expect(sheet.pageSetup.printTitlesRow).toBe(`${headerRow}:${headerRow}`);
      expect(sheet.pageSetup).toMatchObject({ orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 });
      const [original] = await xlsxExporter.export([snapshot], { ...exportOptions, combineParts: true });
      const previous = await readXlsx(original.data);
      for (const name of ['정답표', '해설'])
        expect(workbook.getWorksheet(name)!.getSheetValues()).toEqual(
          previous.getWorksheet(name)!.getSheetValues(),
        );
    },
  );

  it('선택 항목 없이도 문항 수를 넣고 header가 없으면 첫 행과 인쇄 설정을 유지한다', async () => {
    const snapshot = makeExportSnapshot();
    const [minimal] = await xlsxExporter.export([snapshot], {
      ...exportOptions,
      header: { candidateFields: false },
    });
    expect((await readXlsx(minimal.data)).getWorksheet('문제')!.getCell('A2').value).toBe(
      `총 ${snapshot.items.length}문항`,
    );
    const [file] = await xlsxExporter.export([snapshot], exportOptions);
    const sheet = (await readXlsx(file.data)).getWorksheet('문제')!;
    expect(sheet.getCell('A1').value).toBe('번호');
    expect(sheet.pageSetup.printTitlesRow).toBe('1:1');
    expect(JSON.stringify(sheet.getSheetValues())).not.toContain('수험번호');
  });
});
