import JSZip from 'jszip';
import type { ImportDraft, Importer } from '../../../contracts/index';
import { parseLayout, standardProfile, validateProfile } from '../../layout-parser/index';
import type { LayoutProfile } from '../../layout-parser/index';
import { children, first, is, ns, parseXml } from './xml';
import { mediaPath } from './media';
import type { Media } from './media';
import { readNumbering } from './numbering';
import type { NumberingLevel } from './numbering';
import { BlockReader } from './reader';
export { standardProfile, validateProfile } from '../../layout-parser/index';
export type { LayoutProfile } from '../../layout-parser/index';
export const docxImporter: Importer = {
  kind: 'importer',
  id: 'docx',
  label: 'Word 문서',
  extensions: ['.docx'],
  async parse(input, options): Promise<ImportDraft> {
    const empty = (): ImportDraft => ({ questions: [], passageGroups: [], assets: [], diagnostics: [] });
    const draft = empty();
    const subject = typeof options?.subject === 'string' ? options.subject.trim() : '';
    if (!subject) {
      draft.diagnostics.push({
        severity: 'error',
        code: 'SUBJECT_REQUIRED',
        message: '가져올 과목이 없습니다. 과목을 선택한 뒤 Word 문서를 다시 가져오세요.',
        ref: {},
      });
      return draft;
    }
    const profile: LayoutProfile = (options?.profile ?? standardProfile) as LayoutProfile;
    const errors = validateProfile(profile);
    if (errors.length) {
      draft.diagnostics.push({
        severity: 'error',
        code: 'DOCX_INVALID',
        message: `문서 양식 설정이 올바르지 않습니다. ${errors.join(' ')}`,
        ref: {},
      });
      return draft;
    }
    try {
      const zip = await JSZip.loadAsync(input.data);
      const documentFile = zip.file('word/document.xml');
      if (!documentFile) throw new Error('word/document.xml이 없습니다.');
      const root = parseXml(await documentFile.async('string'));
      if (!is(root, ns.w, 'document')) throw new Error('Word 문서 루트가 없습니다.');
      const body = first(root, ns.w, 'body');
      if (!body) throw new Error('Word 본문이 없습니다.');
      const media = new Map<string, Media>();
      const rels = zip.file('word/_rels/document.xml.rels');
      if (rels) {
        const relations = children(parseXml(await rels.async('string')));
        await Promise.all(
          relations.map(async (relation) => {
            if (
              relation.getAttribute('TargetMode') === 'External' ||
              !relation.getAttribute('Type')?.endsWith('/image')
            )
              return;
            const path = mediaPath(relation.getAttribute('Target') ?? '');
            const file = path ? zip.file(path) : null;
            if (!file || !path) return;
            const ext = path.split('.').at(-1)?.toLowerCase() ?? '';
            const mimes: Record<string, string> = {
              png: 'image/png',
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              gif: 'image/gif',
              bmp: 'image/bmp',
              tif: 'image/tiff',
              tiff: 'image/tiff',
              svg: 'image/svg+xml',
              emf: 'image/emf',
              wmf: 'image/wmf',
              webp: 'image/webp',
            };
            media.set(relation.getAttribute('Id') ?? '', {
              bytes: await file.async('uint8array'),
              mime: mimes[ext] ?? 'application/octet-stream',
            });
          }),
        );
      }
      const numberingFile = zip.file('word/numbering.xml');
      const numbering = numberingFile
        ? readNumbering(parseXml(await numberingFile.async('string')))
        : new Map<string, Map<string, NumberingLevel>>();
      const reader = new BlockReader(media, numbering);
      const blocks = reader.container(body).map((entry) => ({
        block: entry.block,
        text: entry.text,
        sourceIndex: entry.position,
        kind: entry.boundary
          ? ('paragraph' as const)
          : entry.block.type === 'paragraph'
            ? ('box' as const)
            : entry.block.type,
        autoNumber: entry.autoNumber,
      }));
      const parsed = parseLayout(
        blocks,
        profile,
        { ...options, subject, sourceFile: input.fileName },
        reader.diagnostics,
      );
      draft.questions = parsed.questions;
      draft.diagnostics = parsed.diagnostics;
      draft.assets = [...reader.assets.values()].filter((asset) => parsed.usedAssetIds.includes(asset.id));
      return draft;
    } catch {
      const invalid = empty();
      invalid.diagnostics.push({
        severity: 'error',
        code: 'DOCX_INVALID',
        message: `${input.fileName}: Word 문서 ZIP 또는 XML 구조를 읽을 수 없습니다. Word에서 .docx 형식으로 다시 저장한 뒤 가져오세요.`,
        ref: {},
      });
      return invalid;
    }
  },
};
