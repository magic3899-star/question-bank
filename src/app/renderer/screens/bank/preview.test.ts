import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeQuestion } from '../../../../../tests/fixtures/builders';
import { QuestionPreview } from '../../components/index';

describe('미리보기 로딩·오류·빈 상태', () => {
  const common = { retry: () => {}, onReady: () => {} };
  it('문항을 준비할 때는 스켈레톤이 iframe을 가리고 권한 없는 HTML을 로드한다', () => {
    const html = renderToStaticMarkup(
      createElement(QuestionPreview, {
        ...common,
        loading: false,
        error: '',
        detail: { question: makeQuestion(), assets: {} },
      }),
    );
    expect(html).toContain('문항 미리보기를 불러오고 있습니다');
    expect(html).toContain('sandbox=""');
    expect(html).toContain('srcDoc=');
    expect(html).toContain('pending');
  });
  it('IPC 로딩·오류·선택 없음에는 각각 진행 상태·재시도·안내를 표시한다', () => {
    expect(
      renderToStaticMarkup(createElement(QuestionPreview, { ...common, loading: true, error: '' })),
    ).toContain('role="status"');
    expect(
      renderToStaticMarkup(
        createElement(QuestionPreview, { ...common, loading: false, error: '문제를 다시 선택하세요.' }),
      ),
    ).toContain('다시 시도');
    expect(
      renderToStaticMarkup(createElement(QuestionPreview, { ...common, loading: false, error: '' })),
    ).toContain('문제를 선택하세요');
  });
});
