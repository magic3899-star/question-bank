import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, EmptyState, ErrorState, Select, SearchInput, Skeleton, Tabs } from './index';

describe('분리한 공통 컴포넌트 HTML', () => {
  it('비활성 버튼은 키보드로 확인할 수 있는 이유를 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { disabledReason: '다음 단계에서 제공됩니다.' }, '추가'),
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="다음 단계에서 제공됩니다."');
  });
  it('입력의 라벨과 검색 유형·힌트를 유지한다', () => {
    const html = renderToStaticMarkup(createElement(SearchInput, { id: 'quick-search' }));
    expect(html).toContain('for="quick-search"');
    expect(html).toContain('type="search"');
    expect(html).toContain('Ctrl+K');
  });
  it('빈 상태·오류·로딩과 배지에 한국어 설명을 제공한다', () => {
    expect(
      renderToStaticMarkup(
        createElement(EmptyState, { icon: null, title: '문제 없음', description: '문제를 추가하세요.' }),
      ),
    ).toContain('문제를 추가하세요.');
    expect(
      renderToStaticMarkup(
        createElement(ErrorState, { message: '경로를 다시 선택하세요.', retry: () => {} }),
      ),
    ).toContain('다시 시도');
    expect(renderToStaticMarkup(createElement(Skeleton))).toContain('role="status"');
    expect(renderToStaticMarkup(createElement(Badge, { kind: 'warning', children: '확인 필요' }))).toContain(
      '확인 필요',
    );
  });
  it('탭은 선택된 항목만 기본 Tab 포커스를 받는다', () => {
    const html = renderToStaticMarkup(
      createElement(Tabs, {
        label: '테마',
        items: [
          { id: 'light', label: '라이트' },
          { id: 'dark', label: '다크' },
        ],
        value: 'dark',
        onChange: () => {},
      }),
    );
    expect(html).toContain('aria-selected="false" tabindex="-1"');
    expect(html).toContain('aria-selected="true" tabindex="0"');
  });
});

it('Select는 라벨·오류 설명·기본 키보드 조작을 위한 select를 연결한다', () => {
  const html = renderToStaticMarkup(
    createElement(
      Select,
      { label: '등급', id: 'fake-grade', error: '등급을 다시 고르세요.', disabled: true },
      createElement('option', { value: 'A' }, 'A'),
    ),
  );
  expect(html).toContain('for="fake-grade"');
  expect(html).toContain('id="fake-grade"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-describedby="fake-grade-error"');
  expect(html).toContain('disabled=""');
});
