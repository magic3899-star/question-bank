import type { ExportOptions } from '../../src/contracts/index';
import { buildSnapshot } from '../../src/modules/exam-snapshot/index';
import { makeExamBank } from './examBank';
import { makeRuleSet, makeSelectedExam } from './builders';

export const exportOptions: ExportOptions = {
  parts: ['questions', 'answers', 'explanations'],
  combineParts: false,
  templateId: 'standard',
};

export function makeExportSnapshot() {
  const bank = makeExamBank();
  const questions = bank.questions.slice(0, 6);
  return buildSnapshot({
    exam: makeSelectedExam({
      questions,
      slotOfQuestion: Object.fromEntries(questions.map((q) => [q.id, 'slot-1'])),
      blanks: [{ slotId: 'slot-1', count: 1 }],
    }),
    rules: makeRuleSet(),
    examIndex: 0,
    seed: 'export',
    title: '가짜/시험',
    examId: 'export',
    createdAt: '2026-01-01T00:00:00Z',
    assets: bank.assets,
  }).snapshot;
}
