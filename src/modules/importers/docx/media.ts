export function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(
      alphabet[(value >>> 18) & 63] +
        alphabet[(value >>> 12) & 63] +
        (i + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : '=') +
        (i + 2 < bytes.length ? alphabet[value & 63] : '='),
    );
  }
  return parts.join('');
}
export function mediaPath(target: string): string | undefined {
  const parts: string[] = target.startsWith('/') ? [] : ['word'];
  for (const part of target.split('/')) {
    if (part === '..') {
      if (!parts.length) return undefined;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  const path = parts.join('/');
  return path.startsWith('word/media/') ? path : undefined;
}
export interface Media {
  bytes: Uint8Array;
  mime: string;
}
