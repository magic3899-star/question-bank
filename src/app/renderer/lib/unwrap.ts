import type { Result } from '../../shared/index';
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  try {
    const result = await promise;
    if (!result.ok) throw new Error(result.message);
    return result.value;
  } catch (cause) {
    throw new Error(
      cause instanceof Error && /[가-힣]/u.test(cause.message)
        ? cause.message
        : '프로그램과 연결하지 못했습니다. 앱을 다시 실행하세요.',
    );
  }
}
