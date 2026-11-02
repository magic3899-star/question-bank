import { expect, it } from 'vitest';
import { buildDocx, p, table } from '../../../../tests/fixtures/docxBuilder';
import type { DocxNode } from '../../../../tests/fixtures/docxBuilder';
import { docxImporter } from './index';

const stem = '가짜 문제의 긴 본문으로 앞 스무 글자 미리보기를 검증합니다';
function record(field: 'stem' | 'passage' | 'explanation' | 'none'): DocxNode[] {
  return [
    p(`1. ${stem}${field === 'stem' ? ' ② 설명' : ''}`),
    ...(field === 'passage' ? [table([[[table([[[p('⑩ 가짜 예문 설명')]]])]]])] : []),
    ...Array.from('①②③④⑤', (label, index) => p(`${label} 가짜 선지 ${index}`)),
    p('정답: ①'),
    p(`해설: ${field === 'explanation' ? '⦁①, ②, ④ 가짜 해설' : '가짜 해설'}`),
    p('과목 1-2-3 (A)'),
  ];
}
async function parse(body: DocxNode[], options: Record<string, unknown> = {}) {
  return docxImporter.parse(
    { fileName: '가짜 참조.docx', data: await buildDocx({ body }) },
    { subject: 'dummy', ...options },
  );
}

it.each(['explanation', 'stem', 'passage'] as const)(
  '%s 참조가 있으면 기본 잠금하고 위치·앞 20자·수정 안내를 남긴다',
  async (field) => {
    const draft = await parse(record(field));
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0].question.shufflePolicy).toBe('lock-all');
    const diagnostic = draft.diagnostics.find((d) => d.code === 'CHOICES_LOCKED_BY_REFERENCE')!;
    expect(diagnostic).toMatchObject({ severity: 'info', ref: { draftIndex: 0 } });
    expect(diagnostic.message).toContain(draft.questions[0].sourceLocation);
    expect(diagnostic.message).toContain(`"${stem.slice(0, 20)}"`);
    expect(diagnostic.message).not.toContain(stem);
    expect(diagnostic.message).toContain(
      '해설·본문에 선지 번호(①~⑤)가 있어 선지 순서를 고정했습니다. 번호가 법 조항 등 선지와 무관하면 문제 편집에서 고정을 해제하세요',
    );
  },
);

it('참조가 없거나 옵션을 끄면 free를 유지하고 선지 자체 고정은 유지한다', async () => {
  for (const draft of [
    await parse(record('none')),
    await parse(record('explanation'), { lockChoicesOnReference: false }),
  ]) {
    expect(draft.questions[0].question.shufflePolicy).toBe('free');
    expect(draft.diagnostics.some((d) => d.code === 'CHOICES_LOCKED_BY_REFERENCE')).toBe(false);
  }
  const body = record('none');
  body[1] = p('① 가짜 ② 참조');
  const draft = await parse(body, { lockChoicesOnReference: false });
  expect(draft.questions[0].question.shufflePolicy).toBe('free');
  expect(draft.questions[0].question.choices[0].fixedPosition).toBe(true);
});

it('제외된 문제에는 잠금 진단을 남기지 않고 포함 인덱스를 사용한다', async () => {
  const skipped = record('explanation');
  skipped[skipped.length - 1] = p('과목 1-2-3 (B)');
  const draft = await parse([...skipped, ...record('explanation')]);
  expect(draft.questions).toHaveLength(1);
  expect(draft.diagnostics.filter((d) => d.code === 'CHOICES_LOCKED_BY_REFERENCE').map((d) => d.ref)).toEqual(
    [{ draftIndex: 0 }],
  );
});
