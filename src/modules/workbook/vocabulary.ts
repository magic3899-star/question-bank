export interface Vocabulary {
  token: ReadonlyMap<string, number>;
  pair: ReadonlyMap<string, number>;
}

export function normalizeToken(token: string): string {
  return token.replace(/^[,.:;?!()[\]「」'"•·・‘’“”…]+|[,.:;?!()[\]「」'"•·・‘’“”…]+$/gu, '');
}

export function buildVocabulary(allLines: readonly string[]): Vocabulary {
  const token = new Map<string, number>();
  const pair = new Map<string, number>();
  const increment = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const line of allLines) {
    const interior = line.trim().split(/\s+/u).map(normalizeToken).filter(Boolean).slice(1, -1);
    for (let index = 0; index < interior.length; index++) {
      const current = interior[index];
      if (current) increment(token, current);
      if (current && interior[index + 1]) increment(pair, `${current} ${interior[index + 1]}`);
    }
  }
  return { token, pair };
}
