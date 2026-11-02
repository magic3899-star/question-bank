import type { AssetData, Block, Question } from '../../../contracts/index';
import { sha256Hex } from '../../../modules/content-model/index';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('입력 형식이 올바르지 않습니다. 내용을 다시 입력하세요.');
  return value as Record<string, unknown>;
}
export function blocks(value: unknown, depth = 0): asserts value is Block[] {
  if (!Array.isArray(value) || value.length > 1000 || depth > 12)
    throw new Error('내용 블록이 너무 크거나 형식이 잘못되었습니다. 문단과 표를 확인하세요.');
  for (const item of value) {
    const b = record(item);
    if (b.type === 'paragraph') {
      if (!Array.isArray(b.runs) || b.runs.length > 10000) throw new Error('문단 서식을 확인하세요.');
      for (const run of b.runs) {
        const r = record(run);
        if (typeof r.text !== 'string' || r.text.length > 1000000) throw new Error('문단 글자를 확인하세요.');
        for (const key of ['bold', 'italic', 'underline', 'superscript', 'subscript'])
          if (r[key] !== undefined && typeof r[key] !== 'boolean') throw new Error('글자 서식을 확인하세요.');
      }
    } else if (b.type === 'table') {
      if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 100)
        throw new Error('표 행은 1~100개로 입력하세요.');
      const width = Array.isArray(b.rows[0]) ? b.rows[0].length : 0;
      if (!width || width > 30) throw new Error('표 열은 1~30개로 입력하세요.');
      for (const row of b.rows) {
        if (!Array.isArray(row) || row.length !== width) throw new Error('표의 열 수를 맞추세요.');
        for (const cell of row) blocks(cell, depth + 1);
      }
    } else if (b.type === 'image') {
      if (typeof b.assetId !== 'string' || !b.assetId) throw new Error('이미지를 다시 추가하세요.');
      if (b.alt !== undefined && typeof b.alt !== 'string') throw new Error('이미지 설명을 확인하세요.');
      for (const key of ['widthPx', 'heightPx'])
        if (b[key] !== undefined && (typeof b[key] !== 'number' || !Number.isFinite(b[key]) || b[key] <= 0))
          throw new Error('이미지 크기는 양수로 입력하세요.');
    } else throw new Error('지원하지 않는 내용 블록입니다. 문단·표·이미지로 바꾸세요.');
  }
}
export function questionInput(value: unknown): Question {
  const q = record(value);
  for (const key of ['id', 'subject', 'type', 'createdAt', 'updatedAt'])
    if (typeof q[key] !== 'string' || (q[key] as string).length > 1000)
      throw new Error('문제 기본 정보를 확인하세요.');
  if (!q.subject || q.type !== 'mcq' || q.schemaVersion !== 1)
    throw new Error('과목과 객관식 문제 형식을 확인하세요.');
  if (q.shufflePolicy !== 'free' && q.shufflePolicy !== 'lock-all')
    throw new Error('선지 섞기 정책을 선택하세요.');
  for (const key of ['objectiveCode', 'grade', 'sourceTag', 'passageGroupId'])
    if (q[key] !== undefined && (typeof q[key] !== 'string' || (q[key] as string).length > 1000))
      throw new Error('문제 기본 정보를 확인하세요.');
  blocks(q.stem);
  blocks(q.explanation);
  if (q.passage !== undefined) blocks(q.passage);
  if (!Array.isArray(q.choices) || q.choices.length > 10) throw new Error('선지는 2~10개로 입력하세요.');
  for (const choice of q.choices) {
    const c = record(choice);
    if (
      typeof c.id !== 'string' ||
      !c.id ||
      (c.fixedPosition !== undefined && typeof c.fixedPosition !== 'boolean')
    )
      throw new Error('선지 ID와 위치 고정을 확인하세요.');
    blocks(c.content);
  }
  for (const key of ['answerChoiceIds', 'tags'])
    if (!Array.isArray(q[key]) || (q[key] as unknown[]).some((item) => typeof item !== 'string'))
      throw new Error('정답과 태그 목록을 확인하세요.');
  record(q.extra);
  return structuredClone(value as Question);
}
export function imageAsset(value: unknown): AssetData {
  const input = record(value);
  if (!(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 10 * 1024 * 1024)
    throw new Error('이미지는 비어 있지 않은 10MB 이하 파일로 추가하세요.');
  const b = input.bytes;
  const head = Buffer.from(b.subarray(0, 16));
  const valid =
    (input.mime === 'image/png' &&
      head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (input.mime === 'image/jpeg' && b[0] === 255 && b[1] === 216 && b[2] === 255) ||
    (input.mime === 'image/gif' && /^GIF8[79]a/u.test(head.toString('ascii'))) ||
    (input.mime === 'image/webp' &&
      head.toString('ascii', 0, 4) === 'RIFF' &&
      head.toString('ascii', 8, 12) === 'WEBP') ||
    (input.mime === 'image/bmp' && head.toString('ascii', 0, 2) === 'BM');
  if (!valid)
    throw new Error('이미지 형식과 파일 내용이 맞지 않습니다. PNG·JPG·GIF·WebP·BMP 파일을 선택하세요.');
  const hash = sha256Hex(b);
  return {
    id: `asset-${hash}`,
    sha256: hash,
    mime: input.mime as string,
    dataBase64: Buffer.from(b).toString('base64'),
  };
}
