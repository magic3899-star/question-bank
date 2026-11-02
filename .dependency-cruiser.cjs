const { existsSync, readdirSync } = require('node:fs');
const escapeRegex = (path) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const modules = [
  ['src/contracts', []],
  ['src/core/registry', ['contracts']],
  ['src/modules/content-model', ['contracts']],
  ['src/modules/rng', ['contracts']],
  ['src/modules/storage', ['contracts', 'content-model']],
  ['src/modules/objective-code', ['contracts']],
  ['src/modules/rules', ['contracts', 'objective-code']],
  ['src/modules/selector', ['contracts', 'content-model', 'objective-code', 'rng']],
  ['src/modules/exam-snapshot', ['contracts', 'content-model']],
  ['src/modules/generation', ['contracts', 'exam-snapshot', 'content-model', 'rng']],
  ['src/modules/render-html', ['contracts', 'content-model']],
  ['src/modules/history', ['contracts']],
  ['src/modules/backup', ['contracts']],
  ['src/modules/updater', []],
];
const plugins = {
  importers: ['contracts', 'content-model'],
  validators: ['contracts', 'content-model'],
  constraints: ['contracts', 'content-model', 'objective-code'],
  shuffler: ['contracts', 'rng'],
  exporters: ['contracts', 'content-model', 'render-html'],
};
for (const [family, allowed] of Object.entries(plugins)) {
  const parent = `src/modules/${family}`;
  if (existsSync(parent)) {
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) modules.push([`${parent}/${entry.name}`, allowed]);
    }
  }
}
const publicPath = (name) =>
  name === 'contracts' ? 'src/contracts/index\\.ts$' : `src/modules/${name}/index\\.ts$`;

module.exports = {
  forbidden: [
    ...[
      ['shared', '^src/contracts/index\\.ts$'],
      ['preload', '^(?:src/app/shared/api\\.ts$|electron$|node_modules/electron/)'],
      [
        'renderer',
        '^(?:src/app/shared/api\\.ts$|src/contracts/index\\.ts$|src/modules/(?:content-model|render-html|objective-code)/index\\.ts$|node_modules/(?:react|react-dom|lucide-react|pretendard)/|.*\\.(?:css|woff2)$)',
      ],
    ].map(([layer, allowed]) => ({
      name: `app-${layer}-boundary`,
      severity: 'error',
      comment: '앱 계층에서 허용한 브라우저 모듈·IPC 계약만 import 하세요.',
      from: { path: `^src/app/${layer}/`, pathNot: '\\.test\\.ts$' },
      to: { pathNot: `(?:^src/app/${layer}/|${allowed})` },
    })),
    {
      name: 'renderer-no-node',
      severity: 'error',
      from: { path: '^src/app/renderer/' },
      to: { dependencyTypes: ['core'], path: '.*' },
    },
    {
      name: 'exporters-runtime-dependencies',
      severity: 'error',
      comment: '출력기는 docx/exceljs 외의 외부 모듈이나 파일·네트워크 API를 import 하지 마세요.',
      from: { path: '^src/modules/exporters/', pathNot: '\\.test\\.ts$' },
      to: { pathNot: '^(?:src/|node_modules/(?:docx|exceljs)/)' },
    },
    ...Object.entries(plugins).map(([family, allowed]) => ({
      name: `aggregate-${family}`,
      severity: 'error',
      comment: '집계 파일에서는 같은 계층 플러그인의 공개 index.ts만 참조하세요.',
      from: { path: `^src/modules/${family}/[^/]+\\.ts$`, pathNot: '\\.test\\.ts$' },
      to: {
        path: '^src/',
        pathNot: `^(?:src/modules/${family}/[^/]+/index\\.ts$|${allowed.map(publicPath).join('|')})`,
      },
    })),
    {
      name: 'no-unresolved',
      severity: 'error',
      comment: '찾을 수 없는 import 경로를 올바른 공개 index.ts 경로로 고치세요.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'contracts-no-imports',
      severity: 'error',
      comment: 'contracts는 import 없이 타입과 상수만 정의하세요.',
      from: { path: '^src/contracts/', pathNot: '\\.test\\.ts$' },
      to: {},
    },
    {
      name: 'updater-no-imports',
      severity: 'error',
      comment: 'updater는 아키텍처 §3에 따라 import 없이 구현하세요.',
      from: { path: '^src/modules/updater/', pathNot: '\\.test\\.ts$' },
      to: {},
    },
    // 테스트는 공개 진입점으로 실제 플러그인을 조립해 통합 동작을 검증한다.
    ...modules.map(([root, allowed]) => ({
      name: `boundary-${root.replaceAll('/', '-')}`,
      severity: 'error',
      comment: '아키텍처 §3에서 허용한 모듈의 공개 index.ts만 import 하세요.',
      from: { path: `^${escapeRegex(root)}/`, pathNot: '\\.test\\.ts$' },
      to: {
        path: '^src/',
        pathNot: `^(?:${escapeRegex(root)}/|${allowed.map(publicPath).join('|') || '(?!)'})`,
      },
    })),
    {
      name: 'production-no-test-imports',
      severity: 'error',
      comment: '운영 코드에서는 테스트 코드와 가짜 데이터를 import 하지 마세요.',
      from: { path: '^src/', pathNot: '\\.test\\.ts$' },
      to: { path: '(^tests/|\\.test\\.ts$)' },
    },
    {
      name: 'exporters-no-storage',
      severity: 'error',
      comment: '출력기는 저장소 대신 전달받은 확정본을 사용하세요.',
      from: { path: '^src/modules/exporters/' },
      to: { path: '^src/modules/storage/' },
    },
    ...modules.map(([root]) => ({
      name: `public-entry-${root.replaceAll('/', '-')}`,
      severity: 'error',
      comment: '다른 모듈의 내부 파일 대신 공개 index.ts를 import 하세요.',
      from: { pathNot: `^${escapeRegex(root)}/` },
      to: { path: `^${escapeRegex(root)}/`, pathNot: `^${escapeRegex(root)}/index\\.ts$` },
    })),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.json'] },
  },
};
