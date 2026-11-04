import { describe, expect, it } from 'vitest';
import type { ExamHeader } from '../../contracts/index';
import { exportOptions, makeExportSnapshot } from '../../../tests/fixtures/exportSnapshot';
import { describeExamHeader, renderExamHtml } from './index';

describe('시험지 머리 정보 HTML', () => {
  const snapshot = makeExportSnapshot();
  const count = snapshot.items.length;
  const full = { period: ' 1교시 ', durationMinutes: 85, pointsPerQuestion: 0.5 };

  it.each([
    [full, `1교시 · 시험 시간 85분 · 총 ${count}문항 · 문항당 0.5점`],
    [{ period: '1교시' }, `1교시 · 총 ${count}문항`],
    [{}, `총 ${count}문항`],
    [{ period: '   ' }, `총 ${count}문항`],
    [{ durationMinutes: 1, pointsPerQuestion: 1 }, `시험 시간 1분 · 총 ${count}문항 · 문항당 1점`],
    [{ durationMinutes: 0, pointsPerQuestion: -1 }, `총 ${count}문항`],
    [{ durationMinutes: 1.5, pointsPerQuestion: Infinity }, `총 ${count}문항`],
  ] satisfies [Omit<ExamHeader, 'candidateFields'>, string][])(
    '항목 %j를 고정 순서와 구분자로 표시한다',
    (fields, info) => {
      for (const candidateFields of [true, false]) {
        const header = { ...fields, candidateFields };
        const description = describeExamHeader(snapshot, header);
        expect(description.info).toBe(info);
        const html = renderExamHtml([snapshot], { ...exportOptions, header })[0].html;
        expect(html).toContain(`<div class="qb-exam-info">${info}</div>`);
        expect(html.includes('<div class="qb-student">')).toBe(candidateFields);
        expect(description.candidate).toBe(
          candidateFields ? '성명: ____________________　수험번호: ____________________' : undefined,
        );
        if (candidateFields) expect(html).toContain(description.candidate!);
        expect(html).not.toContain('점수:');
      }
    },
  );

  it('header가 없으면 기존 성명·점수 줄을 유지한다', () => {
    const original = renderExamHtml([snapshot], exportOptions);
    expect(renderExamHtml([snapshot], { ...exportOptions, header: undefined })).toEqual(original);
    expect(original[0].html).toContain(
      '<div class="qb-student">성명: ____________________　점수: __________</div>',
    );
    expect(original[0].html).not.toContain('<div class="qb-exam-info">');
    expect(original[0].html).not.toContain('수험번호');
  });

  it('분리·통합 모두 문제지에만 적용하고 정답·해설 HTML은 동일하다', () => {
    const header = { ...full, candidateFields: true };
    const original = renderExamHtml([snapshot], exportOptions);
    const documents = renderExamHtml([snapshot], { ...exportOptions, header });
    expect(documents.slice(1)).toEqual(original.slice(1));
    const combined = renderExamHtml([snapshot], { ...exportOptions, combineParts: true, header })[0].html;
    expect(combined.match(/<div class="qb-exam-info">/gu)).toHaveLength(1);
    expect(combined.match(/수험번호/gu)).toHaveLength(1);
  });

  it('교시 사용자 입력의 태그·앰퍼샌드를 이스케이프하고 빈 시험은 0문항이다', () => {
    const header = { period: '<시험 & 교시>', candidateFields: false };
    const html = renderExamHtml([{ ...snapshot, items: [] }], { ...exportOptions, header })[0].html;
    expect(html).toContain('&lt;시험 &amp; 교시&gt; · 총 0문항');
    expect(html).not.toContain('<시험');
  });
});
