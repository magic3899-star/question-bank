import JSZip from 'jszip';

export const namespaces = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  v: 'urn:schemas-microsoft-com:vml',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
};
interface BuildContext { media: { id: string; path: string; bytes: Uint8Array }[] }
export interface DocxNode { render(context: BuildContext): string }
const node = (render: DocxNode['render']): DocxNode => ({ render });
const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const render = (nodes: DocxNode[], context: BuildContext): string => nodes.map((n) => n.render(context)).join('');
export function raw(xml: string): DocxNode { return node(() => xml); }
export interface RunStyle {
  underline?: boolean; bold?: boolean; italic?: boolean;
  superscript?: boolean; subscript?: boolean;
}
export function run(text: string, style: RunStyle = {}): DocxNode {
  const properties = [
    style.underline === undefined ? '' : `<w:u w:val="${style.underline ? 'single' : 'none'}"/>`,
    style.bold === undefined ? '' : `<w:b w:val="${style.bold ? '1' : '0'}"/>`,
    style.italic === undefined ? '' : `<w:i w:val="${style.italic ? '1' : 'false'}"/>`,
    style.superscript ? '<w:vertAlign w:val="superscript"/>' : '',
    style.subscript ? '<w:vertAlign w:val="subscript"/>' : '',
  ].join('');
  const content = text.split(/(\t|\n)/).map((part) => part === '\t' ? '<w:tab/>'
    : part === '\n' ? '<w:br/>' : `<w:t xml:space="preserve">${escape(part)}</w:t>`).join('');
  return raw(`<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}${content}</w:r>`);
}
export function p(content: string | DocxNode[], options: { autoNumber?: boolean; numId?: number; ilvl?: number } = {}): DocxNode {
  return node((context) => `<w:p>${options.autoNumber || options.numId !== undefined
    ? `<w:pPr><w:numPr><w:ilvl w:val="${options.ilvl ?? 0}"/><w:numId w:val="${options.numId ?? 1}"/></w:numPr></w:pPr>` : ''}${
    render(typeof content === 'string' ? [run(content)] : content, context)}</w:p>`);
}
export function emptyP(): DocxNode { return p(''); }
export function table(rows: DocxNode[][][]): DocxNode {
  return node((context) => `<w:tbl><w:tblPr/><w:tblGrid/>${rows.map((row) => `<w:tr>${
    row.map((cell) => `<w:tc><w:tcPr/>${render(cell, context)}<w:p/></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`);
}
export function textbox(content: DocxNode[], options: { shaded?: boolean } = {}): DocxNode {
  return node((context) => `<w:p><w:r><w:pict><v:rect style="width:120pt;height:40pt"><v:textbox><w:txbxContent>${
    options.shaded ? '<w:p><w:pPr><w:shd w:fill="DDDDDD"/></w:pPr></w:p>' : ''}${
    render(content, context)}</w:txbxContent></v:textbox></v:rect></w:pict></w:r></w:p>`);
}
export function alternateContent(content: DocxNode[]): DocxNode {
  return node((context) => `<mc:AlternateContent><mc:Choice Requires="v">${render(content, context)}
    </mc:Choice><mc:Fallback>${render(content, context)}</mc:Fallback></mc:AlternateContent>`);
}
export interface ImageOptions {
  bytes: Uint8Array; widthEmu?: number; heightEmu?: number; anchor?: boolean;
  legacy?: boolean; extension?: string;
}
export function imageRun(options: ImageOptions): DocxNode {
  return node((context) => {
    const number = context.media.length + 1;
    const id = `rId${number}`;
    context.media.push({ id, path: `media/image${number}.${options.extension ?? 'png'}`, bytes: options.bytes });
    if (options.legacy) return `<w:r><w:pict><v:shape><v:imagedata r:id="${id}"/></v:shape></w:pict></w:r>`;
    const mode = options.anchor ? 'anchor' : 'inline';
    return `<w:r><w:drawing><wp:${mode} distT="0" distB="0" distL="0" distR="0"${options.anchor
      ? ' simplePos="0" relativeHeight="0" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"' : ''}>
      ${options.anchor ? '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>' : ''}
      <wp:extent cx="${options.widthEmu ?? 952500}" cy="${options.heightEmu ?? 476250}"/>
      ${options.anchor ? '<wp:wrapNone/>' : ''}<wp:docPr id="${number}" name="가짜 이미지 ${number}"/>
      <a:graphic><a:graphicData uri="${namespaces.pic}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${number}" name="가짜 이미지"/><pic:cNvPicPr/></pic:nvPicPr>
      <pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
      </pic:pic></a:graphicData></a:graphic></wp:${mode}></w:drawing></w:r>`;
  });
}
export function image(options: ImageOptions): DocxNode { return p([imageRun(options)]); }

export interface NumberingLevelOptions { ilvl: number; numFmt: string; start?: number; lvlText?: string }
export interface NumberingOptions {
  abstracts: { abstractNumId: number; levels: NumberingLevelOptions[] }[];
  nums: { numId: number; abstractNumId: number; overrides?: {
    ilvl: number; startOverride?: number; level?: Omit<NumberingLevelOptions, 'ilvl'>;
  }[] }[];
}
export async function buildDocx(options: { body: DocxNode[]; numbering?: NumberingOptions | null }): Promise<Uint8Array> {
  const numbering: NumberingOptions | null = options.numbering === undefined ? {
    abstracts: [{ abstractNumId: 0, levels: [{ ilvl: 0, numFmt: 'decimal', start: 1, lvlText: '%1.' }] }],
    nums: [{ numId: 1, abstractNumId: 0 }],
  } satisfies NumberingOptions : options.numbering;
  const context: BuildContext = { media: [] };
  const body = render(options.body, context);
  const zip = new JSZip();
  const add = (name: string, data: string | Uint8Array): void => {
    zip.file(name, data, { date: new Date('2026-01-01T00:00:00Z'), createFolders: false });
  };
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  add('[Content_Types].xml', `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    ${[...new Set(context.media.map((item) => item.path.split('.').at(-1)!))].map((ext) =>
    `<Default Extension="${escape(ext)}" ContentType="image/${ext === 'jpg' ? 'jpeg' : escape(ext)}"/>`).join('')}
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    ${numbering ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : ''}</Types>`);
  add('_rels/.rels', `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="${namespaces.r}/officeDocument" Target="word/document.xml"/></Relationships>`);
  add('word/document.xml', `${xml}<w:document ${Object.entries(namespaces).map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`).join(' ')}><w:body>${body}<w:sectPr/></w:body></w:document>`);
  add('word/_rels/document.xml.rels', `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${numbering ? `<Relationship Id="numbering" Type="${namespaces.r}/numbering" Target="numbering.xml"/>` : ''}
    ${context.media.map((item) => `<Relationship Id="${item.id}" Type="${namespaces.r}/image" Target="${item.path}"/>`).join('')}</Relationships>`);
  if (numbering) {
    const levelXml = (level: NumberingLevelOptions): string => `<w:lvl w:ilvl="${level.ilvl}"><w:start w:val="${level.start ?? 1}"/><w:numFmt w:val="${escape(level.numFmt)}"/><w:lvlText w:val="${escape(level.lvlText ?? `%${level.ilvl + 1}`)}"/></w:lvl>`;
    add('word/numbering.xml', `${xml}<w:numbering xmlns:w="${namespaces.w}">${numbering.abstracts.map((abstract) =>
      `<w:abstractNum w:abstractNumId="${abstract.abstractNumId}">${abstract.levels.map(levelXml).join('')}</w:abstractNum>`).join('')}${
      numbering.nums.map((num) => `<w:num w:numId="${num.numId}"><w:abstractNumId w:val="${num.abstractNumId}"/>${
        (num.overrides ?? []).map((override) => `<w:lvlOverride w:ilvl="${override.ilvl}">${override.startOverride === undefined ? ''
          : `<w:startOverride w:val="${override.startOverride}"/>`}${override.level ? levelXml({ ilvl: override.ilvl, ...override.level }) : ''}</w:lvlOverride>`).join('')}</w:num>`).join('')}</w:numbering>`);
  }
  context.media.forEach((item) => add(`word/${item.path}`, item.bytes));
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}
