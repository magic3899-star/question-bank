import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildExamHeaderRequest, initialExamHeaderForm } from './examHeaderForm';
import type { ExamHeaderForm } from './examHeaderForm';
import { ExportOptions, useExamHeader } from './index';

describe('시험지 머리 입력 검증과 요청', () => {
  it('기본은 꺼짐·응시자 칸 켜짐이며 꺼지면 잘못된 입력도 보내지 않는다', () => {
    expect(initialExamHeaderForm).toMatchObject({ enabled: false, candidateFields: true });
    expect(buildExamHeaderRequest({ ...initialExamHeaderForm, durationMinutes: '-1' })).toEqual({
      request: {},
      errors: {},
    });
    function Initial() {
      const model = useExamHeader();
      return createElement('span', null, JSON.stringify(model.request));
    }
    expect(renderToStaticMarkup(createElement(Initial))).toBe('<span>{}</span>');
  });

  it('켜고 선택 입력이 비어 있으면 문항 수와 응시자 칸만 요청한다', () => {
    expect(buildExamHeaderRequest({ ...initialExamHeaderForm, enabled: true }).request).toEqual({
      header: { candidateFields: true },
    });
  });

  it('문자 입력을 숫자로 바꾸고 교시 공백을 제거한다', () => {
    const form = Object.freeze({
      ...initialExamHeaderForm,
      enabled: true,
      period: ' 1교시 ',
      durationMinutes: '85',
      pointsPerQuestion: '0.5',
      candidateFields: false,
    });
    expect(buildExamHeaderRequest(form)).toEqual({
      request: {
        header: { period: '1교시', durationMinutes: 85, pointsPerQuestion: 0.5, candidateFields: false },
      },
      errors: {},
    });
    expect(form.period).toBe(' 1교시 ');
  });

  it.each(['0', '-1', '601', '1.5', '숫자 아님', 'NaN', 'Infinity'])(
    '시간 %s는 저장 요청을 만들지 않고 이유를 반환한다',
    (durationMinutes) => {
      const result = buildExamHeaderRequest({ ...initialExamHeaderForm, enabled: true, durationMinutes });
      expect(result.request).toEqual({});
      expect(result.errors.durationMinutes).toContain('1~600분 사이의 정수');
    },
  );
  it.each(['0', '-1', '100.1', '숫자 아님', 'NaN', 'Infinity'])(
    '배점 %s는 저장 요청을 만들지 않고 이유를 반환한다',
    (pointsPerQuestion) => {
      const result = buildExamHeaderRequest({ ...initialExamHeaderForm, enabled: true, pointsPerQuestion });
      expect(result.request).toEqual({});
      expect(result.errors.pointsPerQuestion).toContain('0 초과 100 이하');
    },
  );
  it.each(['1', '600'])('시간 경계 %s와 최대 배점을 허용한다', (durationMinutes) => {
    expect(
      buildExamHeaderRequest({
        ...initialExamHeaderForm,
        enabled: true,
        durationMinutes,
        pointsPerQuestion: '100',
      }).errors,
    ).toEqual({});
  });
  it('교시 길이 경계와 선택 입력의 공백을 처리한다', () => {
    const form = { ...initialExamHeaderForm, enabled: true, period: '가'.repeat(30) };
    expect(buildExamHeaderRequest(form).errors).toEqual({});
    expect(buildExamHeaderRequest({ ...form, period: '가'.repeat(31) }).errors.period).toContain('30자 이하');
    expect(
      buildExamHeaderRequest({ ...form, period: '  ', durationMinutes: ' ', pointsPerQuestion: ' ' }).request,
    ).toEqual({ header: { candidateFields: true } });
  });
});

function optionsMarkup(form: ExamHeaderForm) {
  const result = buildExamHeaderRequest(form);
  return renderToStaticMarkup(
    createElement(ExportOptions, {
      snapshots: [],
      formats: ['pdf'],
      setFormats: () => {},
      parts: ['questions'],
      setParts: () => {},
      combine: false,
      setCombine: () => {},
      exams: [],
      setExams: () => {},
      examHeader: { form, ...result, setField: () => {}, reason: Object.values(result.errors)[0] },
    }),
  );
}

it('공통 저장 옵션은 기본 체크와 활성 입력·연결된 오류를 표시한다', () => {
  const initial = optionsMarkup(initialExamHeaderForm);
  expect(initial).toContain('시험지 머리 정보 넣기');
  expect(initial).not.toContain('type="number"');
  const html = optionsMarkup({ ...initialExamHeaderForm, enabled: true, durationMinutes: '0' });
  expect(html).toContain('성명·수험번호 칸 넣기');
  expect(html).toContain('1~600분 사이의 정수');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-describedby=');
  expect(html).toMatch(/type="checkbox"[^>]*checked=""/u);
  expect(html.match(/<label[^>]*for=/gu)).toHaveLength(3);
});
