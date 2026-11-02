const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const routes = require('./route-ids.cjs');
if (!process.env.QB_CAPTURE_DIR || !process.env.QB_DATA_DIR) {
  console.error('QB_CAPTURE_DIR와 QB_DATA_DIR를 지정하세요. 가짜 데이터 전용 임시 폴더를 사용하세요.');
  process.exitCode = 1;
} else {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  mkdirSync(process.env.QB_CAPTURE_DIR, { recursive: true });
  const reportFile = join(process.env.QB_CAPTURE_DIR, 'capture-report.json');
  writeFileSync(reportFile, '[]', 'utf8');
  const result = spawnSync(require('electron'), ['.'], { stdio: 'inherit', env: environment });
  if (result.error) console.error('캡처 앱을 실행하지 못했습니다.', result.error.message);
  const incomplete = !existsSync(reportFile) || readFileSync(reportFile, 'utf8') === '[]';
  if (incomplete) {
    const error = `Electron 실행에 실패했습니다(종료 코드 ${result.status ?? result.signal ?? '없음'}). 콘솔의 원인과 Windows 실행 폴더 권한을 확인하세요.`;
    const report = ['light', 'dark'].flatMap((theme) =>
      ['1360x840', '1100x700'].flatMap((size) =>
        routes.map((route) => ({ route, file: `${route}-${theme}-${size}.png`, waitMs: 0, error })),
      ),
    );
    writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  }
  process.exitCode = incomplete ? 1 : (result.status ?? 1);
}
