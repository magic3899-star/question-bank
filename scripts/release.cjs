// 새 버전을 GitHub Releases 에 올린다. 직원 PC 의 프로그램이 이 릴리스를 보고 스스로 업데이트한다.
// 사용: package.json 의 version 을 올리고 커밋·푸시한 뒤 `npm run release`
const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;
const shell = process.platform === 'win32';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell, ...options });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

function stop(message) {
  console.error(`중단: ${message}`);
  process.exit(1);
}

if (run('git', ['status', '--porcelain']).out) {
  stop('커밋하지 않은 변경이 있습니다. 먼저 커밋하고 푸시하세요.');
}
run('git', ['fetch', 'origin']);
const local = run('git', ['rev-parse', 'HEAD']).out;
const remote = run('git', ['rev-parse', 'origin/main']).out;
if (local !== remote) {
  stop('GitHub 의 main 과 내 코드가 다릅니다. 먼저 `git push` 하세요.');
}
if (run('gh', ['release', 'view', tag]).ok) {
  stop(`${tag} 릴리스가 이미 있습니다. package.json 의 version 을 올리세요.`);
}
const visibility = run('gh', ['repo', 'view', '--json', 'visibility', '--jq', '.visibility']).out;
if (visibility !== 'PUBLIC') {
  console.warn(
    `주의: 저장소가 ${visibility || '확인 불가'} 상태라 직원 PC 가 업데이트를 받지 못합니다. 공개로 바꾸세요.`,
  );
}

console.log(`${tag} 설치 파일을 만듭니다…`);
const built = spawnSync('npm', ['run', 'dist'], { cwd: root, stdio: 'inherit', shell });
if (built.status !== 0) stop('설치 파일을 만들지 못했습니다.');

const files = [
  `QuestionBank-Setup-${version}.exe`,
  `QuestionBank-Setup-${version}.exe.blockmap`,
  'latest.yml',
].map((name) => join(root, 'release', name));
const missing = files.filter((file) => !existsSync(file));
if (missing.length) stop(`올릴 파일이 없습니다: ${missing.join(', ')}`);

console.log(`${tag} 릴리스를 올립니다…`);
const released = spawnSync(
  'gh',
  [
    'release',
    'create',
    tag,
    ...files,
    '--title',
    `문제은행 ${version}`,
    '--generate-notes',
    '--target',
    'main',
  ],
  { cwd: root, stdio: 'inherit', shell },
);
if (released.status !== 0) stop('릴리스를 올리지 못했습니다.');
console.log(`완료: ${tag}. 직원 PC 는 프로그램을 켜면 새 버전을 받아 다음 종료 때 설치합니다.`);
