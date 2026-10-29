const { readFileSync } = require('node:fs');
const { registerHooks } = require('node:module');
const { resolve, sep } = require('node:path');
const { pathToFileURL } = require('node:url');

const packageDirectory = resolve(__dirname, 'node_modules/dependency-cruiser');
const packageUrl = pathToFileURL(`${packageDirectory}${sep}`);
const { imports } = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'));

// 현재 Windows/Node 환경에서 CJS의 패키지 내부 별칭 해석이 실패하므로 해당 패키지에만 보완한다.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('#') && context.parentURL?.startsWith(packageUrl.href)) {
      const target = imports[specifier] ?? imports['#*'].replace('*', specifier.slice(1));
      return { url: new URL(target, packageUrl).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

import(new URL('bin/dependency-cruise.mjs', packageUrl).href).catch((error) => {
  console.error('의존 검사 실행에 실패했습니다. Node 버전과 설치된 dependency-cruiser를 확인하세요.', error);
  process.exitCode = 1;
});
