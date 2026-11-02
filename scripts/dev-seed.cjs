const ts = require('typescript');
const fs = require('node:fs');
// Node 22에서 별도 실행 패키지 설치 없이 개발용 TypeScript만 변환한다.
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
require('./dev-seed.ts');
