import { describe, expect, it } from 'vitest';
import type { ExamSnapshot } from '../../src/contracts/index';
import { standardConstraints } from '../../src/modules/constraints/index';
import { createSelector } from '../../src/modules/selector/index';
import { shufflers } from '../../src/modules/shuffler/index';
import { generateExams } from '../../src/modules/generation/index';
import { docxExporter } from '../../src/modules/exporters/docx/index';
import { xlsxExporter } from '../../src/modules/exporters/xlsx/index';
import { createPdfExporter } from '../../src/modules/exporters/pdf/index';
import { makeExamBank, makeExamRules } from '../fixtures/examBank';
import { exportOptions } from '../fixtures/exportSnapshot';
import { deepFreeze } from '../fixtures/builders';
import { docxPlainText, xlsxPlainText } from '../fixtures/extractText';
import { assertExportMatchesSnapshot } from './assertExportMatchesSnapshot';

const bank = deepFreeze(makeExamBank());
const deps = { selector: createSelector(standardConstraints), shufflers };
const options = { ...exportOptions, combineParts: true };
const pdfExporter = createPdfExporter(async (html) => new TextEncoder().encode(html));

function generate(seed: number): ExamSnapshot[] {
  const rules = makeExamRules(seed % 2 === 0 ? 'law' : 'anatomy');
  rules.examCount = 2;
  rules.slots.forEach((slot) => { slot.count = 2; });
  rules.slots.push({ id: 'empty', label: '가짜 부족 영역', count: 1, filter: { kind: 'objectivePrefix', prefixes: ['가짜 99'] } });
  const result = generateExams({ rules, candidates: bank.questions, assets: bank.assets, history: [], seed: `export-integrity/${seed}`,
    shuffle: { shuffleQuestionOrder: true, shuffleChoices: true, balanceAnswerPositions: true },
    createdAt: '2026-01-01T00:00:00Z', titleTemplate: '가짜 출력 검증 {회차}회', examIdPrefix: 'fake-export' }, deps);
  expect(result.ok).toBe(true);
  expect(result.snapshots).toHaveLength(2);
  expect(result.snapshots.every((snapshot) => snapshot.items.some((item) => item.blank))).toBe(true);
  return result.snapshots;
}

async function exportAll(snapshot: ExamSnapshot) {
  const [docx, xlsx, pdf] = await Promise.all([
    docxExporter.export([snapshot], options), xlsxExporter.export([snapshot], options), pdfExporter.export([snapshot], options),
  ]);
  return { docx: docx[0].data, xlsx: xlsx[0].data, html: new TextDecoder().decode(pdf[0].data) };
}

describe('생성 → Word/Excel/PDF 출력 종단 무결성', () => {
  it('30개 시드·2과목·60개 확정본을 번호별 대조하고 서식·이미지·표·결정성을 검증한다', async () => {
    for (let seed = 0; seed < 30; seed++) for (const snapshot of generate(seed)) {
      const before = JSON.stringify(snapshot);
      const first = await exportAll(deepFreeze(snapshot));
      await assertExportMatchesSnapshot(snapshot, first);
      const second = await exportAll(snapshot);
      expect(await docxPlainText(second.docx)).toBe(await docxPlainText(first.docx));
      expect(await xlsxPlainText(second.xlsx)).toEqual(await xlsxPlainText(first.xlsx));
      expect(second.html).toBe(first.html);
      expect(JSON.stringify(snapshot)).toBe(before);
    }
  }, 240_000);

  it.each(['지문 한 글자 변경', '정답 라벨 이동'])('출력 검사기가 고의 훼손을 탐지한다: %s', async (kind) => {
    const original = generate(0)[0];
    const corrupt = structuredClone(original);
    const item = corrupt.items.find((item) => !item.blank)!;
    if (kind === '지문 한 글자 변경') {
      const paragraph = item.passage!.find((block) => block.type === 'paragraph')!;
      if (paragraph.type === 'paragraph') paragraph.runs[0].text = paragraph.runs[0].text.replace('가', '나');
    } else item.answerLabels = [item.choices.find((choice) => !item.answerLabels.includes(choice.label))!.label];
    const output = await exportAll(corrupt);
    const intact = await exportAll(original);
    for (const format of ['docx', 'xlsx', 'html'] as const) {
      await expect(assertExportMatchesSnapshot(original, { ...intact, [format]: output[format] })).rejects.toThrow();
    }
    await assertExportMatchesSnapshot(original, intact);
  });
});
