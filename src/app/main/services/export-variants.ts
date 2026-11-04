import type { ExamSnapshot, ExportedFile, Question, RuleSet } from '../../../contracts/index';
import { createExportFileName, sanitizeFileName } from '../../../modules/content-model/index';
import { deriveVariant } from '../../../modules/generation/index';
import { shufflers } from '../../../modules/shuffler/index';
import type { Storage } from '../../../modules/storage/index';

export function variantFileName(snapshot: ExamSnapshot, file: ExportedFile, extension: string): string {
  if (Array.from(snapshot.title).length <= 95) return file.fileName;
  // 긴 제목을 자를 때도 두 형을 구별하는 접미사는 남겨야 한다.
  const suffix = snapshot.title.endsWith(' 짝수형') ? ' 짝수형' : ' 홀수형';
  const stem = Array.from(sanitizeFileName(snapshot.title.slice(0, -suffix.length)))
    .slice(0, 91)
    .join('');
  return createExportFileName(`${stem}${suffix}`, file.part, extension, new Set());
}

export async function exportVariants(
  snapshot: ExamSnapshot,
  storage: Storage,
  getRules: (id: string) => Promise<RuleSet>,
  session?: { deriveEvenType(snapshot: ExamSnapshot): ExamSnapshot },
): Promise<ExamSnapshot[]> {
  const evenId = `${snapshot.examId}-even`;
  let even = await storage.snapshots.get(evenId);
  if (!even) {
    if (session) even = session.deriveEvenType(snapshot);
    else {
      let rules: RuleSet;
      try {
        rules = await getRules(snapshot.ruleSetId);
      } catch {
        throw new Error(
          '이 시험의 출제 규칙을 찾을 수 없어 짝수형을 만들 수 없습니다. 출제 규칙을 복원한 뒤 다시 저장해 주세요.',
        );
      }
      const sources: Question[] = [];
      for (const item of snapshot.items.filter((item) => !item.blank)) {
        const question = await storage.questions.get(item.sourceQuestionId);
        if (!question)
          throw new Error(
            '이 시험의 원본 문제가 삭제되어 짝수형을 만들 수 없습니다. 문제를 복원하거나 시험을 다시 만들어 주세요.',
          );
        sources.push(question);
      }
      const result = deriveVariant(
        {
          rules,
          sources,
          assets: snapshot.assets,
          snapshot,
          seed: `${snapshot.seed}/${snapshot.examId}`,
          shuffle: { shuffleQuestionOrder: true, shuffleChoices: true, balanceAnswerPositions: true },
        },
        { shufflers },
      );
      if (!result.snapshot) throw new Error(result.diagnostics.map((item) => item.message).join(' '));
      even = result.snapshot;
    }
    even = Object.freeze({ ...even, examId: evenId, title: snapshot.title });
    await storage.snapshots.save(even);
  }
  return [
    { ...snapshot, title: `${snapshot.title} 홀수형` },
    { ...even, title: `${even.title} 짝수형` },
  ];
}
