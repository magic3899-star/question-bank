import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeExportSnapshot } from '../../../../tests/fixtures/exportSnapshot';
import { docxExporter } from '../../../modules/exporters/docx/index';
import { openStorage } from '../../../modules/storage/index';
import type { Storage } from '../../../modules/storage/index';
import { defaultSettings } from '../settings';
import { parseExamHeader } from './exam-header';
import { createExportService } from './export';

let storage: Storage;
let folder: string;
beforeEach(() => {
  storage = openStorage(':memory:');
  folder = mkdtempSync(join(tmpdir(), 'qb-header-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  storage.close();
  rmSync(folder, { recursive: true, force: true });
});

function service() {
  return createExportService(storage, {
    renderPdf: async () => new Uint8Array(),
    pickFolder: async () => folder,
    defaultFolder: () => folder,
    settings: { get: () => defaultSettings, update: (partial) => ({ ...defaultSettings, ...partial }) },
    session: () => ({
      snapshots: [makeExportSnapshot()],
      rules: { id: 'fake', name: '가짜' },
      markSaved: () => {},
    }),
    subjectName: (id) => id,
    ruleName: async () => '가짜 규칙',
  });
}
const request = {
  source: { sessionId: 'fake' },
  formats: ['docx'],
  parts: ['questions'],
  combineParts: false,
};

describe('저장 요청의 시험지 머리 검증', () => {
  it.each([
    [{ candidateFields: true, durationMinutes: 0 }, '시험 시간'],
    [{ candidateFields: true, durationMinutes: 601 }, '시험 시간'],
    [{ candidateFields: true, durationMinutes: 1.5 }, '시험 시간'],
    [{ candidateFields: true, durationMinutes: '85' }, '시험 시간'],
    [{ candidateFields: true, durationMinutes: NaN }, '시험 시간'],
    [{ candidateFields: true, pointsPerQuestion: -1 }, '문항당 배점'],
    [{ candidateFields: true, pointsPerQuestion: 0 }, '문항당 배점'],
    [{ candidateFields: true, pointsPerQuestion: 101 }, '문항당 배점'],
    [{ candidateFields: true, pointsPerQuestion: Infinity }, '문항당 배점'],
    [{ candidateFields: true, pointsPerQuestion: '1' }, '문항당 배점'],
    [{ candidateFields: true, period: '가'.repeat(31) }, '교시'],
    [{ candidateFields: true, period: 1 }, '교시'],
    [{ candidateFields: 'true' }, '성명·수험번호'],
    [{}, '성명·수험번호'],
    ['header', '시험지 머리'],
    [null, '시험지 머리'],
    [[], '시험지 머리'],
  ])('잘못된 header %j는 한국어 수정 안내로 거부한다', async (header, message) => {
    const exporter = vi.spyOn(docxExporter, 'export');
    await expect(service().export({ ...request, header })).rejects.toThrow(message);
    expect(exporter).not.toHaveBeenCalled();
  });

  it.each([1, 600])('유효한 값을 새 객체로 정규화해 출력기에 전달한다 (시간 %s)', async (durationMinutes) => {
    const exporter = vi.spyOn(docxExporter, 'export').mockResolvedValue([]);
    const header = {
      period: ' 1교시 ',
      durationMinutes,
      pointsPerQuestion: 0.5,
      candidateFields: false,
      extra: '버림',
    };
    await service().export({ ...request, header });
    const actual = exporter.mock.calls[0][1].header;
    expect(actual).toEqual({
      period: '1교시',
      durationMinutes,
      pointsPerQuestion: 0.5,
      candidateFields: false,
    });
    expect(actual).not.toBe(header);
    expect(header.period).toBe(' 1교시 ');
  });

  it('생략·빈 교시와 최대 배점을 정규화한다', () => {
    expect(parseExamHeader(undefined)).toBeUndefined();
    expect(
      parseExamHeader({ candidateFields: true, period: '  ', pointsPerQuestion: 100, unknown: 1 }),
    ).toEqual({
      candidateFields: true,
      pointsPerQuestion: 100,
    });
  });

  it('header가 없는 저장은 출력기 옵션에서도 생략한다', async () => {
    const exporter = vi.spyOn(docxExporter, 'export').mockResolvedValue([]);
    await service().export(request);
    expect(exporter.mock.calls[0][1]).not.toHaveProperty('header');
  });
});
