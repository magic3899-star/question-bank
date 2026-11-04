import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { buildExamTypesRequest, useExamTypes } from './useExamTypes';

it('두 가지 저장 상태를 요청으로 바꾸고 기본은 한 가지다', () => {
  expect(buildExamTypesRequest(false)).toEqual({ examTypes: 'single' });
  expect(buildExamTypesRequest(true)).toEqual({ examTypes: 'both' });
  expect(buildExamTypesRequest(false)).toEqual({ examTypes: 'single' });
  function Initial() {
    const model = useExamTypes();
    return createElement('span', null, `${model.both}/${model.request.examTypes}`);
  }
  expect(renderToStaticMarkup(createElement(Initial))).toBe('<span>false/single</span>');
});
