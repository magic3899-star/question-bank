import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import type { Block, ExamSnapshot } from '../../src/contracts/index';
import { docxPlainText, inspectDocx, readXlsx, xlsxPlainText } from '../fixtures/extractText';
import { htmlToPlainText } from '../fixtures/htmlText';

export function paragraphTexts(blocks: Block[]): string[] {
  return blocks.flatMap((block): string[] => block.type === 'paragraph' ? [block.runs.map((run) => run.text).join('')]
    : block.type === 'table' ? block.rows.flatMap((row) => row.flatMap(paragraphTexts)) : []).filter(Boolean);
}

export function flatCellText(blocks: Block[]): string {
  return blocks.map((block): string => block.type === 'paragraph' ? block.runs.map((run) => run.text).join('')
    : block.type === 'image' ? '[이미지]' : block.rows.map((row) => row.map(flatCellText).join(' | ')).join('\n')).join('\n');
}

export function blockCounts(blocks: Block[]): { underline: number; images: number; tables: number } {
  const result = { underline: 0, images: 0, tables: 0 };
  for (const block of blocks) {
    if (block.type === 'image') result.images++;
    if (block.type === 'paragraph') result.underline += block.runs.filter((run) => run.underline).length;
    if (block.type === 'table') {
      result.tables++;
      for (const row of block.rows) for (const cell of row) {
        const nested = blockCounts(cell);
        result.underline += nested.underline; result.images += nested.images; result.tables += nested.tables;
      }
    }
  }
  return result;
}

export function snapshotCounts(snapshot: ExamSnapshot) {
  return blockCounts(snapshot.items.flatMap((item) => [...item.stem, ...(item.passage ?? []),
    ...item.choices.flatMap((choice) => choice.content), ...item.explanation]));
}

export function expectedDocxParagraphs(snapshot: ExamSnapshot, parts = ['questions', 'answers', 'explanations']): string[] {
  const expected: string[] = [];
  if (parts.includes('questions')) {
    expected.push(`${snapshot.title} 문제지`, '성명: ____________________　점수: __________');
    for (const item of snapshot.items) {
      expected.push(`${item.number}.`);
      if (item.blank) expected.push('(출제 가능한 문제가 없어 비워 둔 번호입니다)');
      else {
        expected.push(...paragraphTexts(item.stem), ...paragraphTexts(item.passage ?? []));
        for (const choice of item.choices) {
          const first = choice.content[0];
          expected.push(`${choice.label} ${first?.type === 'paragraph' ? first.runs.map((run) => run.text).join('') : ''}`,
            ...paragraphTexts(first?.type === 'paragraph' ? choice.content.slice(1) : choice.content));
        }
      }
    }
  }
  if (parts.includes('answers')) {
    expected.push(`${snapshot.title} 정답지`);
    for (const item of snapshot.items) expected.push(String(item.number), item.blank ? '—' : item.answerLabels.join(', '));
  }
  if (parts.includes('explanations')) {
    expected.push(`${snapshot.title} 해설지`);
    for (const item of snapshot.items) {
      expected.push(`${item.number}. 정답: ${item.blank ? '—' : item.answerLabels.join(', ')}`);
      if (item.blank) expected.push('비워 둔 번호입니다.');
      else expected.push(...paragraphTexts(item.explanation), `학습목표: ${item.objectiveCode ?? '미지정'}`);
    }
  }
  return expected;
}

function assertHtml(snapshot: ExamSnapshot, html: string): void {
  const section = (part: string): string => {
    const match = html.match(new RegExp(`<section class="qb-part qb-${part}-part">([\\s\\S]*?)</section>`));
    ok(match, `${part} HTML 파트 누락`);
    return match[1];
  };
  const questions = [...section('questions').matchAll(/<article class="qb-item(?: qb-blank)?">([\s\S]*?)<\/article>/gu)];
  equal(questions.length, snapshot.items.length);
  for (const [index, item] of snapshot.items.entries()) {
    const actual = questions[index][1];
    if (item.blank) equal(htmlToPlainText(actual), `${item.number}. (출제 가능한 문제가 없어 비워 둔 번호입니다)`);
    else {
      const tokens = [...actual.matchAll(/<(?:span class="qb-(?:number|label)"|p\b[^>]*)>([\s\S]*?)<\/(?:span|p)>/gu)]
        .map((match) => htmlToPlainText(match[1]));
      deepStrictEqual(tokens, [`${item.number}.`, ...paragraphTexts(item.stem), ...paragraphTexts(item.passage ?? []),
        ...item.choices.flatMap((choice) => [choice.label, ...paragraphTexts(choice.content)])], `HTML ${item.number}번 내용`);
    }
  }
  const answers = [...section('answers').matchAll(/<th scope="row">(\d+)<\/th><td>([\s\S]*?)<\/td>/gu)]
    .map((match) => [match[1], htmlToPlainText(match[2])]);
  deepStrictEqual(answers, snapshot.items.map((item) => [String(item.number), item.blank ? '—' : item.answerLabels.join(', ')]));
  const explanations = [...section('explanations').matchAll(/<article class="qb-item qb-explanation">([\s\S]*?)<\/article>/gu)];
  equal(explanations.length, snapshot.items.length);
  for (const [index, item] of snapshot.items.entries()) {
    const tokens = [...explanations[index][1].matchAll(/<(?:h3|p)\b[^>]*>([\s\S]*?)<\/(?:h3|p)>/gu)].map((m) => htmlToPlainText(m[1]));
    deepStrictEqual(tokens, [`${item.number}. 정답: ${item.blank ? '—' : item.answerLabels.join(', ')}`,
      ...(item.blank ? ['비워 둔 번호입니다.'] : [...paragraphTexts(item.explanation), `학습목표: ${item.objectiveCode ?? '미지정'}`])]);
  }
  const counts = snapshotCounts(snapshot);
  equal((html.match(/<u>/gu) ?? []).length, counts.underline);
  equal((html.match(/<img /gu) ?? []).length, counts.images);
  equal((html.match(/<table class="qb-table/gu) ?? []).length, counts.tables);
}

export async function assertExportMatchesSnapshot(snapshot: ExamSnapshot, output: { docx: Uint8Array; xlsx: Uint8Array; html: string }): Promise<void> {
  const docx = await inspectDocx(output.docx);
  deepStrictEqual(docx.paragraphs.filter(Boolean), expectedDocxParagraphs(snapshot), 'Word 번호별 본문·정답·해설');
  equal(await docxPlainText(output.docx), docx.paragraphs.join('\n'));
  const counts = snapshotCounts(snapshot);
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  equal(docx.document.getElementsByTagNameNS(ns, 'u').length, counts.underline, 'Word 밑줄 수');
  equal(docx.document.getElementsByTagNameNS(ns, 'tbl').length, counts.tables + (snapshot.items.length ? 1 : 0), 'Word 표 수');
  const blips = Array.from(docx.document.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip'));
  equal(blips.length, counts.images, 'Word 이미지 참조 수');
  const relations = docx.zip.file('word/_rels/document.xml.rels');
  ok(relations);
  const relXml = await relations.async('string');
  for (const blip of blips) {
    const id = blip.getAttribute('r:embed');
    ok(id && relXml.includes(`Id="${id}"`), 'Word 이미지 관계 누락');
  }
  const mediaTargets = [...relXml.matchAll(/Target="media\/([^"]+)"/gu)].map((m) => m[1]);
  for (const target of mediaTargets) ok(docx.zip.file(`word/media/${target}`), 'Word 이미지 파일 누락');
  ok(counts.images === 0 || mediaTargets.length > 0);
  ok(docx.xml.includes('w:num="2"'), 'Word 문제지 2단 누락');

  const cells = await xlsxPlainText(output.xlsx);
  deepStrictEqual(Object.keys(cells), ['문제', '정답표', '해설']);
  const width = Math.max(0, ...snapshot.items.map((item) => item.choices.length));
  deepStrictEqual(cells['문제'][0], ['번호', '학습목표', '예문', '문제', ...Array.from('①②③④⑤⑥⑦⑧⑨⑩').slice(0, width), '정답']);
  for (const [index, item] of snapshot.items.entries()) {
    const answer = item.blank ? '—' : item.answerLabels.join(', ');
    deepStrictEqual(cells['문제'][index + 1], [String(item.number), item.objectiveCode ?? '미지정',
      item.blank ? '' : flatCellText(item.passage ?? []), item.blank ? '(비워 둔 번호)' : flatCellText(item.stem),
      ...Array.from({ length: width }, (_, choice) => item.choices[choice] ? flatCellText(item.choices[choice].content) : ''), answer], `Excel ${item.number}번 내용`);
    deepStrictEqual(cells['정답표'][index + 1], [String(item.number), item.blank ? '(비워 둔 번호)' : answer]);
    deepStrictEqual(cells['해설'][index + 1], [String(item.number), answer,
      item.blank ? '(비워 둔 번호)' : flatCellText(item.explanation), item.objectiveCode ?? '미지정']);
  }
  const workbook = await readXlsx(output.xlsx);
  let underline = 0;
  for (const sheet of workbook.worksheets) sheet.eachRow((row) => row.eachCell((cell) => {
    const value = cell.value;
    if (value && typeof value === 'object' && 'richText' in value) underline += value.richText.filter((run) => run.font?.underline).length;
  }));
  equal(underline, counts.underline, 'Excel 밑줄 수');
  equal(workbook.worksheets.reduce((total, sheet) => total + sheet.getImages().length, 0), counts.images, 'Excel 이미지 수');
  assertHtml(snapshot, output.html);
}
