## 5A단계: Electron 앱 뼈대 + 앱 셸 화면 + 홈·문제은행(보기) + 검수용 캡처 모드 + 설치 파일 설정

지금까지 만든 모듈(src/modules, src/core)을 실제 Windows 프로그램으로 조립하는 첫 단계다. 화면은 `docs/DESIGN.md` 를 따른다.

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 구현하고 검사를 통과시킨 뒤에만 최종 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md(**§3 의존 규칙의 app 계층, §8-1 앱 계층**), docs/DESIGN.md(전체), src/contracts/index.ts, docs/STAGE1.md(storage), docs/STAGE4B.md·STAGE4C.md(출력) 를 `Get-Content -Encoding UTF8` 로 읽어라. `npm.cmd`/`npx.cmd`.
- **이미 설치된 패키지만 쓴다(네트워크 설치 금지)**: electron 45.2.1, electron-vite 6.0.0, vite 7.3.7, @vitejs/plugin-react 5.2.0, react/react-dom 19.3.1, @types/react·@types/react-dom, electron-builder 26.18.0, lucide-react, pretendard 1.3.9, better-sqlite3 13.0.3. **vite 를 8 로 올리지 마라**(vitest 3 과 충돌). 더 필요하면 보고서에 적고 대안으로.
- 계약(`src/contracts/index.ts`) 수정 금지. 실제 문제 파일(문제 디비/, 규칙.docx), `.tmp-realcheck/` 접근 금지. 앱을 실제로 띄워 보는 것은 해도 되지만(Electron 실행) 데이터는 임시 폴더(`QB_DATA_DIR`)의 가짜 데이터로만.
- 작업 중 `npm.cmd run test:fast`, 마무리 전 `npm.cmd test`(전체)·`npm.cmd run typecheck`·`npm.cmd run lint:deps` 모두 통과. 그리고 `npm.cmd run build` 성공.

## 5A-0. 작은 수정 (4C 실제 Excel 검수에서 발견)
- `exporters/xlsx` 의 행 높이 추정이 한글을 영문 한 글자 폭으로 세서 줄 수를 적게 잡는다 → 실제 Excel 에서 일부 셀(긴 예문·문제)의 마지막 줄이 잘린다. **전각 문자(한글·한자·원문자 등 East Asian Wide/Fullwidth)는 2칸, 그 외는 1칸**으로 세어 열 너비 대비 줄 수를 계산하고, 줄 높이는 글꼴 크기에 맞게 약간 여유(약 1.25배)를 둬라. 테스트: 한글 긴 문장 셀의 행 높이가 줄 수 × 줄 높이 이상.

## 5A-1. 빌드 도구
- `electron.vite.config.ts`: main(`src/app/main/index.ts`), preload(`src/app/preload/index.ts`), renderer(`src/app/renderer/index.html`, React). 출력 `out/`.
- TypeScript: 기존 루트 tsconfig(모듈·테스트)는 유지하고, renderer 용(DOM lib, `jsx: react-jsx`)과 main/preload 용 설정을 분리해 `npm run typecheck` 가 **모두** 검사하게 하라(예: `tsc -p tsconfig.json && tsc -p tsconfig.web.json && tsc -p tsconfig.node.json`).
- scripts: `dev`(electron-vite dev), `build`(electron-vite build), `app`(빌드 결과 실행: electron-vite preview), `dist`(build 후 electron-builder --win nsis), `capture`(빌드 결과를 캡처 모드로 실행 — 5A-6).
- `.dependency-cruiser.cjs` 에 ARCHITECTURE §3 의 app 계층 규칙을 추가: `app/shared → contracts` 만, `app/preload → app/shared`, `app/renderer → app/shared, contracts, content-model, render-html, objective-code` 만(특히 **renderer 가 storage·importers·exporters·generation·node:* 를 import 하면 실패**), `app/main → 전부`. 임시 위반으로 작동 확인 후 삭제. vitest 는 renderer 를 테스트하지 않아도 되지만 main 서비스는 테스트한다.

## 5A-2. SQLite (재빌드 불필요 — 확인됨)
- better-sqlite3 는 13.0.3 으로 올렸다. Node-API 바이너리를 패키지에 포함하므로 **테스트(Node 22)와 Electron 45 가 같은 바이너리**를 쓴다(검수자가 두 환경에서 실제 실행 확인). 네이티브 재빌드·별도 다운로드 스크립트를 만들지 마라.
- electron-vite 설정에서 main/preload 의 의존성은 외부화(`externalizeDepsPlugin`)해서 better-sqlite3 를 번들하지 않게 하라.
- electron-builder: `npmRebuild: false`, `asar: true`, `asarUnpack: ["**/node_modules/better-sqlite3/**"]`(`.node` 는 asar 안에서 로드 불가).
- main 에서 DB 를 열지 못하면(파일 권한, 손상 등) 앱이 그냥 죽지 말고 한국어 오류 화면(원인, 데이터 폴더 열기 버튼, 백업에서 복원 안내)을 보여 준다.

## 5A-3. 앱 계층 구조
```
src/app/shared/api.ts      IPC 계약(채널 상수 + 요청/응답 타입, 로직 없음). renderer·preload·main 이 공유.
src/app/main/index.ts      앱 수명주기, 단일 인스턴스, 창 생성(보안 설정), 서비스 생성, IPC 등록
src/app/main/paths.ts      데이터 위치: 기본 %APPDATA%/QuestionBank, 환경변수 QB_DATA_DIR 로 대체. data/bank.sqlite, settings.json, backups/
src/app/main/settings.ts   settings.json 읽기/쓰기(테마: 'system'|'light'|'dark', 과목 목록 [{ id, name }], 기본 저장 폴더). 손상 시 기본값 + 손상 파일 보존.
src/app/main/services/*.ts 화면용 서비스(모듈을 조합만). 5A: appInfo, settings, bank(통계·목록·조회)
src/app/main/ipc.ts        api.ts 의 채널마다 핸들러 등록, 입력 검증, 오류를 { ok:false, message(한국어) } 로 변환
src/app/preload/index.ts   contextBridge.exposeInMainWorld('qb', …) — api.ts 의 함수만(ipcRenderer 직접 노출 금지)
src/app/renderer/          React UI
```
- `app.setPath('userData', …)` 를 QuestionBank 폴더로 고정(제품명이 한글이어도 경로는 영문).
- BrowserWindow 보안: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, 외부 URL 탐색·`window.open` 차단(`setWindowOpenHandler` deny, `will-navigate` 차단), renderer `index.html` 에 CSP(`default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'self' data: about:; script-src 'self'`).
- 창: 기본 1360×840, 최소 1100×700, 제목 "문제은행", 마지막 창 크기·위치 기억(settings).
- 마이그레이션 전 백업: `openStorage` 의 `beforeMigrate` 에서 DB 파일과 `-wal`/`-shm` 을 `backups/pre-migrate-{from}-to-{to}-{시각}/` 로 복사(시각은 main 에서 주입). 테스트.
- IPC(5A 범위, `api.ts` 에 타입 정의):
  - `app.info()` → { version, dataDir, dbPath, isPackaged }
  - `settings.get()` / `settings.update(partial)` → Settings
  - `bank.stats()` → { total, bySubject: [{ subject, name, count, withoutObjective }], warnings: { withoutObjective: number } }
  - `bank.list({ subject?, objectivePrefix?, text?, offset, limit })` → { items: QuestionSummary[], total } (QuestionSummary: id, subject, objectiveCode, grade, stemPreview(80자), hasPassage, hasImage, choiceCount, warnings 개수)
  - `bank.objectiveTree(subject)` → 학습목표 계층(대단원 → 중단원 → 코드, 각 노드 문제 수) — `objective-code` 모듈 사용
  - `bank.get(id)` → { question, assets(해당 문제가 쓰는 것만) }
  - 서비스 단위 테스트(vitest, `:memory:` storage + tests/fixtures 가짜 문제): stats/list/tree/get, 잘못된 입력의 한국어 오류.

## 5A-4. 화면 — 디자인 시스템과 앱 셸 (DESIGN.md §2·§3·§5 그대로)
- `src/app/renderer/styles/tokens.css`: DESIGN.md §2 의 색(라이트/다크)·타이포·간격·반경·그림자·모션 토큰. 다크는 `prefers-color-scheme` + 설정의 수동 전환(`<html data-theme>`). 이 밖의 임의 색·간격 금지.
- 글꼴: `pretendard` 패키지의 가변 woff2 를 번들(@font-face, 로컬 파일). 한국어 줄바꿈 `word-break: keep-all`.
- 공통 컴포넌트(작게, 접근성 포함): Button(주/보조/위험, 비활성 사유 툴팁), Input/SearchInput, Badge(경고/오류/확인 필요/등급), Card, EmptyState, ErrorState, Spinner/Skeleton, Toast(실행 취소 자리), Dialog(포커스 가둠·Esc), Tabs, Tooltip. 아이콘은 lucide-react(선 1.75, 16/20px), 아이콘 버튼은 `aria-label`.
- 앱 셸: 좌측 사이드바(220px, 접기 가능): 홈 / 문제은행 / 가져오기 / 문제 추가 / 시험 만들기 / 출제 규칙 / 출제 이력 / 설정, 하단에 버전. 상단 페이지 헤더(제목 + 주 행동 버튼 자리). 해시 라우팅(외부 라우터 없이 작게). 포커스 링, Tab 순서, 단축키 `Ctrl+K`(검색 포커스).
- 5A 에서 실제 동작하는 화면:
  1. **홈**: 과목별 문제 수 카드, "주의 필요"(학습목표 없는 문제 N개 → 문제은행 필터로 이동), 최근 시험(아직 없으면 빈 상태), 문제 0개면 빈 상태("문제를 가져오거나 직접 추가해 보세요" + 버튼 2개).
  2. **문제은행(보기 전용)**: 좌측 학습목표 트리(과목 → 대단원 → 중단원, 개수), 검색창, 가운데 목록(번호 없이 학습목표·등급·문제 앞부분·아이콘(이미지/지문)), 우측 상세 패널 = **`render-html` 로 만든 문항 미리보기**(sandbox iframe, srcdoc, 스크립트 불가) + 정답·해설·학습목표. 800개 규모에서도 부드럽게(목록 가상화 또는 페이지 단위 로딩). 로딩/빈 결과/오류 상태.
  3. 나머지 메뉴(가져오기, 문제 추가, 시험 만들기, 출제 규칙, 출제 이력, 설정)는 **"다음 단계에서 제공됩니다"** 빈 상태 화면(아이콘 + 한 줄 설명). 단 **설정 화면의 테마 전환(시스템/라이트/다크)과 데이터 폴더 표시**는 5A 에서 동작.
- 화면 문구는 한국어, 짧고 명확하게. 숫자는 `tabular-nums`.

## 5A-5. 렌더러 준비 신호
각 화면은 데이터 로딩이 끝나면 `document.body.dataset.ready = '<route>'` 를 설정한다(캡처 모드와 자동 검사용).

## 5A-6. 검수용 캡처 모드 (디자인 검수 자동화)
환경변수 `QB_CAPTURE_DIR` 가 있으면 main 이: 창을 띄우고(화면에 보여도 됨) → 모든 라우트를 순서대로 열고 → `ready` 신호를 기다려(최대 10초) → `webContents.capturePage()` 로 `{라우트}-{light|dark}-{1360x840|1100x700}.png` 를 저장 → 라이트/다크 × 두 창 크기 모두 → 종료. 결과 목록을 `capture-report.json`(라우트, 파일, 대기 시간, 오류)으로 남긴다. `npm run capture` 는 `QB_CAPTURE_DIR`·`QB_DATA_DIR` 를 받아 빌드 결과로 실행.
- 데이터 준비 스크립트 `scripts/dev-seed.ts <dataDir>`: tests/fixtures 의 **가짜 문제**로 지정 폴더에 DB 를 만든다(과목 2개, 문제 300개, 일부 학습목표 없음·이미지·지문 포함). (검수자는 실제 문제로 따로 채운다.)

## 5A-7. 설치 파일 설정 (electron-builder)
- 설정 파일(electron-builder.yml 또는 package.json "build"): appId `kr.publisher.questionbank`, productName `문제은행`, 실행 파일/설치 파일 이름은 영문 `QuestionBank`(예: `QuestionBank-Setup-${version}.exe`), Windows x64 NSIS(사용자별 설치, 설치 폴더 선택 가능, 바탕화면·시작 메뉴 바로 가기 이름 "문제은행"), `npmRebuild: false`, `asar: true` + better-sqlite3 asarUnpack(5A-2), 아이콘 자리(`build/icon.ico` 없으면 기본).
- `publish` 는 GitHub(owner `magic3899-star`, repo `question-bank`)로 설정만 해 두고 자동 업데이트 코드는 5D 에서.
- `npm.cmd run dist` 를 실제로 실행해 설치 파일이 만들어지는지 확인하라(electron-builder 가 NSIS 도구 등을 내려받아야 해서 네트워크가 막혀 실패하면, 실패 메시지를 그대로 보고하고 넘어가라 — 검수자가 실행한다).

## 마무리
- `docs/STAGE5A.md`: 구조, 실행 방법(dev/build/app/capture/dist), 데이터 위치, 보안 설정, 캡처 모드 사용법, 한계와 다음 단계(5B: 가져오기·문제 추가·편집, 5C: 시험 만들기·규칙·이력·출력, 5D: 백업·업데이트·배포).
- `npm.cmd test`(전체), `npm.cmd run typecheck`(모든 tsconfig), `npm.cmd run lint:deps`, `npm.cmd run build` 모두 통과. AGENTS.md 최종 보고 형식(계약 변경 요청 포함).
