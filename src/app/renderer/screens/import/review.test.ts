import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ImportItem, ImportReview } from '../../../shared/index';
import { makeQuestion } from '../../../../../tests/fixtures/builders';
import { editedItem, editedReview } from './review';
import { ImportReviewTable } from './ImportReviewTable';
import { ImportOptionsPanel } from './ImportOptionsPanel';
import { ImportItemEditor } from './ImportItemEditor';
import { visibleImportToggles } from './import-options';
import { filterReviewItems, reviewPage } from './review-page';
import { ImportSavedToast } from './ImportSavedToast';

const item: ImportItem = {
  index: 0,
  sourceLocation: '가짜.txt · 1번째 문단 부근',
  status: 'error',
  diagnostics: [{ code: 'OBJECTIVE_FORMAT_INVALID', severity: 'error', message: '학습목표를 고치세요.' }],
  draft: makeQuestion({ objectiveCode: '틀린 코드' }),
  summary: {
    id: 'fake',
    subject: 'dummy',
    objectiveCode: '틀린 코드',
    stemPreview: '가짜 본문',
    hasImage: false,
    hasPassage: false,
    warnings: 1,
    choiceCount: 5,
  },
};
const review: ImportReview = {
  batchId: 'fake',
  items: [item],
  files: [],
  assets: {},
  skipped: [],
  diagnostics: [],
  counts: { ok: 0, warn: 0, error: 1, excluded: 0 },
};
describe('가져오기 검수 상태와 정적 화면', () => {
  it('0·100·101개와 마지막 쪽의 경계를 제한하고 전체 행 번호를 유지한다', () => {
    const items = Array.from({ length: 201 }, (_, index) => ({ ...item, index }));
    expect(reviewPage([], 8)).toEqual({ page: 0, pages: 1, total: 0, items: [] });
    expect(reviewPage(items.slice(0, 100), 1).items).toHaveLength(100);
    expect(reviewPage(items.slice(0, 101), 1)).toMatchObject({ page: 1, pages: 2, total: 101 });
    expect(reviewPage(items.slice(0, 101), 1).items.map((entry) => entry.index)).toEqual([100]);
    expect(reviewPage(items, 99).items.map((entry) => entry.index)).toEqual([200]);
    expect(reviewPage(items, -1).page).toBe(0);
    const filtered = filterReviewItems(
      items.map((entry) => ({ ...entry, status: entry.index % 2 ? 'warn' : 'ok' })),
      'ok',
    );
    expect(reviewPage(filtered, 1).items.map((entry) => entry.index)).toEqual([200]);
    expect(filterReviewItems([item], 'error')).toEqual([item]);
    expect(filterReviewItems([item], 'excluded')).toEqual([]);
    expect(
      filterReviewItems(
        [{ ...item, diagnostics: [{ code: 'DUPLICATE_IN_BANK', severity: 'warn', message: '가짜' }] }],
        'duplicate',
      ),
    ).toHaveLength(1);
  });
  it('표는 첫 100행만 그리고 위아래에 페이지 이동을 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(ImportReviewTable, {
        review: {
          ...review,
          items: Array.from({ length: 3601 }, (_, index) => ({
            ...item,
            index,
            sourceLocation: `위치-${index}-끝`,
          })),
        },
        update: () => {},
        disabled: false,
        capture: false,
        onPreviewReady: () => {},
      }),
    );
    expect(html).toContain('위치-99-끝');
    expect(html).not.toContain('위치-100-끝');
    expect(html.match(/1 \/ 37 쪽 · 전체 3601개/gu)).toHaveLength(2);
    expect(html.match(/aria-label="검수 목록 페이지"/gu)).toHaveLength(2);
  });
  it('자동 과목은 첫 선택 항목이며 등급·지문 중복 옵션을 숨긴다', () => {
    expect(visibleImportToggles('auto').map((toggle) => toggle.id)).toEqual([
      'requireObjective',
      'lockChoicesOnReference',
    ]);
    expect(visibleImportToggles('law')).toHaveLength(4);
    const html = renderToStaticMarkup(
      createElement(ImportOptionsPanel, {
        options: { subject: 'auto' },
        subjects: [{ id: 'law', name: '법규' }],
        update: () => {},
        disabled: false,
      }),
    );
    expect(html.indexOf('value="auto"')).toBeLessThan(html.indexOf('value=""'));
    expect(html).toContain('과목은 PART 제목으로');
    expect(html).not.toContain('A 등급만');
    expect(html).not.toContain('같은 지문은 첫 문제만');
  });
  it('저장 알림은 새 과목 이름을 함께 안내한다', () => {
    const html = renderToStaticMarkup(
      createElement(ImportSavedToast, {
        result: { saved: 100, savedIds: [], notSaved: [], newSubjects: ['치아형태학'] },
        batchId: 'fake',
        close: () => {},
        fail: () => {},
      }),
    );
    expect(html).toContain('100문제를 저장했습니다. 새로 등록된 과목: 치아형태학');
  });
  it('목표 수정으로 오류를 해소하고 미완료 오류·제외 상태를 집계한다', () => {
    expect(editedItem(item).status).toBe('error');
    expect(editedItem(item, { index: 0, objectiveCode: '과목 1-2-3' }).status).toBe('ok');
    expect(editedItem(item, { index: 0, objectiveCode: '' }).status).toBe('warn');
    expect(editedItem(item, { index: 0, objectiveCode: '가짜' }).status).toBe('error');
    expect(editedItem(item, { index: 0, include: false }).status).toBe('excluded');
    expect(editedReview(review, { 0: { index: 0, objectiveCode: '과목 1-2-3' } }).counts).toEqual({
      ok: 1,
      warn: 0,
      error: 0,
      excluded: 0,
    });
    expect(item.draft.objectiveCode).toBe('틀린 코드');
  });
  it('기본 제외인 은행 중복도 명시적 포함으로 복원할 수 있다', () => {
    const excluded = {
      ...item,
      status: 'excluded' as const,
      diagnostics: [{ code: 'DUPLICATE_IN_BANK', severity: 'warn' as const, message: '가짜 중복' }],
    };
    expect(editedItem(excluded).status).toBe('excluded');
    expect(editedItem(excluded, { index: 0, include: true }).status).toBe('warn');
  });
  it('검수 표는 필터·원문 위치·행 키보드 초점·펼치기를 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(ImportReviewTable, {
        review,
        update: () => {},
        disabled: false,
        capture: false,
        onPreviewReady: () => {},
      }),
    );
    expect(html).toContain('은행과 중복');
    expect(html).toContain('가져오기 전 제외');
    expect(html).toContain('가짜.txt');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-expanded="false"');
  });
  it('캡처 검수는 첫 경고 행을 펼치고 공유 render-html 미리보기를 사용한다', () => {
    const html = renderToStaticMarkup(
      createElement(ImportReviewTable, {
        review: { ...review, items: [{ ...item, status: 'warn' }] },
        update: () => {},
        disabled: false,
        capture: true,
        onPreviewReady: () => {},
      }),
    );
    expect(html).toContain('sandbox=""');
    expect(html).toContain('srcDoc=');
    expect(html).toContain('진단과 즉석 수정');
  });
  it('초기 과목은 필수이며 설정 순서를 유지하고 각 옵션에 설명이 있다', () => {
    const html = renderToStaticMarkup(
      createElement(ImportOptionsPanel, {
        options: { subject: '', includeGrades: ['A'] },
        subjects: [
          { id: 'law', name: '\uBC95\uADDC' },
          { id: 'anatomy', name: '\uD574\uBD80' },
        ],
        update: () => {},
        disabled: false,
      }),
    );
    expect(html).toContain('required');
    expect(html.indexOf('법규')).toBeLessThan(html.indexOf('해부'));
    expect(html).toContain('A 등급만');
    expect(html).toContain('본문과 예문이 같으면 첫 문제만');
  });
  it('오류와 빈 목록에도 다음 행동을 안내한다', () => {
    expect(
      renderToStaticMarkup(createElement(ImportItemEditor, { item, update: () => {}, disabled: false })),
    ).toContain('aria-invalid="true"');
    expect(
      renderToStaticMarkup(
        createElement(ImportReviewTable, {
          review: { ...review, items: [] },
          update: () => {},
          disabled: false,
          capture: false,
          onPreviewReady: () => {},
        }),
      ),
    ).toContain('해당 문제가 없습니다');
  });
});
