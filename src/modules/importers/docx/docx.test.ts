import JSZip from 'jszip';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { Block } from '../../../contracts/index';
import { blocksToPlainText, collectAssetIds } from '../../content-model/index';
import { alternateContent, buildDocx, emptyP, image, imageRun, p, raw, run, table, textbox } from '../../../../tests/fixtures/docxBuilder';
import type { DocxNode, NumberingOptions } from '../../../../tests/fixtures/docxBuilder';
import { docxImporter, standardProfile, validateProfile } from './index';

const markers = standardProfile.choiceMarkers;
const choices = (count = 5): DocxNode[] => Array.from({ length: count }, (_, i) => p(`${markers[i]} 가짜 선지 ${i + 1}`));
const record = (number = '1.', count = 5): DocxNode[] => [p(`${number} 가짜 문제?`), ...choices(count), emptyP(), p('정답: ④'), p('해설: 가짜 제목'), p('⦁ 가짜 설명'), p('법규 1-1-3 가짜 학습목표 (A)')];
const parse = async (body: DocxNode[], numbering?: NumberingOptions | null) => {
  // 등급 동작은 grade-filter.test.ts에서 검사하므로 기존 양식 회귀 검사는 모든 등급을 다룬다.
  const draft = await docxImporter.parse({ fileName: '가짜.docx', data: await buildDocx({ body, numbering }) }, { subject: 'dummy', includeGrades: null, requireObjective: false, dedupeByPassage: false });
  return draft;
};
const text = (blocks: Block[] | undefined): string => blocksToPlainText(blocks ?? []);
const circleNumbering = (numFmt = 'decimalEnclosedCircle'): NumberingOptions => ({
  abstracts: [{ abstractNumId: 3, levels: [{ ilvl: 0, numFmt, start: 1, lvlText: '%1' }] }],
  nums: [{ numId: 3, abstractNumId: 3 }],
});
const autoRecord = (number = 1, numId = 3, ilvl = 0): DocxNode[] => [p(`${number}. 가짜 자동 번호 문제`),
  ...Array.from({ length: 5 }, (_, i) => p(`가짜 자동 선지 ${i + 1}`, { numId, ilvl })), p('정답: ④'), p('해설: 가짜 자동 설명')];

describe('Word 가져오기', () => {
  it('기본 문제의 내용·정답·목표·출처·원본 위치를 보존한다', async () => {
    const draft = await parse([p('<2026-3-1>'), ...record()]);
    expect(draft.diagnostics).toEqual([]);
    expect(draft.questions).toHaveLength(1);
    const { question, sourceLocation } = draft.questions[0];
    expect(text(question.stem)).toBe('가짜 문제?');
    expect(question.choices.map((choice) => text(choice.content))).toEqual(Array.from({ length: 5 }, (_, i) => `가짜 선지 ${i + 1}`));
    expect(question.answerChoiceIds).toEqual(['c4']);
    expect(text(question.explanation)).toBe('가짜 제목\n⦁ 가짜 설명');
    expect(question).toMatchObject({ schemaVersion: 1, subject: 'dummy', type: 'mcq', objectiveCode: '법규 1-1-3', grade: 'A', tags: [], shufflePolicy: 'free', extra: { originalNumber: '1', objectiveText: '가짜 학습목표', sourceFile: '가짜.docx' } });
    expect(question.passage).toBeUndefined();
    expect(sourceLocation).toBe('가짜.docx · 2번째 문단 부근');
  });

  it('번호 자릿수·앞 탭·출처 변경과 출처 없음을 처리한다', async () => {
    const draft = await parse([...record('1.'), p('<2026-03-01>'), ...record('\t01.'), ...record('21.'), p('<2026-3-2>'), ...record('2.')]);
    expect(draft.questions.map(({ question }) => question.extra.originalNumber)).toEqual(['1', '01', '21', '2']);
    expect(draft.questions.map(({ question }) => question.sourceTag)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it.each([
    ['법규 1-1-3 가짜 목표를 열거할 수 있다. (A)', '법규 1-1-3', '가짜 목표를 열거할 수 있다.', 'A'],
    ['법규 1-3-14. 가짜 목표를 열거할 수 있다. (A)', '법규 1-3-14', '가짜 목표를 열거할 수 있다.', 'A'],
    ['법규 2-1-8(A)', '법규 2-1-8', '', 'A'],
    ['법규 3-1-5 (A) \t', '법규 3-1-5', '', 'A'],
    ['법규 3-3-8. (A)', '법규 3-3-8', '', 'A'],
    ['법규 3-4-3 B항', '법규 3-4-3', '', 'B'],
    ['해부 2-2-15 A항 ', '해부 2-2-15', '', 'A'],
    ['법규 2-1-5 가짜 목표를 설명할 수 있다.', '법규 2-1-5', '가짜 목표를 설명할 수 있다.', undefined],
    ['해부 14-1-3 (B)', '해부 14-1-3', '', 'B'],
    [' \t해부14-1-3', '해부 14-1-3', '', undefined],
  ])('학습목표의 문장·등급 생략과 접미사를 처리한다: %s', async (line, code, objectiveText, grade) => {
    const draft = await parse([p('1. 가짜 문제'), ...choices(), p('정답: ①'), p('해설: 가짜 설명'), p(line!)]);
    expect(draft.diagnostics).toEqual([]);
    expect(draft.questions[0].question).toMatchObject({ objectiveCode: code, grade, extra: { objectiveText } });
    expect(text(draft.questions[0].question.explanation)).toBe('가짜 설명');
  });

  it.each(['법규 규정에 따라 가짜 내용을 설명한다.', '⦁법규 1-1-3 참고', '⦁ 법규 1-1-3 참고',
    '가나다라마바사아자차카 1-1-3 참고', 'law 1-1-3 참고'])('일반 해설을 학습목표로 오인하지 않는다: %s', async (line) => {
    const draft = await parse([p('1. 가짜 문제'), ...choices(), p('해설: 가짜 설명'), p(line), p('가짜 해설 끝')]);
    expect(draft.questions[0].question.objectiveCode).toBeUndefined();
    expect(text(draft.questions[0].question.explanation)).toBe(`가짜 설명\n${line}\n가짜 해설 끝`);
  });

  it.each(['decimalEnclosedCircle', 'decimalEnclosedCircleChinese', 'decimalEnclosedFcircle'])('자동 원문자 선지를 복원한다: %s', async (numFmt) => {
    const draft = await parse(autoRecord(), circleNumbering(numFmt));
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0].question.choices.map((choice) => text(choice.content))).toEqual(
      Array.from({ length: 5 }, (_, i) => `가짜 자동 선지 ${i + 1}`));
    expect(draft.questions[0].question.answerChoiceIds).toEqual(['c4']);
    expect(draft.diagnostics).toEqual([expect.objectContaining({ code: 'AUTO_NUMBERING_RESTORED', severity: 'info', ref: { draftIndex: 0 } })]);
    expect(draft.diagnostics[0].message).toContain('2번째 문단');
    expect(draft.diagnostics[0].message).toContain('①(1)');
    expect(draft.diagnostics[0].message).toContain('⑤(5)');
  });

  it('두 문제가 공유하는 numId의 ⑥~⑩도 문제 안에서 c1~c5로 복원한다', async () => {
    const draft = await parse([...autoRecord(), ...autoRecord(2)], circleNumbering());
    expect(draft.questions).toHaveLength(2);
    for (const { question } of draft.questions) {
      expect(question.choices.map((choice) => choice.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
      expect(question.choices.map((choice) => text(choice.content))).toEqual(Array.from({ length: 5 }, (_, i) => `가짜 자동 선지 ${i + 1}`));
      expect(question.answerChoiceIds).toEqual(['c4']);
    }
    expect(draft.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['AUTO_NUMBERING_RESTORED', 'AUTO_NUMBERING_RESTORED']);
    expect(draft.diagnostics[1].ref?.draftIndex).toBe(1);
    expect(draft.diagnostics[1].message).toContain('⑥(6)');
    expect(draft.diagnostics[1].message).toContain('⑩(10)');
  });

  it('numId·ilvl별 시작값과 lvlOverride·startOverride를 적용하고 카운터를 분리한다', async () => {
    const numbering: NumberingOptions = {
      abstracts: [{ abstractNumId: 8, levels: [
        { ilvl: 0, numFmt: 'decimalEnclosedCircle', start: 3, lvlText: '%1' },
        { ilvl: 1, numFmt: 'decimal', start: 20, lvlText: '%2.' },
      ] }],
      nums: [{ numId: 3, abstractNumId: 8 }, { numId: 9, abstractNumId: 8, overrides: [
        { ilvl: 0, startOverride: 1 },
        { ilvl: 1, level: { numFmt: 'decimalEnclosedFcircle', start: 10, lvlText: '원%2' }, startOverride: 6 },
      ] }],
    };
    const draft = await parse([...autoRecord(1, 3), ...autoRecord(2, 9), ...autoRecord(3, 9, 1), ...autoRecord(4, 3)], numbering);
    expect(draft.questions.map(({ question }) => question.choices.length)).toEqual([5, 5, 5, 5]);
    expect(draft.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(Array(4).fill('AUTO_NUMBERING_RESTORED'));
    for (const [index, label] of ['③(3)', '①(1)', '원⑥(6)', '⑧(8)'].entries()) expect(draft.diagnostics[index].message).toContain(label);
  });

  it.each(['decimal', 'missing', 'unknownId'])('지원하지 않거나 누락된 자동 번호는 안전하게 경고한다: %s', async (mode) => {
    const numbering = mode === 'missing' ? null : circleNumbering('decimal');
    const draft = await parse(autoRecord(1, mode === 'unknownId' ? 99 : 3), numbering);
    expect(draft.questions).toHaveLength(0);
    expect(draft.diagnostics.filter((diagnostic) => diagnostic.code === 'AUTO_NUMBERING_IGNORED')).toHaveLength(5);
    expect(draft.diagnostics.some((diagnostic) => diagnostic.code === 'AUTO_NUMBERING_RESTORED' || diagnostic.code === 'DOCX_INVALID')).toBe(false);
  });

  it('닫는 괄호 없는 출처를 원문 그대로 보존하고 해설과 분리한다', async () => {
    const sourceTag = '\t<2026-01-26  ';
    const draft = await parse([p('1. 가짜 문제'), ...choices(), p('해설: 가짜 설명 끝'), p(sourceTag), ...record('2.')]);
    expect(draft.questions).toHaveLength(2);
    expect(text(draft.questions[0].question.explanation)).toBe('가짜 설명 끝');
    expect(draft.questions[1].question.sourceTag).toBeUndefined();
    expect(draft.diagnostics).toEqual([]);
  });

  it('첫 문제·태그 앞의 제목만 info로 묶고 중간의 버려진 연속 문단은 warn으로 묶는다', async () => {
    const draft = await parse([p('1-01. 가짜 과목'), p('1-02. 가짜 분야'), p('<2026-1-1>'),
      ...Array.from({ length: 5 }, (_, i) => p(`태그 뒤 가짜 버림 ${i + 1}`)), ...record(),
      ...Array.from({ length: 4 }, (_, i) => p(`문제 뒤 가짜 버림 ${i + 1}`)), ...record('2.'), p('마지막 가짜 버림')]);
    expect(draft.questions).toHaveLength(2);
    expect(draft.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.severity])).toEqual([
      ['PREAMBLE_IGNORED', 'info'], ['UNPARSED_BLOCKS', 'warn'], ['UNPARSED_BLOCKS', 'warn'], ['UNPARSED_BLOCKS', 'warn'],
    ]);
    expect(draft.diagnostics[0].message).toContain('1-01. 가짜 과목');
    expect(draft.diagnostics[0].message).toContain('1-02. 가짜 분야');
    expect(draft.diagnostics[1].message).toContain('외 2개 문단');
    expect(draft.diagnostics[2].message).toContain('외 1개 문단');
    expect(draft.diagnostics[3].message).toContain('마지막 가짜 버림');
  });

  it('보기의 앵커·인라인·레거시 이미지, 중첩 표, 음영 상자를 한 문제에 보존하고 자산을 중복 제거한다', async () => {
    const bytes = new Uint8Array([1, 3, 5, 7]);
    const draft = await parse([p('1. 가짜 그림 문제'),
      p([run('앞'), imageRun({ bytes, widthEmu: 952500, heightEmu: 476250, anchor: true }), run('뒤')]),
      image({ bytes }), image({ bytes, legacy: true }),
      table([[[p('첫 셀'), p('둘째 문단'), table([[[p('중첩 셀')]]])]]]),
      textbox([p('가짜 보기')], { shaded: true }), ...choices(), p('정답: ①'), p('해설: 가짜')]);
    const question = draft.questions[0].question;
    expect(text(question.passage)).toBe('앞\n[이미지]\n뒤\n[이미지]\n[이미지]\n첫 셀\n둘째 문단\n중첩 셀\n가짜 보기');
    expect(question.passage?.map((block) => block.type)).toEqual(['paragraph', 'image', 'paragraph', 'image', 'image', 'table', 'table']);
    expect(question.passage?.[1]).toMatchObject({ widthPx: 100, heightPx: 50 });
    expect(question.passage?.at(-1)).toMatchObject({ type: 'table', rows: [[[ { type: 'paragraph' } ]]] });
    expect(draft.assets).toHaveLength(1);
    expect(draft.assets[0]).toMatchObject({ mime: 'image/png', dataBase64: 'AQMFBw==' });
    expect(draft.assets[0].id).toBe(`asset-${draft.assets[0].sha256.slice(0, 16)}`);
    expect(collectAssetIds(question.passage ?? [])).toEqual([draft.assets[0].id]);
    expect(draft.diagnostics).toEqual([expect.objectContaining({ code: 'TEXTBOX_AS_TABLE', severity: 'info', ref: { draftIndex: 0 } })]);
  });

  it('선지에 이어지는 표·그림·문단과 해설의 표·그림을 보존한다', async () => {
    const bytes = new Uint8Array([8, 9]);
    const draft = await parse([p('1. 가짜 문제'), p('① 첫 선지'), table([[[p('선지 표')]]]), image({ bytes }), p('선지 연속'), p('② 둘째 선지'),
      p('정답: ①'), p('해설: 가짜 설명'), table([[[p('해설 표')]]]), image({ bytes })]);
    const q = draft.questions[0].question;
    expect(q.choices[0].content.map((b) => b.type)).toEqual(['paragraph', 'table', 'image', 'paragraph']);
    expect(q.explanation.map((b) => b.type)).toEqual(['paragraph', 'table', 'image']);
    expect(q.passage).toBeUndefined();
    expect(draft.assets).toHaveLength(1);
  });

  it('해설 번호 목록을 새 문제로 오인하지 않고 진짜 다음 문제와 목표 없는 문제를 구별한다', async () => {
    const draft = await parse([p('1. 첫 가짜 문제'), ...choices(), p('정답: ①'), p('해설: 가짜 해설'), p('1. 설명'), p('① 설명'), p('⦁ 부연'),
      p('2. 둘째 가짜 문제'), ...choices(), p('정답: ②'), p('해설: 둘째'),
      p('3. 셋째 가짜 문제'), ...choices(), p('정답: ③')]);
    expect(draft.questions).toHaveLength(3);
    expect(text(draft.questions[0].question.explanation)).toContain('1. 설명\n① 설명\n⦁ 부연');
    expect(draft.questions.every(({ question }) => question.objectiveCode === undefined)).toBe(true);
  });

  it('출처 태그와 문서 끝에서도 목표 없는 문제를 끝낸다', async () => {
    const draft = await parse([p('<2026-1-1>'), p('1. 가짜 문제'), ...choices(), p('정답: ②'), p('해설: 첫 설명'), p('<2026-1-2>'), p('2. 가짜 다음 문제'), ...choices(), p('정답: ①')]);
    expect(draft.questions).toHaveLength(2);
    expect(text(draft.questions[0].question.explanation)).toBe('첫 설명');
    expect(draft.questions[1].question.sourceTag).toBeUndefined();
  });

  it('번호가 붙은 보기는 passage로 유지하고, 해설 다음 정답 없는 문제도 파싱한다', async () => {
    const draft = await parse([p('1. 첫 가짜 문제'), p('1. 번호 붙은 보기'), ...choices(), p('정답: ①'), p('해설: 가짜'), p('1. 해설의 번호 문장'),
      p('2. 정답 없는 다음 문제'), ...choices(4)]);
    expect(draft.questions).toHaveLength(2);
    expect(text(draft.questions[0].question.stem)).toBe('첫 가짜 문제');
    expect(text(draft.questions[0].question.passage)).toBe('1. 번호 붙은 보기');
    expect(text(draft.questions[0].question.explanation)).toBe('가짜\n1. 해설의 번호 문장');
    expect(draft.questions[1].question.answerChoiceIds).toEqual([]);
    expect(draft.questions[1].question.choices).toHaveLength(4);
  });

  it('해설이 시작된 뒤의 정답·해설 라벨과 선지 표시를 원문 해설로 유지한다', async () => {
    const draft = await parse([p('1. 가짜 문제'), ...choices(), p('정답: ④'), p('해설: 첫 해설'), p('정답: ①'), p('해설: 라벨을 포함한 설명'), p('① 설명')]);
    expect(draft.questions[0].question.answerChoiceIds).toEqual(['c4']);
    expect(text(draft.questions[0].question.explanation)).toBe('첫 해설\n정답: ①\n해설: 라벨을 포함한 설명\n① 설명');
  });

  it.each(['①, ③', '①③', '4'])('복수/숫자 정답을 변환한다: %s', async (value) => {
    const draft = await parse([p('1. 가짜 문제'), ...choices(), p(`정답: ${value}`)]);
    expect(draft.questions[0].question.answerChoiceIds).toEqual(value === '4' ? ['c4'] : ['c1', 'c3']);
    expect(draft.diagnostics.map((d) => d.code)).toEqual(value === '4' ? ['ANSWER_FORMAT'] : []);
    if (value === '4') expect(draft.diagnostics[0].ref?.draftIndex).toBe(0);
  });

  it.each([4, 6])('정답 누락과 %i개 선지를 의미 판단 없이 보존한다', async (count) => {
    const draft = await parse([p('1. 가짜 문제'), ...choices(count), p('해설: 가짜')]);
    expect(draft.questions[0].question.choices).toHaveLength(count);
    expect(draft.questions[0].question.answerChoiceIds).toEqual([]);
    expect(draft.diagnostics).toEqual([]);
  });

  it('본문·선지·해설의 밑줄과 굵게 해제, 기울임, 첨자, 탭·줄바꿈을 보존한다', async () => {
    const draft = await parse([p([run('\t01. '), run('가짜 본문', { underline: true, bold: false, italic: true }), run(' 위', { superscript: true }), run(' 아래', { subscript: true })]),
      p([run('① '), run('가짜 선지', { underline: true }), run(' 일반', { underline: false })]), p('② 둘째'), p('정답: ①'),
      p([run('해설: '), run('가짜\t해설\n줄', { underline: true }), raw('<w:r><w:br w:type="page"/></w:r>')])]);
    const q = draft.questions[0].question;
    expect(q.stem[0]).toMatchObject({ runs: [{ text: '가짜 본문', underline: true, bold: false, italic: true }, { text: ' 위', superscript: true }, { text: ' 아래', subscript: true }] });
    expect(q.choices[0].content[0]).toMatchObject({ runs: [{ text: '가짜 선지', underline: true }, { text: ' 일반', underline: false }] });
    expect(text(q.explanation)).toBe('가짜\t해설\n줄');
    expect(q.explanation[0]).toMatchObject({ runs: expect.arrayContaining([expect.objectContaining({ text: '해설', underline: true })]) });
  });

  it('대체 내용은 Choice만 쓰고 수식·변경추적·래퍼·자동 번호를 처리한다', async () => {
    const draft = await parse([p('1. 가짜 문제'), alternateContent([textbox([p('보기 한 번')])]),
      p([raw('<m:oMath><m:r><m:t>x+1</m:t></m:r></m:oMath>'),
        raw('<w:ins><w:r><w:t>삽입</w:t></w:r></w:ins><w:del><w:r><w:delText>삭제</w:delText></w:r></w:del>'),
        raw('<w:sdt><w:sdtContent><w:r><w:t>구조</w:t></w:r></w:sdtContent></w:sdt>'),
        raw('<w:hyperlink><w:r><w:t>링크</w:t></w:r></w:hyperlink><w:fldSimple w:instr="코드"><w:r><w:t>필드</w:t></w:r></w:fldSimple><w:r><w:instrText>숨은코드</w:instrText></w:r>')]),
      p('자동 번호 가짜', { autoNumber: true }), ...choices(), p('정답: ①')]);
    const passage = text(draft.questions[0].question.passage);
    expect(passage).toBe('보기 한 번\nx+1삽입구조링크필드\n자동 번호 가짜');
    expect(draft.diagnostics.map((d) => d.code)).toEqual(['TEXTBOX_AS_TABLE', 'MATH_FLATTENED', 'AUTO_NUMBERING_IGNORED']);
    expect(draft.diagnostics.every((d) => d.ref?.draftIndex === 0)).toBe(true);
  });

  it('전각 공백 목표를 정규화하고 참조형 선지를 고정한다', async () => {
    const draft = await parse([p('1. 가짜 문제'), p('① 가짜'), p('② ①, ② 모두'), p('③ 해당 없음'), p('④ 위의 가짜'), p('⑤ 가짜 없음'), p('정답: ③'), p('법규　1　-　1-3 가짜 목표 (B)')]);
    const q = draft.questions[0].question;
    expect(q.objectiveCode).toBe('법규 1-1-3');
    expect(q.choices.map((c) => Boolean(c.fixedPosition))).toEqual([false, true, true, true, true]);
    expect(text(q.choices[1].content)).toBe('①, ② 모두');
  });

  it('문단 수준 수식도 버리지 않고 경고한다', async () => {
    const draft = await parse([p('1. 가짜 문제'), raw('<m:oMathPara><m:oMath><m:r><m:t>a=b</m:t></m:r></m:oMath></m:oMathPara>'), ...choices()]);
    expect(text(draft.questions[0].question.passage)).toBe('a=b');
    expect(draft.diagnostics[0].code).toBe('MATH_FLATTENED');
  });

  it('표·이미지·상자는 앞보기 개수에서 제외하고 텍스트 문단만 센다', async () => {
    const draft = await parse([p('1. 가짜 문제'), ...Array.from({ length: 8 }, () => table([[[p('가짜 셀')]]])), emptyP(), textbox([p('보기')]), ...choices()]);
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0].question.passage).toHaveLength(9);
    const tooFar = await parse([p('1. 가짜 문제'), ...Array.from({ length: 6 }, () => p('가짜 일반 문단')), ...choices()]);
    expect(tooFar.questions).toHaveLength(0);
    expect(tooFar.diagnostics[0]).toMatchObject({ code: 'PREAMBLE_IGNORED', severity: 'info' });
    expect(tooFar.diagnostics[0].message).toContain('1. 가짜 문제');
  });

  it('누락 이미지 관계를 경고하며 위치·출처·초안 인덱스를 연결한다', async () => {
    const draft = await parse([p('<2026-1-1>'), p('1. 가짜 문제'), raw('<w:p><w:r><w:drawing><a:blip r:embed="missing"/></w:drawing></w:r></w:p>'), ...choices()]);
    expect(draft.diagnostics).toEqual([expect.objectContaining({ code: 'IMAGE_NOT_FOUND', ref: { draftIndex: 0 } })]);
  });

  it('과목이 없으면 입력이 손상되어 있어도 본문을 읽지 않는다', async () => {
    const draft = await docxImporter.parse({ fileName: '가짜.docx', data: new Uint8Array() });
    expect(draft.questions).toEqual([]);
    expect(draft.diagnostics[0].code).toBe('SUBJECT_REQUIRED');
  });

  it('빈 바이트·잘못된 ZIP·본문 없는 ZIP·손상 XML을 예외 대신 진단으로 반환한다', async () => {
    const zip = new JSZip(); zip.file('dummy.txt', '가짜');
    const malformed = new JSZip(); malformed.file('word/document.xml', '<w:document>');
    for (const data of [new Uint8Array(), new TextEncoder().encode('가짜 비ZIP'), await zip.generateAsync({ type: 'uint8array' }), await malformed.generateAsync({ type: 'uint8array' })]) {
      const draft = await docxImporter.parse({ fileName: '가짜.docx', data }, { subject: 'dummy' });
      expect(draft.questions).toEqual([]);
      expect(draft.diagnostics[0]).toMatchObject({ code: 'DOCX_INVALID', severity: 'error' });
    }
  });

  it('JSON 프로파일로 번호·선지·정답·해설 라벨을 교체한다', async () => {
    const profile = JSON.parse(JSON.stringify({ ...standardProfile, id: 'other', label: '다른 가짜 양식', stemStartPattern: '^\\s*Q(\\d+)\\)\\s*', choiceMarkers: ['A)', 'B)'], answerLabelPattern: '^Answer:\\s*', explanationLabelPattern: '^Explain:\\s*' })) as unknown;
    expect(validateProfile(profile)).toEqual([]);
    const draft = await docxImporter.parse({ fileName: '가짜.docx', data: await buildDocx({ body: [p('Q3) 가짜 문제'), p('A) 가짜 하나'), p('B) 가짜 둘'), p('Answer: B)'), p('Explain: 가짜 해설')] }) }, { subject: 'dummy', profile, includeGrades: null, requireObjective: false });
    expect(text(draft.questions[0].question.stem)).toBe('가짜 문제');
    expect(text(draft.questions[0].question.choices[0].content)).toBe('가짜 하나');
    expect(draft.questions[0].question.answerChoiceIds).toEqual(['c2']);
    expect(validateProfile({ ...standardProfile, stemStartPattern: '(' })[0]).toContain('정규식');
    for (const invalid of [null, {}, { ...standardProfile, fixedChoicePatterns: ['['] }, { ...standardProfile, choiceMarkers: [] }, { ...standardProfile, stemLookaheadBlocks: 0 }]) expect(validateProfile(invalid).length).toBeGreaterThan(0);
    const invalid = await docxImporter.parse({ fileName: '가짜.docx', data: new Uint8Array() }, { subject: 'dummy', profile: {} });
    expect(invalid.diagnostics[0].code).toBe('DOCX_INVALID');
  });

  it('같은 입력을 두 번 가져오면 결과가 같다', async () => {
    const input = { fileName: '가짜.docx', data: await buildDocx({ body: [p('<2026-1-1>'), ...record()] }) };
    expect(await docxImporter.parse(input, { subject: 'dummy' })).toEqual(await docxImporter.parse(input, { subject: 'dummy' }));
  });

  it('1000개 가짜 문제의 파싱은 3초 이내다(빌더 시간 제외, 테스트 전체 제한 15초)', async () => {
    const input = { fileName: '가짜.docx', data: await buildDocx({ body: Array.from({ length: 1000 }, (_, i) => { const nodes = record(`${i + 1}.`); nodes[0] = p(`${i + 1}. ?? ?? ?? ${i}`); return nodes; }).flat() }) };
    const start = performance.now();
    const draft = await docxImporter.parse(input, { subject: 'dummy' });
    const elapsed = performance.now() - start;
    expect(draft.questions).toHaveLength(1000);
    expect(elapsed).toBeLessThan(3000);
    console.info(`가짜 DOCX 1000문제 파싱: ${Math.round(elapsed)}ms (기준 3000ms)`);
  }, 15000);
});
