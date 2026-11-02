import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilePlus2 } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { EditorScreen } from './EditorScreen';
import { EditorPastePanel } from './EditorPastePanel';
import { ExplanationAnswer } from './ExplanationAnswer';
import { EditorChoices } from './EditorChoices';
import { newQuestion } from '../../lib/editor/index';
import { RichTextField, BlockListEditor } from '../../components/index';

describe('편집기 정적 렌더', () => {
  it('빈 폼·검사 중 저장 비활성·공용 sandbox 미리보기를 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(EditorScreen, {
        query: new URLSearchParams(),
        settings: { theme: 'light', subjects: [{ id: 'fake', name: '가짜 과목' }], defaultSaveDir: '' },
        info: { version: 'fake', dataDir: '', dbPath: '', isPackaged: false },
        update: async () => {},
        notify: () => {},
        route: { id: 'add', title: '문제 추가', description: '가짜 화면', icon: FilePlus2 },
      }),
    );
    for (const text of [
      'PDF 붙여넣기',
      '학습목표가 없으면 출제 대상에서 빠집니다',
      '정답을 선택하세요',
      '검사 중입니다.',
      'sandbox=""',
      '실시간 미리보기',
    ])
      expect(html).toContain(text);
  });
  it('서식 입력의 접근성 라벨과 모든 도구를 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(RichTextField, { label: '가짜 본문', value: [], onChange: () => {} }),
    );
    for (const text of [
      'role="textbox"',
      'aria-multiline="true"',
      'aria-labelledby=',
      '밑줄',
      'Ctrl+U',
      'aria-pressed="false"',
      '굵게',
      '기울임',
      '위첨자',
      '아래첨자',
    ])
      expect(html).toContain(text);
  });
  it('선지 2개·10개의 삭제·추가 경계를 비활성화한다', () => {
    const q = newQuestion('fake');
    q.choices = q.choices.slice(0, 2);
    let html = renderToStaticMarkup(createElement(EditorChoices, { question: q, change: () => {} }));
    expect(html).toMatch(/disabled=""[^>]*>선지 삭제/u);
    q.choices = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, content: [] }));
    html = renderToStaticMarkup(createElement(EditorChoices, { question: q, change: () => {} }));
    expect(html).toMatch(/disabled=""[^>]*>선지 추가/u);
  });
  it('빈 블록 영역은 이미지 형식·크기와 다음 행동을 설명한다', () => {
    const html = renderToStaticMarkup(
      createElement(BlockListEditor, { label: '예문', value: [], onChange: () => {}, onAsset: () => {} }),
    );
    for (const text of ['문단 추가', '보기 상자 추가', '표 추가', '이미지 추가', '10MB 이하'])
      expect(html).toContain(text);
  });
});

describe('붙여넣기 컨트롤', () => {
  it('편집은 접고 추가는 펼치며 빈 입력의 자동 분리를 설명한다', () => {
    const props = {
      parse: async () => {},
      busy: false,
      position: 0,
      question: newQuestion('fake'),
      statuses: {},
      unsavedCurrent: false,
      update: () => {},
      error: () => {},
      capture: false,
      join: 'space' as const,
      joinLoading: false,
      changeJoin: async () => {},
    };
    const edit = renderToStaticMarkup(createElement(EditorPastePanel, { ...props, edit: true }));
    expect(edit).toContain('aria-expanded="false"');
    expect(edit).toMatch(/id="editor-paste-panel"[^>]*hidden=""/u);
    const add = renderToStaticMarkup(createElement(EditorPastePanel, { ...props, edit: false }));
    expect(add).toContain('aria-expanded="true"');
    expect(add).toContain('줄바꿈 잇기');
    expect(add).toContain('띄어쓰기로');
    expect(add).toContain('붙여서');
    expect(add).toContain('PDF에서 복사한 문제를 먼저 붙여넣으세요.');
  });
  it('빈 정답은 체크하고 기존 정답과 다르면 경고하며 덮어쓰기 체크를 해제한다', () => {
    const question = newQuestion('fake');
    const props = {
      question,
      explanation: { number: '1', explanation: [], answerPositions: [3] },
      number: '1',
      select: () => {},
    };
    expect(renderToStaticMarkup(createElement(ExplanationAnswer, props))).toContain('checked=""');
    const conflict = renderToStaticMarkup(
      createElement(ExplanationAnswer, { ...props, question: { ...question, answerChoiceIds: ['c1'] } }),
    );
    expect(conflict).not.toContain('checked=""');
    expect(conflict).toContain('기존 정답과 다릅니다');
    const checked = renderToStaticMarkup(
      createElement(ExplanationAnswer, {
        ...props,
        question: { ...question, answerChoiceIds: ['c1'] },
        checked: true,
      }),
    );
    expect(checked).toContain('checked=""');
  });
});
