import { expect, it } from 'vitest';
import { createExporters } from './index';

it('Word/Excel은 항상, PDF는 렌더러를 주입한 경우에만 등록한다', () => {
  expect(createExporters().map((exporter) => exporter.id)).toEqual(['docx', 'xlsx']);
  expect(createExporters({ renderPdf: async () => new Uint8Array() }).map((exporter) => exporter.id)).toEqual(
    ['docx', 'xlsx', 'pdf'],
  );
});
