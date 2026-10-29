import { describe, expect, it } from 'vitest';
import type { AssetData, Block, ExportPart } from '../../contracts/index';
import { deepFreeze, makeRuleSet, makeSelectedExam, para } from '../../../tests/fixtures/builders';
import { makeExamBank } from '../../../tests/fixtures/examBank';
import { htmlToPlainText } from '../../../tests/fixtures/htmlText';
import { buildSnapshot } from '../exam-snapshot/index';
import { renderBlocks, renderExamHtml, resolveTemplate } from './index';

function snapshots() {
  const bank = makeExamBank();
  return [1, 2].map((number) => buildSnapshot({
    exam: makeSelectedExam({ questions: bank.questions.slice(0, 7),
      slotOfQuestion: Object.fromEntries(bank.questions.slice(0, 7).map((q) => [q.id, 'slot-1'])),
      blanks: [{ slotId: 'slot-1', count: 1 }] }),
    rules: makeRuleSet(), examIndex: number - 1, seed: 'fake-render', title: `가짜 시험 ${number}회`,
    examId: `fake-render-${number}`, createdAt: '2026-01-01T00:00:00Z', assets: bank.assets,
  }).snapshot);
}

const parts: ExportPart[] = ['questions', 'answers', 'explanations'];
const options = { parts, combineParts: false, templateId: 'standard' };

function textOfBlocks(blocks: Block[]): string[] {
  return blocks.flatMap((block): string[] => {
    if (block.type === 'paragraph') return [block.runs.map((run) => run.text).join('')];
    if (block.type === 'table') return block.rows.flatMap((row) => row.flatMap(textOfBlocks));
    return [];
  });
}

function assertTextInOrder(html: string, texts: string[]): void {
  const actual = htmlToPlainText(html).replace(/\s+/gu, ' ');
  let position = 0;
  for (const text of texts) {
    const normalized = text.replace(/\s+/gu, ' ').trim();
    const index = actual.indexOf(normalized, position);
    expect(index, `출력에서 '${normalized}'를 순서대로 찾지 못했습니다.`).toBeGreaterThanOrEqual(position);
    position = index + normalized.length;
  }
}

describe('순수 HTML 블록 렌더러', () => {
  it('스크립트·따옴표·앰퍼샌드를 이스케이프하고 줄바꿈·탭·연속 공백을 보존한다', () => {
    const text = '<script>alert("가짜" & \'내용\')</script>\n다음\t두  칸';
    const html = renderBlocks([para(text)], { assets: {} });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;가짜&quot; &amp; &#39;내용&#39;)&lt;/script&gt;');
    expect(html).toContain('<br>');
    expect(html).toContain('&emsp;두  칸');
    expect(html).toContain('white-space: pre-wrap');
    expect(htmlToPlainText(html).trim()).toBe(text);
  });

  it('밑줄을 u로 만들고 모든 run 서식을 함께 보존한다', () => {
    const html = renderBlocks([para('가짜 서식', { underline: true, bold: true, italic: true, superscript: true, subscript: true })], { assets: {} });
    for (const tag of ['u', 'strong', 'em', 'sup', 'sub']) {
      expect(html).toContain(`<${tag}>`);
      expect(html).toContain(`</${tag}>`);
    }
    expect(htmlToPlainText(html).trim()).toBe('가짜 서식');
  });

  it('중첩 표를 재귀 렌더링하고 1×1 표에만 박스 클래스를 붙인다', () => {
    const html = renderBlocks([{ type: 'table', rows: [[
      [{ type: 'table', rows: [[[para('가짜 박스')]]] }], [para('가짜 옆 셀')],
    ]] }], { assets: {} });
    expect(html).toContain('<table class="qb-table"><tbody><tr><td><table class="qb-table qb-box">');
    expect(html.match(/qb-box/gu)).toHaveLength(1);
    assertTextInOrder(html, ['가짜 박스', '가짜 옆 셀']);
  });

  it.each(['png', 'jpeg', 'gif', 'webp', 'bmp'])('허용 이미지 %s를 data URI로 만들고 속성을 이스케이프한다', (kind) => {
    const asset: AssetData = { id: 'fake', mime: `image/${kind}`, sha256: '', dataBase64: 'YWJj' };
    const html = renderBlocks([{ type: 'image', assetId: 'fake', widthPx: 120, heightPx: 60,
      alt: '\" onerror=\"<script>&\'' }], { assets: { fake: asset } });
    expect(html).toContain(`src="data:image/${kind};base64,YWJj" width="120" height="60"`);
    expect(html).toContain('alt="&quot; onerror=&quot;&lt;script&gt;&amp;&#39;"');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain(' onerror="');
  });

  it('허용하지 않은 MIME·누락 자산·깨진 base64를 경고 자리표시로 만든다', () => {
    const fake = { id: 'fake', mime: 'image/svg+xml', sha256: '', dataBase64: 'YWJj' };
    const image: Block[] = [{ type: 'image', assetId: 'fake' }];
    expect(renderBlocks(image, { assets: { fake } })).toContain('[지원하지 않는 이미지]');
    expect(renderBlocks(image, { assets: {} })).toContain('class="qb-warning"');
    expect(renderBlocks(image, { assets: {} })).toContain('[이미지 없음]');
    expect(renderBlocks(image, { assets: { fake: { ...fake, mime: 'image/png', dataBase64: '" onerror="alert(1)' } } })).not.toContain('<img');
    expect(renderBlocks([], { assets: {} })).toBe('');
    expect(renderBlocks([{ type: 'image', assetId: '__proto__' }], { assets: {} })).toContain('[이미지 없음]');
  });
});

describe('회차별 시험지 HTML', () => {
  it('분리 시 회차×파트, 결합 시 회차마다 한 문서를 만들고 문제→정답→해설 순서다', () => {
    const data = snapshots();
    const separate = renderExamHtml(data, options);
    expect(separate).toHaveLength(6);
    expect(separate.map((document) => [document.examId, document.part])).toEqual([
      ['fake-render-1', 'questions'], ['fake-render-1', 'answers'], ['fake-render-1', 'explanations'],
      ['fake-render-2', 'questions'], ['fake-render-2', 'answers'], ['fake-render-2', 'explanations'],
    ]);
    const combined = renderExamHtml(data, { ...options, combineParts: true, parts: ['explanations', 'answers', 'questions', 'questions'] });
    expect(combined).toHaveLength(2);
    expect(combined.every((document) => document.part === 'combined')).toBe(true);
    assertTextInOrder(combined[0].html, ['문제지', '정답지', '해설지']);
    expect(combined[0].html).not.toContain('가짜 시험 2회');
    expect(combined[0].title).toBe('가짜 시험 1회 통합본');
    expect(renderExamHtml(data, { ...options, parts: [] })).toEqual([]);
    expect(renderExamHtml([], options)).toEqual([]);
  });

  it('문제지에 제목·성명·점수·2단·인쇄 CSS와 빈 번호 점선 상자가 있다', () => {
    const documents = renderExamHtml(snapshots(), options);
    const questions = documents[0].html;
    for (const expected of ['@page { size: A4; margin: 18mm;', "'Noto Serif KR','바탕','Batang',serif", 'font-size: 10pt',
      "'Noto Sans KR','맑은 고딕','Malgun Gothic',sans-serif", 'column-count: 2', 'column-rule:',
      'break-inside: avoid', '@media print', '성명:', '점수:', 'class="qb-item qb-blank"',
      '(출제 가능한 문제가 없어 비워 둔 번호입니다)', 'border: 1px dashed', 'class="qb-passage"']) expect(questions).toContain(expected);
    expect(questions).not.toContain('<ul');
    expect(documents[1].html).not.toContain('성명:');
    expect(documents[2].html).not.toContain('점수:');
    expect(questions).not.toContain('prefers-color-scheme');
    expect(questions).toContain('--surface: #FFFFFF');
    expect(questions).toContain('max-width: 100%; height: auto');
  });

  it('정답을 5쌍씩 표에 배치하고 빈 번호는 대시, 해설은 정답·블록·학습목표를 포함한다', () => {
    const [questions, answers, explanations] = renderExamHtml(snapshots().slice(0, 1), options);
    const table = answers.html.slice(answers.html.indexOf('<table class="qb-answer-grid">'));
    expect(table.match(/<tr>/gu)).toHaveLength(2);
    expect(table.slice(0, table.indexOf('</tr>')).match(/<th scope="row">/gu)).toHaveLength(5);
    expect(table).toContain('<th scope="row">8</th><td>—</td>');
    expect(explanations.html).toContain('class="qb-item qb-explanation"');
    expect(explanations.html).toContain('학습목표: 법규');
    expect(htmlToPlainText(explanations.html)).toContain('정답:');
    expect(questions.html).toContain('<u>');
  });

  it('모든 문항 지문·본문·선지·해설의 텍스트가 확정본 순서대로 출력된다', () => {
    const data = snapshots();
    const documents = renderExamHtml(data, options);
    for (const [index, snapshot] of data.entries()) {
      const questionTexts = snapshot.items.flatMap((item) => item.blank ? [] : [
        ...textOfBlocks(item.stem), ...textOfBlocks(item.passage ?? []),
        ...item.choices.flatMap((choice) => textOfBlocks(choice.content)),
      ]);
      const explanationTexts = snapshot.items.flatMap((item) => textOfBlocks(item.explanation));
      assertTextInOrder(documents[index * 3].html, questionTexts);
      assertTextInOrder(documents[index * 3 + 2].html, explanationTexts);
      const combined = renderExamHtml([snapshot], { ...options, combineParts: true })[0];
      assertTextInOrder(combined.html, [...questionTexts, ...explanationTexts]);
    }
  });

  it('알 수 없는 템플릿은 standard로 대체하며 헤드 주석을 만들지 않는다', () => {
    expect(resolveTemplate('unknown')).toEqual({ id: 'standard', usedFallback: true });
    expect(resolveTemplate('standard')).toEqual({ id: 'standard', usedFallback: false });
    const data = snapshots();
    expect(renderExamHtml(data, { ...options, templateId: 'unknown' })).toEqual(renderExamHtml(data, options));
    expect(renderExamHtml(data, options)[0].html).not.toContain('<!--');
  });

  it('자기완결 폰트 CSS를 기본 스타일 앞에 넣고 외부 URL과 style 탈출을 차단한다', () => {
    const fontFaceCss = "@font-face { font-family: '가짜'; src: url(data:font/woff2;base64,YWJj) format('woff2'); }";
    const html = renderExamHtml(snapshots().slice(0, 1), { ...options, fontFaceCss })[0].html;
    expect(html).toContain(`<style data-qb-fonts>${fontFaceCss}</style><style>`);
    for (const css of ["@font-face { src: url('https://example.invalid/a.woff2'); }", '@import "file:///bad.css";',
      '</style><script>alert(1)</script>', '@font-face { src: url(//example.invalid/a); }',
      '@font-face { src: u\\72l(https://example.invalid/a); }']) {
      const document = renderExamHtml(snapshots().slice(0, 1), { ...options, fontFaceCss: css })[0];
      expect(document.html).not.toContain('data-qb-fonts');
      expect(document.html).not.toMatch(/https?:|file:|<script/iu);
    }
  });

  it('같은 입력은 같은 HTML이며 동결 입력을 바꾸지 않고 외부 리소스가 없다', () => {
    const data = deepFreeze(snapshots());
    const before = structuredClone(data);
    const first = renderExamHtml(data, options);
    expect(renderExamHtml(data, options)).toStrictEqual(first);
    expect(data).toStrictEqual(before);
    first.forEach((document) => expect(document.html).not.toMatch(/(?:https?|file):|(?:src|href)=["']\/\//iu));
  });
});
