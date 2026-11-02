const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Electron 시작 전 실패 보고서도 앱과 같은 표를 읽어야 새 화면을 빠뜨리지 않는다.
const filename = join(__dirname, '../src/app/shared/routes.ts');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filename,
});
const routeModule = new Module(filename, module);
routeModule._compile(compiled.outputText, filename);
module.exports = routeModule.exports.routeIds;
