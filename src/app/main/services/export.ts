import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { ExamSnapshot, ExportPart, RuleSet } from '../../../contracts/index';
import { createExporters } from '../../../modules/exporters/index';
import type { PdfRenderer } from '../../../modules/exporters/index';
import type { Storage } from '../../../modules/storage/index';
import type {
  ExportFormat,
  ExportProgress,
  ExportRequest,
  ExportResult,
  HistoryItem,
  Settings,
} from '../../shared/index';
import { requireText } from './bank';
import { parseExamHeader } from './exam-header';
import { exportVariants, variantFileName } from './export-variants';

const formats: ExportFormat[] = ['pdf', 'docx', 'xlsx'];
const parts: ExportPart[] = ['questions', 'answers', 'explanations'];

function uniquePath(folder: string, fileName: string, taken: Set<string>): string {
  const extension = extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  for (let n = 1; ; n++) {
    const candidate = join(folder, n === 1 ? fileName : `${stem}-${n}${extension}`);
    if (!taken.has(candidate.toLowerCase()) && !existsSync(candidate)) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

export function createExportService(
  storage: Storage,
  deps: {
    renderPdf: PdfRenderer;
    pickFolder: (defaultPath: string) => Promise<string | undefined>;
    defaultFolder: () => string;
    settings: { get(): Settings; update(partial: Partial<Settings>): Settings };
    session: (id: string) => {
      snapshots: ExamSnapshot[];
      rules: { id: string; name: string };
      markSaved(ids: string[]): void;
      deriveEvenType(snapshot: ExamSnapshot): ExamSnapshot;
    };
    subjectName: (subject: string) => string;
    ruleName: (id: string) => Promise<string>;
    getRules: (id: string) => Promise<RuleSet>;
  },
) {
  const allowed = new Set<string>();
  const exporters = createExporters({ renderPdf: deps.renderPdf });
  const parseRequest = (value: unknown): ExportRequest => {
    if (!value || typeof value !== 'object') throw new Error('저장할 시험과 형식을 선택하세요.');
    const input = value as ExportRequest;
    if (input.examTypes !== undefined && input.examTypes !== 'single' && input.examTypes !== 'both')
      throw new Error('시험지 종류는 한 가지 또는 홀수형·짝수형 두 가지로 선택해 주세요.');
    if (
      !Array.isArray(input.formats) ||
      !input.formats.length ||
      input.formats.some((f) => !formats.includes(f))
    )
      throw new Error('저장 형식(PDF·Word·Excel)을 하나 이상 선택하세요.');
    if (!Array.isArray(input.parts) || !input.parts.length || input.parts.some((p) => !parts.includes(p)))
      throw new Error('저장할 문서(문제지·정답지·해설지)를 하나 이상 선택하세요.');
    const header = parseExamHeader(input.header);
    return { ...input, header };
  };
  return {
    async export(
      value: unknown,
      onProgress?: (progress: ExportProgress) => void,
    ): Promise<ExportResult | null> {
      const request = parseRequest(value);
      let snapshots: ExamSnapshot[];
      let session: ReturnType<typeof deps.session> | undefined;
      if ('sessionId' in request.source) {
        session = deps.session(requireText(request.source.sessionId, '시험 세션'));
        snapshots = session.snapshots;
      } else {
        const ids = request.source.historyExamIds;
        if (!Array.isArray(ids) || !ids.length) throw new Error('다시 저장할 시험을 선택하세요.');
        snapshots = [];
        for (const id of ids) {
          const found = await storage.snapshots.get(requireText(id, '시험 ID'));
          if (!found) throw new Error('출제 이력의 시험지를 찾을 수 없습니다. 이력을 새로 고치세요.');
          snapshots.push(found);
        }
      }
      if (request.examIndexes) {
        if (!Array.isArray(request.examIndexes) || !request.examIndexes.length)
          throw new Error('저장할 회차를 하나 이상 선택하세요.');
        snapshots = request.examIndexes.map((index) => {
          const snapshot = snapshots[index];
          if (!snapshot) throw new Error('선택한 회차를 찾을 수 없습니다.');
          return snapshot;
        });
      }
      const folder = request.folder ? resolve(request.folder) : await deps.pickFolder(deps.defaultFolder());
      if (!folder) return null;
      mkdirSync(folder, { recursive: true });
      const taken = new Set<string>();
      const files: ExportResult['files'] = [];
      const outputSnapshots: ExamSnapshot[] = [];
      for (const snapshot of snapshots) {
        outputSnapshots.push(
          ...(request.examTypes === 'both'
            ? await exportVariants(snapshot, storage, deps.getRules, session)
            : [snapshot]),
        );
      }
      const jobs = request.formats.flatMap((format) =>
        outputSnapshots.map((snapshot) => ({ format, snapshot })),
      );
      let done = 0;
      for (const { format, snapshot } of jobs) {
        onProgress?.({ done, total: jobs.length, current: `${snapshot.title} (${format.toUpperCase()})` });
        const exporter = exporters.find((item) => item.id === format);
        if (!exporter) throw new Error(`${format} 저장 기능을 찾을 수 없습니다.`);
        const output = await exporter.export([snapshot], {
          parts: request.parts,
          templateId: 'standard',
          combineParts: !!request.combineParts,
          ...(request.header ? { header: request.header } : {}),
        });
        for (const file of output) {
          const fileName =
            request.examTypes === 'both'
              ? variantFileName(snapshot, file, exporter.extension)
              : file.fileName;
          const path = uniquePath(folder, fileName, taken);
          writeFileSync(path, file.data);
          allowed.add(path.toLowerCase());
          files.push({ path, format, part: file.part, examTitle: snapshot.title });
        }
        done++;
      }
      onProgress?.({ done, total: jobs.length, current: '' });
      allowed.add(folder.toLowerCase());
      if (session) {
        const recorded = new Set((await storage.history.list(10000)).map((entry) => entry.examId));
        const toRecord = snapshots.filter((snapshot) => !recorded.has(snapshot.examId));
        for (const snapshot of toRecord) {
          await storage.snapshots.save(snapshot);
          await storage.history.record({
            examId: snapshot.examId,
            createdAt: snapshot.createdAt,
            ruleSetId: snapshot.ruleSetId,
            seed: snapshot.seed,
            title: snapshot.title,
            questionIds: snapshot.items.filter((item) => !item.blank).map((item) => item.sourceQuestionId),
          });
        }
        session.markSaved(snapshots.map((snapshot) => snapshot.examId));
      }
      try {
        deps.settings.update({ defaultSaveDir: folder });
      } catch {
        /* 저장 폴더 기억 실패는 저장 결과에 영향을 주지 않는다. */
      }
      return { folder, files };
    },
    isAllowedPath(value: unknown): string {
      const path = resolve(requireText(value, '경로'));
      if (!allowed.has(path.toLowerCase())) throw new Error('이번에 저장한 파일과 폴더만 열 수 있습니다.');
      return path;
    },
    async historyList(value: unknown): Promise<{ items: HistoryItem[]; total: number }> {
      const input = (value ?? {}) as { offset?: number; limit?: number; subject?: string; text?: string };
      const entries = await storage.history.list(10000);
      const items: HistoryItem[] = [];
      for (const entry of entries) {
        const snapshot = await storage.snapshots.get(entry.examId);
        if (!snapshot) continue;
        if (input.subject && snapshot.subject !== input.subject) continue;
        if (input.text && !snapshot.title.includes(input.text) && !entry.seed.includes(input.text)) continue;
        items.push({
          examId: entry.examId,
          title: snapshot.title,
          createdAt: entry.createdAt,
          subject: snapshot.subject,
          subjectName: deps.subjectName(snapshot.subject),
          ruleSetId: entry.ruleSetId,
          ruleName: await deps.ruleName(entry.ruleSetId),
          seed: entry.seed,
          questionCount: snapshot.items.filter((item) => !item.blank).length,
          blankCount: snapshot.items.filter((item) => item.blank).length,
        });
      }
      const offset = Math.max(0, Number(input.offset ?? 0));
      const limit = Math.min(200, Math.max(1, Number(input.limit ?? 50)));
      return { items: items.slice(offset, offset + limit), total: items.length };
    },
    async historyGet(value: unknown): Promise<ExamSnapshot> {
      const snapshot = await storage.snapshots.get(requireText(value, '시험 ID'));
      if (!snapshot) throw new Error('출제 이력의 시험지를 찾을 수 없습니다.');
      return snapshot;
    },
    async historyDelete(value: unknown): Promise<void> {
      if (!Array.isArray(value) || !value.length) throw new Error('지울 출제 이력을 선택하세요.');
      const ids = value.map((id) => requireText(id, '시험 ID'));
      await storage.history.delete(ids);
      await storage.snapshots.delete(ids.flatMap((id) => [id, `${id}-even`]));
    },
  };
}
