import type { Plugin, PluginRegistry } from '../../contracts/index';

export function createRegistry(): PluginRegistry {
  const plugins: Plugin[] = [];
  function all<K extends Plugin['kind']>(kind: K): Extract<Plugin, { kind: K }>[] {
    return plugins.filter((plugin): plugin is Extract<Plugin, { kind: K }> => plugin.kind === kind);
  }
  return {
    register(plugin) {
      if (plugins.some((existing) => existing.kind === plugin.kind && existing.id === plugin.id)) {
        throw new Error(`플러그인 ${plugin.kind}/${plugin.id}가 이미 등록되어 있습니다. 같은 종류 안에서 다른 ID를 사용하세요.`);
      }
      plugins.push(plugin);
    },
    all,
    get: (kind, id) => all(kind).find((plugin) => plugin.id === id),
  };
}
