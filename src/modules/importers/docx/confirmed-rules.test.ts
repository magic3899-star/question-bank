import { describe, expect, it } from 'vitest';
import { blocksToPlainText } from '../../content-model/index';
import { objectiveMissingValidator } from '../../validators/objective-missing/index';
import { buildDocx, image, p } from '../../../../tests/fixtures/docxBuilder';
import type { DocxNode } from '../../../../tests/fixtures/docxBuilder';
import { docxImporter } from './index';

function record(number: number, options: { grade?: string; objective?: boolean; picture?: number; text?: string } = {}): DocxNode[] {
  return [p(`${number}. ${options.text ?? '가짜 동일 지문'}`),
    ...(options.picture === undefined ? [] : [image({ bytes: new Uint8Array([options.picture]) })]),
    p(`① 가짜 선지 ${number}`), p('② 다른 가짜 선지'), p('정답: ①'), p('해설: 가짜 설명'),
    ...(options.objective === false ? [] : [p(`과목 1-1-${number} ${options.grade ?? '(A)'}`)])];
}
async function parse(body: DocxNode[], options: Record<string, unknown> = {}) {
  return docxImporter.parse({ fileName: '가짜 확정규칙.docx', data: await buildDocx({ body }) }, { subject: 'dummy', ...options });
}

describe('확정된 가져오기 규칙', () => {
  it('학습목표 없는 문제는 위치·앞 20자 안내와 함께 제외하고 다음 경계를 유지한다', async () => {
    const draft = await parse([...record(1, { objective: false, picture: 1 }), ...record(2, { picture: 2 })]);
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0].question.extra.originalNumber).toBe('2');
    expect(draft.assets.map((a) => a.dataBase64)).toEqual(['Ag==']);
    expect(draft.diagnostics).toEqual([expect.objectContaining({ code: 'SKIPPED_NO_OBJECTIVE', severity: 'info', message: expect.stringContaining('1번째 문단 부근') })]);
    expect(draft.diagnostics[0].message).toContain('가짜 동일 지문');
  });
  it('requireObjective:false와 등급 필터 해제 시 포함하며 validator가 경고한다', async () => {
    const draft = await parse(record(1, { objective: false }), { requireObjective: false, includeGrades: null });
    expect(draft.questions).toHaveLength(1);
    expect(draft.diagnostics).toEqual([]);
    expect(objectiveMissingValidator.validate!(draft.questions[0].question)[0].code).toBe('OBJECTIVE_MISSING');
  });
  it('requireObjective:false여도 활성 등급 필터는 유지한다', async () => {
    const draft = await parse(record(1, { objective: false }), { requireObjective: false });
    expect(draft.questions).toEqual([]);
    expect(draft.diagnostics[0]).toMatchObject({ code: 'SKIPPED_BY_GRADE', message: expect.stringContaining('등급 표시 없음') });
  });
  it.each(['<2026-01-26>', '<2026-01-26'])('출처 %s는 경계로만 쓰며 해설·저장·진단에 남기지 않는다', async (tag) => {
    const draft = await parse([...record(1, { objective: false }), p(tag), ...record(2, { text: '다음 가짜 문제' })], { requireObjective: false, includeGrades: null });
    expect(draft.questions).toHaveLength(2);
    expect(draft.questions.every((q) => !('sourceTag' in q.question))).toBe(true);
    expect(blocksToPlainText(draft.questions[0].question.explanation)).toBe('가짜 설명');
    expect(draft.diagnostics).toEqual([]);
  });
  it('같은 지문에 선지가 다른 3개 문제도 첫 번째만 남긴다', async () => {
    const draft = await parse([...record(1), ...record(2), ...record(3)]);
    expect(draft.questions.map((q) => q.question.extra.originalNumber)).toEqual(['1']);
    expect(draft.diagnostics).toHaveLength(2);
    for (const diagnostic of draft.diagnostics) {
      expect(diagnostic).toMatchObject({ code: 'SKIPPED_DUPLICATE_PASSAGE', severity: 'info' });
      expect(diagnostic.message).toContain('남긴 문제: 가짜 확정규칙.docx · 1번째 문단 부근');
      expect(diagnostic.message).toContain('가짜 동일 지문');
    }
  });
  it('텍스트가 같고 이미지가 다르면 다른 지문이다', async () => {
    const draft = await parse([...record(1, { picture: 1 }), ...record(2, { picture: 2 })]);
    expect(draft.questions).toHaveLength(2);
    expect(draft.assets).toHaveLength(2);
    expect(draft.diagnostics).toEqual([]);
  });
  it('등급·학습목표로 먼저 제외된 문제는 중복 기준이 아니다', async () => {
    const draft = await parse([...record(1, { grade: '(B)' }), ...record(2, { objective: false }), ...record(3), ...record(4)]);
    expect(draft.questions.map((q) => q.question.extra.originalNumber)).toEqual(['3']);
    expect(draft.diagnostics.map((d) => d.code)).toEqual(['SKIPPED_BY_GRADE', 'SKIPPED_NO_OBJECTIVE', 'SKIPPED_DUPLICATE_PASSAGE']);
    expect(draft.diagnostics[2].message).toContain(`남긴 문제: ${draft.questions[0].sourceLocation}`);
  });
  it('dedupeByPassage:false면 모두 남긴다', async () => {
    const draft = await parse([...record(1), ...record(2)], { dedupeByPassage: false });
    expect(draft.questions).toHaveLength(2);
    expect(draft.diagnostics).toEqual([]);
  });
  it('중복 제외 문제의 선지 전용 이미지는 정리하고 공유 본문 이미지는 유지한다', async () => {
    const second = record(2, { picture: 1 });
    second.splice(3, 0, image({ bytes: new Uint8Array([2]) }));
    const draft = await parse([...record(1, { picture: 1 }), ...second]);
    expect(draft.questions).toHaveLength(1);
    expect(draft.assets.map((a) => a.dataBase64)).toEqual(['AQ==']);
  });
});
