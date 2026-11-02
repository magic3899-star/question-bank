# 5A단계 — Electron 앱 뼈대와 보기 화면

## 구현 범위

Electron main에서 기존 모듈을 조합한다. 홈·문제은행 보기·테마 설정을 연결했고 가져오기·문제 추가·시험 만들기·규칙·이력은 다음 단계 안내 화면이다. contracts는 변경하지 않았다.

| 위치 | 역할 |
|---|---|
| `src/app/shared/api.ts` | IPC 채널과 요청·응답 타입, `Result<T>` |
| `src/app/main/index.ts` | 단일 인스턴스, 수명주기, 보안 창, 서비스 조립 |
| `src/app/main/paths.ts` | 영문 데이터 경로, 변경 전 DB/WAL/SHM 백업 |
| `src/app/main/settings.ts` | 설정 검증·읽기·임시 파일을 통한 저장, 손상 원본 보존 |
| `src/app/main/services/` | 앱 정보·설정·문제은행 서비스 |
| `src/app/main/ipc.ts` | 기본 창의 주 프레임만 허용, 입력 검증, 한국어 오류 결과 |
| `src/app/main/capture.ts` | 화면 준비 대기, PNG와 캡처 보고서 저장 |
| `src/app/preload/index.ts` | `window.qb`의 지정 함수만 노출 |
| `src/app/renderer/` | React 앱 셸·페이지·공통 컴포넌트·디자인 토큰 |

## 실행

이미 설치된 패키지만 사용하며 Vite는 7.3.7이다. 추가 패키지 설치와 SQLite 재빌드를 하지 않는다. PowerShell에서 `npm.cmd`를 사용한다.

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run app
npm.cmd run capture
npm.cmd run dist
```

- `dev`: electron-vite 개발 서버와 앱. 엄격한 `script-src 'self'`를 지키기 위해 인라인 시작 스크립트가 필요한 React Fast Refresh는 끈다. renderer 변경 확인은 창 새로 고침 또는 재실행으로 한다.
- `build`: `out/main/index.js`, `out/preload/index.js`, `out/renderer/` 생성. main/preload에는 `externalizeDepsPlugin`을 적용한다. Pretendard 가변 WOFF2는 renderer 자산으로 번들한다.
- `app`: 빌드 결과를 electron-vite preview로 실행한다.
- `capture`: 빌드 결과를 실행한다. 아래 두 환경변수가 모두 필요하다. Node용 `ELECTRON_RUN_AS_NODE`는 캡처 자식 프로세스에서 제거한다.
- `dist`: build 후 Windows x64 NSIS를 생성한다. `--publish never`로 업로드하지 않는다.

루트 TypeScript 설정은 기존 모듈·테스트 설정을 유지하고 app을 제외한다. `tsconfig.web.json`은 DOM·React JSX, `tsconfig.node.json`은 main/preload·개발 스크립트·Electron Vite 설정을 검사한다. `typecheck`가 세 설정 모두 실행한다.

## 데이터와 설정

기본 위치는 `%APPDATA%/QuestionBank/`이며 `app.setPath('userData', ...)`도 같은 폴더로 지정한다. `QB_DATA_DIR`가 있으면 해당 폴더의 절대 경로를 사용한다.

```text
QuestionBank/
  data/bank.sqlite
  settings.json
  backups/pre-migrate-{from}-to-{to}-{시각}/
```

설정은 테마(`system|light|dark`), 과목 ID·이름 목록, 기본 저장 폴더, 마지막 정상 창 크기·위치를 보관한다. 기본 창 1360×840, 최소 1100×700이며 사라진 모니터의 위치는 복원하지 않는다. 손상되거나 검증에 실패한 설정은 `settings.json.corrupt-{시각}`으로 보존하고 기본값을 사용한다.

기존 DB에 데이터가 있고 변경이 필요한 경우에만 storage의 `beforeMigrate`에서 DB와 존재하는 `-wal`·`-shm`을 복사한다. main이 시각 함수를 주입한다. 백업 실패는 마이그레이션을 중단한다. DB 또는 설정 폴더를 열지 못하면 원인·권한 점검·백업 복원 안내와 데이터 폴더 열기 버튼을 표시한다. 복원 시 앱을 종료하고 원본을 보존한 뒤 동일 백업의 DB와 동반 파일을 함께 사용해야 한다.

## 화면과 서비스

- 홈: 과목별 문제 수, 학습목표 누락 주의 항목과 연결 필터, 최근 시험 빈 상태, 문제 0개 안내.
- 문제은행: 과목·목표 트리, 본문/해설 등을 포함하는 검색, 학습목표 누락 필터, 50개 단위 페이지, 자동 첫 문항 선택, 로딩·오류·빈 검색 결과.
- 목표 필터·트리는 `objective-code`를 사용한다. `법규 1`과 `법규 14`가 섞이지 않는다. 전체 일치 개수와 페이지 항목을 따로 반환한다.
- 목록에는 80 코드 포인트의 본문 미리보기, 등급, 지문·이미지 여부, 선지 수, 기존 단일 문제 검증기의 경고·오류 개수를 표시한다. 상세에는 해당 문제의 본문·지문·선지·해설에서 참조하는 자산만 전달한다.
- 상세는 `render-html.renderQuestionHtml`의 결과를 권한 없는 `sandbox=""` iframe의 `srcDoc`으로 표시한다. 출력의 블록 렌더러·서식·백지 스타일을 공유한다. 정답·해설·학습목표를 함께 표시하고 앱 다크 모드에서도 종이는 밝게 유지한다.
- 설정의 테마·데이터 폴더 표시와 열기가 동작한다. 테마 저장 토스트는 5초 표시하며 실행 취소를 제공한다.
- 접을 수 있는 220px 사이드바, 버전 안내, 우측 상세 패널 크기 조절을 제공한다. Ctrl+K 검색, Ctrl+N 문제 추가 안내, Ctrl+G 시험 만들기 안내, 토스트가 있을 때 Ctrl+Z 실행 취소를 지원한다. 검색 입력에서는 입력 자체의 실행 취소를 유지한다.
- DESIGN.md의 색·글꼴·간격·반경·모션을 `tokens.css`에 정의했다. 시스템/수동 다크, reduced motion, 키보드 포커스, 한국어 줄바꿈과 숫자 고정 폭을 적용했다.

## 보안과 의존 경계

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`를 고정한다. 새 창·페이지 탐색·리디렉션·webview와 권한 요청을 차단한다. renderer CSP는 다음과 같다.

```text
default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'self' data: about:; script-src 'self'
```

문항 iframe은 자체 CSP로 스크립트·외부 자원도 차단한다. IPC에는 채널 이름이나 ipcRenderer를 임의로 호출하는 기능이 없고 main은 요청한 창과 프레임을 확인한다. 의존 검사는 shared→contracts, preload→shared(및 Electron 브리지), renderer→shared/contracts/content-model/render-html/objective-code와 UI 패키지만 허용한다. main의 모듈 접근에도 기존 공개 index.ts 경계가 적용된다.

## 가짜 데이터와 캡처

새 임시 폴더에만 seed한다. 기존 DB가 있으면 덮어쓰지 않고 한국어 오류로 종료한다. 실제 문제 데이터와 금지 폴더는 사용하지 않는다.

```powershell
$env:QB_DATA_DIR = Join-Path $PWD '.tmp-stage5a/review-data'
$env:QB_CAPTURE_DIR = Join-Path $PWD '.tmp-stage5a/review-captures'
npm.cmd run seed -- "$env:QB_DATA_DIR"
npm.cmd run build
npm.cmd run capture
```

`scripts/dev-seed.ts <dataDir>`는 별도 런타임 설치 없이 `scripts/dev-seed.cjs`로 실행한다. `tests/fixtures/appBank.ts`가 만든 2과목·300문제(목표 누락 16개, 지문 포함 200개, 이미지 포함 60개)를 저장한다. 모두 코드로 만든 가짜 문항이다.

캡처는 홈/문제은행/가져오기/문제 추가/시험 만들기/출제 규칙/출제 이력/설정 순으로 방문하고 라이트·다크와 1360×840·1100×700의 조합 32개를 처리한다. `document.body.dataset.ready`는 라우트 이름이며 문제은행은 목록·트리·상세 iframe까지 준비된 뒤 설정한다. 준비 신호를 최대 10초 기다리고 글꼴·화면 갱신 이후 캡처한다. 캡처 테마는 일시적으로 강제하며 사용자 설정을 저장하지 않는다. 캡처 실행에서는 하드웨어 가속을 끈다.

PNG는 `{route}-{light|dark}-{1360x840|1100x700}.png`, 보고서는 `capture-report.json`이다. 각 항목은 `route`, `file`, `waitMs`, `error`를 갖는다. 준비 시간 초과·화면 오류·창 로드 실패를 기록하며 Electron이 main 실행 전에 종료해도 실행 스크립트가 실패 보고서를 남긴다. 오류가 있으면 종료 코드 1이다.

## 설치 파일

`electron-builder.yml`: appId `kr.publisher.questionbank`, 제품·바로 가기 이름 `문제은행`, 실행 파일 `QuestionBank.exe`, 설치 파일 `QuestionBank-Setup-${version}.exe`. 사용자별 설치, 설치 위치 선택, 바탕화면·시작 메뉴 바로 가기를 설정했다. `build/icon.ico`가 없는 현재는 Electron 기본 아이콘이다.

`npmRebuild: false`, `asar: true`, `asarUnpack: ['**/node_modules/better-sqlite3/**']`를 적용한다. 설치된 `node_modules/electron/dist`를 `electronDist`로 재사용한다. Windows x64 Node-API 바이너리가 `resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds/win32-x64.node`에 포함되는 것을 확인했다. GitHub publish 대상은 `magic3899-star/question-bank`로 설정만 했으며 업데이트·업로드 코드는 없다. 서명 인증서는 설정하지 않았다.

## Excel 높이 수정

Unicode 15.1의 할당된 W/F 문자와 원문자 범위를 두 칸, 나머지를 한 칸으로 계산한다. 한글·한자·전각 영문·원문자·보충 평면 문자와 좁은 라틴 문자를 검사한다. 줄 높이는 글꼴 10pt × 기존 줄간격 1.5 × 여유 1.25이며 명시적 줄바꿈·열 안쪽 여백·이미지 배치를 반영한다. 기존 Excel 최대 409pt 제한은 유지한다. 실제 Excel 글꼴 폭 측정이나 무제한 높이 자동 맞춤은 아니므로 매우 긴 문항은 Word/PDF 또는 수동 조절이 필요하다.

## 검증과 한계

최종 명령 결과는 아래 기록을 따른다. 테스트는 가짜 데이터만 사용한다. main 서비스의 통계·목록·800문제 페이지·목표 계층·자산·입력 오류, 설정 손상·쓰기 실패, DB/WAL/SHM 보존·실제 마이그레이션 백업 복구, IPC 창/프레임 경계, 캡처 32개 조합·시간 초과·시작 실패와 HTML 미리보기를 검사한다.

| 명령 | 최종 결과 |
|---|---|
| `npm.cmd run test:fast` | 통과, 48개 파일·368개 테스트, 종료 코드 0 |
| `npm.cmd test` | 통과, 51개 파일·418개 테스트, 87.59초, 종료 코드 0 |
| `npm.cmd run typecheck` | 루트·web·node 설정 모두 통과, 종료 코드 0 |
| `npm.cmd run lint:deps` | 통과, 132개 모듈·405개 의존, 위반 0, 종료 코드 0 |
| `npm.cmd run build` | 통과, main/preload/renderer·로컬 글꼴 생성, 종료 코드 0 |
| `npm.cmd run dist` | 통과, NSIS 설치 EXE·blockmap 생성, 종료 코드 0 |
| `npm.cmd run seed -- <새 임시 폴더>` | 통과, 가짜 300문제·2과목 저장, 종료 코드 0 |
| `npm.cmd run capture` | 실패, 기본 실행은 Windows ACL 오류, 종료 코드 1; 32개 대상의 실패 보고서 생성 |
| 패키지 앱의 캡처 실행 | 실패, renderer 시작 실패·ERR_FAILED (-2), 종료 코드 1 |
| `git diff --check` | 통과, 종료 코드 0 |

최종 설치 파일은 `release/QuestionBank-Setup-0.1.0.exe`다. 실제 설치 파일을 생성했으며 GitHub에는 게시하지 않았다.

- 초기 build는 renderer 출력/폰트 상대 경로 오류로 실패했고 경로를 수정한 뒤 통과했다. 초기 의존 검사는 TSX 해석·Electron 브리지 예외를 수정한 뒤 통과했다.
- 임시 renderer 파일에 storage/importers/exporters/generation/node:fs를 import했을 때 의도대로 6개 의존 오류·종료 코드 1이었다. 임시 파일은 삭제했다.
- 작업 중 빠른 테스트 한 번은 기존 selector의 성능 한도 300ms에 425ms가 측정되어 실패했다. 한도나 해당 코드는 변경하지 않고 단독 재실행해 통과했다.
- 최초 dist는 기존 package.json의 구식 `directories` 키로 실패했다. 해당 키를 제거했다. 다음 시도는 `connect EACCES 20.200.245.247:443`로 Electron 다운로드가 차단됐다. 설치된 Electron을 재사용하도록 설정한 뒤 NSIS 생성에 성공했다.
- 이 실행 환경의 기본 Electron 실행은 `install_dir_access.cc:52`의 AppContainer ACL 오류로 중단됐다. 설치 폴더 ACL 변경은 `Access is denied`였다. 별도 임시 복사본과 패키지 앱에서도 `Renderer process launch-failed`, GPU 프로세스 종료 `-1073741515`, `ERR_FAILED (-2)`로 화면 로드에 실패했다. 샌드박스를 끄지 않았다. 따라서 PNG 시각 검수·실제 키보드 조작·최소 크기의 실제 화면 검수는 미완료다. `.tmp-stage5a/captures-final/`과 `captures-packaged-log/`에 실패 보고서를 남겼다.
- Windows 설치 파일은 생성했으나 실제 설치·제거와 일반 사용자 PC에서의 실행은 검증하지 않았다.
- 작업용 임시 복사본 정리는 자동 승인 검토가 `blocked by policy`로 거부해 실행하지 못했다. `.tmp-stage5a/electron-runtime/`과 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/` 아래의 `qb-stage5a-runtime/`, `qb-stage5a-packaged/`, `qb-stage5a-testdata/`가 남아 있다. 모두 이번 작업이 설치 바이너리 또는 가짜 데이터로 만든 전용 폴더이며 원본 데이터는 아니다.
- 실제 문제 파일·`.tmp-realcheck/` 접근, 네트워크 패키지 설치, 네이티브 재빌드, git commit/push는 하지 않았다. 계약 변경 요청은 없다.

## 다음 단계

5B: 가져오기·문제 추가·편집. 5C: 시험 만들기·규칙·이력·PDF/Word/Excel 출력. 5D: 백업·복원 UI, 업데이트·배포. 현재 기본 저장 폴더·과목 목록은 설정 데이터로만 보관하며 해당 편집 UI는 후속 단계다.

## 만든/수정한 파일

```text
.dependency-cruiser.cjs
.gitignore
package.json
tsconfig.json
tsconfig.node.json
tsconfig.web.json
electron.vite.config.ts
electron-builder.yml
scripts/capture.cjs
scripts/dev-seed.cjs
scripts/dev-seed.ts
src/app/shared/api.ts
src/app/main/index.ts
src/app/main/paths.ts
src/app/main/paths.test.ts
src/app/main/settings.ts
src/app/main/settings.test.ts
src/app/main/ipc.ts
src/app/main/ipc.test.ts
src/app/main/capture.ts
src/app/main/capture.test.ts
src/app/main/services/app-info.ts
src/app/main/services/settings.ts
src/app/main/services/bank.ts
src/app/main/services/bank.test.ts
src/app/preload/index.ts
src/app/renderer/index.html
src/app/renderer/env.d.ts
src/app/renderer/main.tsx
src/app/renderer/components/index.tsx
src/app/renderer/styles/tokens.css
src/app/renderer/styles/app.css
src/modules/render-html/index.ts
src/modules/render-html/question-preview.test.ts
src/modules/exporters/xlsx/index.ts
src/modules/exporters/xlsx/xlsx.test.ts
tests/fixtures/appBank.ts
tests/fixtures/appBank.test.ts
docs/STAGE5A.md
```

`out/`, `release/`, `.tmp-stage5a/`의 빌드·검수 산출물은 git에서 제외한다.
