import { expect, it } from 'vitest';
import type { ExamSnapshot } from '../../src/contracts/index';
import { generateExams, deriveVariant } from '../../src/modules/generation/index';
import { standardConstraints } from '../../src/modules/constraints/index';
import { createSelector } from '../../src/modules/selector/index';
import { shufflers } from '../../src/modules/shuffler/index';
import { docxExporter } from '../../src/modules/exporters/docx/index';
import { xlsxExporter } from '../../src/modules/exporters/xlsx/index';
import { createPdfExporter } from '../../src/modules/exporters/pdf/index';
import { makeExamBank, makeExamRules } from '../fixtures/examBank';
import { exportOptions } from '../fixtures/exportSnapshot';
import { htmlToPlainText } from '../fixtures/htmlText';
import { assertExportMatchesSnapshot } from './assertExportMatchesSnapshot';

function questionContents(snapshot: ExamSnapshot, html: string) {
  const articles = [...html.matchAll(/<article class="qb-item(?: qb-blank)?">([\s\S]*?)<\/article>/gu)];
  expect(articles).toHaveLength(snapshot.items.length);
  return Object.fromEntries(
    snapshot.items
      .filter((item) => !item.blank)
      .map((item) => {
        const position = snapshot.items.indexOf(item);
        const article = articles[position]![1]!;
        const stem = article.match(/<div class="qb-stem">([\s\S]*?)<\/div>/u)![1]!;
        const passage = article.match(/<div class="qb-passage">([\s\S]*?)<\/div>/u)?.[1] ?? '';
        const choices = [...article.matchAll(/<div class="qb-choice-content">([\s\S]*?)<\/div>/gu)];
        expect(choices).toHaveLength(item.choices.length);
        return [
          item.sourceQuestionId,
          {
            stem: htmlToPlainText(stem).replace(/^\d+\.\s*/u, ''),
            passage,
            choices: Object.fromEntries(
              item.choices.map((choice, index) => [choice.sourceChoiceId, choices[index]![1]]),
            ),
          },
        ];
      }),
  );
}

it('생성 → 홀수형·짝수형 문제지 출력에서 문제 ID별 지문·본문·선지·정답·해설을 보존한다', async () => {
  const bank = makeExamBank();
  const rules = makeExamRules('law');
  rules.examCount = 2;
  const shuffle = {
    shuffleQuestionOrder: true,
    shuffleChoices: true,
    balanceAnswerPositions: true,
    sortByObjective: true,
  };
  const generated = generateExams(
    {
      rules,
      candidates: bank.questions,
      assets: bank.assets,
      history: [],
      seed: 'fake-e2e-types',
      shuffle,
      titleTemplate: '가짜 시험 {회차}회',
      createdAt: '2026-01-01T00:00:00Z',
      examIdPrefix: 'fake-types',
    },
    { selector: createSelector(standardConstraints), shufflers },
  );
  expect(generated.ok).toBe(true);
  expect(generated.snapshots).toHaveLength(2);
  const pdfExporter = createPdfExporter(async (html) => new TextEncoder().encode(html));
  const options = { ...exportOptions, combineParts: true };
  for (const original of generated.snapshots) {
    const result = deriveVariant(
      {
        rules,
        sources: bank.questions,
        assets: original.assets,
        snapshot: original,
        seed: `${original.seed}/${original.examId}`,
        shuffle,
      },
      { shufflers },
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.snapshot).toBeDefined();
    const variants = [
      { ...original, title: `${original.title} 홀수형` },
      { ...result.snapshot!, examId: `${original.examId}-even`, title: `${original.title} 짝수형` },
    ];
    const contents = [];
    for (const snapshot of variants) {
      const [docx, xlsx, pdf] = await Promise.all([
        docxExporter.export([snapshot], options),
        xlsxExporter.export([snapshot], options),
        pdfExporter.export([snapshot], options),
      ]);
      const html = new TextDecoder().decode(pdf[0]!.data);
      await assertExportMatchesSnapshot(snapshot, { docx: docx[0]!.data, xlsx: xlsx[0]!.data, html });
      contents.push(questionContents(snapshot, html));
    }
    expect(contents[1]).toEqual(contents[0]);
  }
}, 30_000);
