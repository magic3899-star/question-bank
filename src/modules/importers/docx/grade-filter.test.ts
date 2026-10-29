import { describe, expect, it } from 'vitest';
import { blocksToPlainText } from '../../content-model/index';
import { makeQuestion } from '../../../../tests/fixtures/builders';
import { buildDocx, image, p, raw } from '../../../../tests/fixtures/docxBuilder';
import type { DocxNode } from '../../../../tests/fixtures/docxBuilder';
import { docxImporter } from './index';

function record(number: number, grade?: string, images: number[] = []): DocxNode[] {
  const question = makeQuestion();
  return [p(`<2026-1-${number}>`), p(`${number}. ${blocksToPlainText(question.stem)} ${number}`),
    ...images.map((value) => image({ bytes: new Uint8Array([value]) })),
    ...question.choices.map((choice, index) => p(`${['①', '②', '③', '④', '⑤'][index]} ${blocksToPlainText(choice.content)}`)),
    p('정답: ①'), p('과목 1-2-3' + (grade ? ` ${grade}` : ''))];
}
const parse = async (body: DocxNode[], options: Record<string, unknown> = {}) => docxImporter.parse(
  { fileName: '가짜 등급.docx', data: await buildDocx({ body }) }, { subject: 'dummy', ...options },
);

describe('가져오기 등급 필터', () => {
  it('기본 A만 포함하고 문제별 안내와 출처·미리보기를 남긴다', async () => {
    const draft = await parse([...record(1, '(B)'), ...record(2, 'A항')]);
    expect(draft.questions.map((item) => item.question.grade)).toEqual(['A']);
    expect(draft.questions[0].question.extra.originalNumber).toBe('2');
    const skipped = draft.diagnostics.find((diagnostic) => diagnostic.code === 'SKIPPED_BY_GRADE')!;
    expect(skipped).toMatchObject({ severity: 'info' });
    for (const text of ['등급 B', '번째 문단 부근', '가짜 문제 1 1', '등급 필터를 바꾸면 가져올 수 있습니다']) expect(skipped.message).toContain(text);
    expect(draft.diagnostics.some((diagnostic) => diagnostic.code === 'UNPARSED_BLOCKS')).toBe(false);
  });
  it.each([['A', 'B'], null, []])('%j는 모든 가짜 등급을 포함한다', async (includeGrades) => {
    const draft = await parse([...record(1, '(A)'), ...record(2, 'B항')], { includeGrades });
    expect(draft.questions.map((item) => item.question.grade)).toEqual(['A', 'B']);
    expect(draft.diagnostics).toEqual([]);
  });
  it('등급 없음은 제외하고 B와 사유를 구분하며 필터 해제 시 포함한다', async () => {
    const draft = await parse([...record(1), ...record(2, '(B)')]);
    expect(draft.questions).toEqual([]);
    expect(draft.diagnostics.map((d) => d.code)).toEqual(['SKIPPED_BY_GRADE', 'SKIPPED_BY_GRADE']);
    expect(draft.diagnostics[0].message).toContain('등급 표시 없음');
    expect(draft.diagnostics[1].message).toContain('등급 B');
    for (const includeGrades of [null, []]) expect((await parse(record(1), { includeGrades })).questions).toHaveLength(1);
  });
  it('건너뜀 안내는 긴 문제 본문의 앞 20자까지만 보여준다', async () => {
    const body = record(1, '(B)');
    const stem = '가짜 문제의 아주 긴 본문을 이용하여 미리보기 길이를 확인합니다';
    body[1] = p(`1. ${stem}`);
    const draft = await parse(body);
    expect(draft.diagnostics[0].message).toContain(`"${stem.slice(0, 20)}"`);
    expect(draft.diagnostics[0].message).not.toContain(stem);
  });
  it('건너뛴 문제의 단독 이미지와 모든 문제 제외 시 자산을 정리하고 공유 이미지는 유지한다', async () => {
    const body = [...record(1, '(B)', [1, 2]), ...record(2, '(A)', [2, 3])];
    const filtered = await parse(body);
    const all = await parse(body, { includeGrades: null });
    expect(all.assets).toHaveLength(3);
    expect(filtered.assets).toHaveLength(2);
    expect(filtered.assets.map((asset) => asset.dataBase64).sort()).toEqual(['Ag==', 'Aw==']);
    expect((await parse(record(1, '(B)', [1]))).assets).toEqual([]);
  });
  it('건너뛴 뒤의 상세 진단 draftIndex는 남은 문제 인덱스와 일치한다', async () => {
    const kept = record(2, '(A)');
    kept.splice(2, 0, raw('<w:p><w:r><w:drawing><a:blip r:embed="missing"/></w:drawing></w:r></w:p>'));
    const draft = await parse([...record(1, '(B)'), ...kept]);
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0].question.extra.originalNumber).toBe('2');
    expect(draft.diagnostics.find((d) => d.code === 'IMAGE_NOT_FOUND')?.ref).toEqual({ draftIndex: 0 });
    expect(draft.diagnostics.some((d) => d.code === 'GRADE_MISSING')).toBe(false);
  });
  it('잘못된 필터는 예외 없이 수정 안내를 반환한다', async () => {
    const draft = await parse(record(1, '(A)'), { includeGrades: 'A' });
    expect(draft.questions).toEqual([]);
    expect(draft.diagnostics[0].code).toBe('GRADE_FILTER_INVALID');
  });
});
