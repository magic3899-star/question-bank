import { open } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import { importerExtensions } from '../../../modules/importers/index';
const MAX_BYTES = 50 * 1024 * 1024;
export async function readImportFile(path: unknown): Promise<{ fileName: string; data: Uint8Array }> {
  if (typeof path !== 'string' || !isAbsolute(path) || path.startsWith('\\\\') || path.includes('\0'))
    throw new Error('파일 경로가 올바르지 않습니다. 이 PC의 문서 파일을 다시 선택하세요.');
  const extension = extname(path).toLowerCase();
  if (!importerExtensions.includes(extension))
    throw new Error(
      extension === '.doc' || extension === '.hwp'
        ? `${extension} 파일은 읽을 수 없습니다. Word/한글에서 .docx 또는 .hwpx 로 다시 저장한 뒤 가져오세요.`
        : `지원하지 않는 확장자(${extension || '없음'})입니다. Word(.docx)·PDF·한글(.hwpx)·텍스트(.txt) 등의 문서를 선택하세요.`,
    );
  let handle;
  try {
    handle = await open(path, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('파일이 아닙니다. 문서 파일을 선택하세요.');
    if (stat.size > MAX_BYTES) throw new Error('파일이 50MB를 넘습니다. 문서를 나눈 뒤 다시 가져오세요.');
    const data = await handle.readFile();
    if (data.byteLength > MAX_BYTES)
      throw new Error('파일이 50MB를 넘습니다. 문서를 나눈 뒤 다시 가져오세요.');
    return { fileName: basename(path), data };
  } catch (cause) {
    if (cause instanceof Error && /[가-힣]/u.test(cause.message)) throw cause;
    throw new Error('파일이 없거나 읽을 수 없습니다. 경로와 접근 권한을 확인한 뒤 다시 선택하세요.');
  } finally {
    await handle?.close();
  }
}
