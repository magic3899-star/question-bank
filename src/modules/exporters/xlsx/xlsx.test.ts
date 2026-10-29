import { describe, expect, it } from 'vitest';
import { makeExportSnapshot, exportOptions } from '../../../../tests/fixtures/exportSnapshot';
import { readXlsx, xlsxPlainText } from '../../../../tests/fixtures/extractText';
import { flatCellText, snapshotCounts } from '../../../../tests/e2e/assertExportMatchesSnapshot';
import { xlsxExporter } from './index';

describe('Excel 출력기', () => {
  it('재개방한 시트의 셀·정답·서식·이미지·빈 번호를 검사한다', async () => {
    const snapshot = makeExportSnapshot();
    const [file] = await xlsxExporter.export([snapshot], { ...exportOptions, combineParts: true });
    const text = await xlsxPlainText(file.data);
    expect(Object.keys(text)).toEqual(['문제', '정답표', '해설']);
    expect(text['문제'][0]).toEqual(['번호', '학습목표', '예문', '문제', '①', '②', '③', '④', '⑤', '정답']);
    for (const [index, item] of snapshot.items.entries()) {
      expect(text['문제'][index + 1][0]).toBe(String(item.number));
      if (item.blank) {
        expect(text['문제'][index + 1][3]).toBe('(비워 둔 번호)');
        expect(text['정답표'][index + 1][1]).toBe('(비워 둔 번호)');
      } else {
        expect(text['문제'][index + 1][2]).toBe(flatCellText(item.passage ?? []));
        expect(text['문제'][index + 1][3]).toBe(flatCellText(item.stem));
        item.choices.forEach((choice, col) => expect(text['문제'][index + 1][col + 4]).toBe(flatCellText(choice.content)));
        expect(text['정답표'][index + 1][1]).toBe(item.answerLabels.join(', '));
        expect(text['해설'][index + 1][2]).toBe(flatCellText(item.explanation));
      }
    }
    const workbook = await readXlsx(file.data);
    let underline = 0; let images = 0;
    for (const sheet of workbook.worksheets) {
      expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
      expect(sheet.getRow(1).getCell(1).font).toMatchObject({ name: '맑은 고딕', bold: true });
      images += sheet.getImages().length;
      sheet.eachRow((row, index) => row.eachCell((cell) => {
        if (index > 1) expect(cell.alignment).toMatchObject({ vertical: 'top', wrapText: true });
        if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
          underline += cell.value.richText.filter((run) => run.font?.underline).length;
        }
      }));
    }
    const counts = snapshotCounts(snapshot);
    expect(underline).toBe(counts.underline);
    expect(images).toBe(counts.images);
    const questionSheet = workbook.getWorksheet('문제')!;
    const passageImages = questionSheet.getImages().filter((image) => image.range.tl.nativeCol === 2 && image.range.tl.nativeRow === 1);
    expect(passageImages).toHaveLength(2);
    expect(passageImages[0].range.tl.nativeRowOff).toBeLessThan(passageImages[1].range.tl.nativeRowOff);
    expect(passageImages[1].range.tl.nativeRowOff - passageImages[0].range.tl.nativeRowOff)
      .toBeGreaterThanOrEqual(48 * 9525);
    expect(questionSheet.getRow(2).height).toBeGreaterThan(150);
    expect(questionSheet.getRow(snapshot.items.length + 1).getCell(4).fill).toMatchObject({ fgColor: { argb: 'FFF1F3F6' } });
  });

  it('파트별 파일·다회차·파일명 충돌과 빈 입력을 처리한다', async () => {
    const snapshot = makeExportSnapshot();
    const files = await xlsxExporter.export([snapshot, snapshot], exportOptions);
    expect(files).toHaveLength(6);
    expect(files[3].fileName).toBe('가짜_시험_문제지-2.xlsx');
    for (const [index, file] of files.entries()) {
      expect(Object.keys(await xlsxPlainText(file.data))).toEqual([['문제', '정답표', '해설'][index % 3]]);
    }
    expect(await xlsxExporter.export([], exportOptions)).toEqual([]);
    expect(await xlsxExporter.export([snapshot], { ...exportOptions, parts: [] })).toEqual([]);
    expect(await xlsxExporter.export([snapshot], { ...exportOptions, parts: ['answers', 'answers'] })).toHaveLength(1);
  });

  it('잘못된 선지 라벨은 한국어 오류로 전달한다', async () => {
    const snapshot = structuredClone(makeExportSnapshot());
    snapshot.items[0].choices[0].label = '⑤';
    await expect(xlsxExporter.export([snapshot], exportOptions)).rejects.toThrow('Excel 변환에 실패했습니다');
  });
});
