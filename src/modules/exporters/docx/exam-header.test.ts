import { describe, expect, it } from 'vitest';
import { exportOptions, makeExportSnapshot } from '../../../../tests/fixtures/exportSnapshot';
import { inspectDocx } from '../../../../tests/fixtures/extractText';
import { docxExporter } from './index';

describe('Word 시험지 머리', () => {
  it.each([true, false])('응시자 칸 %s일 때 정보·문항·단 구성을 보존한다', async (candidateFields) => {
    const snapshot = makeExportSnapshot();
    const files = await docxExporter.export([snapshot], {
      ...exportOptions,
      header: { period: '1교시', durationMinutes: 85, pointsPerQuestion: 0.5, candidateFields },
    });
    const output = await inspectDocx(files[0].data);
    const xml = await output.zip.file('word/document.xml')!.async('string');
    const info = `1교시 · 시험 시간 85분 · 총 ${snapshot.items.length}문항 · 문항당 0.5점`;
    expect(xml).toContain(info);
    expect(output.paragraphs[1]).toBe(info);
    expect(xml.includes('성명: ____________________　수험번호: ____________________')).toBe(candidateFields);
    expect(xml).not.toContain('점수:');
    expect(xml).toContain('w:num="2"');
    for (const file of files.slice(1)) {
      const other = await inspectDocx(file.data);
      expect(other.paragraphs.join('\n')).not.toMatch(/시험 시간|총 \d+문항|수험번호/u);
    }
    const [combined] = await docxExporter.export([snapshot], {
      ...exportOptions,
      combineParts: true,
      header: { candidateFields },
    });
    expect(
      (await inspectDocx(combined.data)).paragraphs.filter((p) => p === `총 ${snapshot.items.length}문항`),
    ).toHaveLength(1);
  });

  it('header가 없으면 수험번호 없이 기존 성명·점수 줄을 유지한다', async () => {
    const [file] = await docxExporter.export([makeExportSnapshot()], exportOptions);
    const { paragraphs } = await inspectDocx(file.data);
    expect(paragraphs).toContain('성명: ____________________　점수: __________');
    expect(paragraphs.join('\n')).not.toContain('수험번호');
  });
});
