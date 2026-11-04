# 문제은행 — 아키텍처

출판사 모의고사 제작 프로그램. 문제를 저장하고, 규칙에 따라 뽑아서 섞고, PDF/Word/Excel 로 저장한다.
Windows 설치형(Electron), 개인 PC 단독 사용, 문제 데이터는 PC 안에만 있다.

## 1. 설계 목표 (우선순위 순)

1. **예문 불변**: 문제에 딸린 예문/보기/이미지/표는 그 문제와 절대 분리·교환되지 않는다.
2. **모듈 독립**: 한 모듈을 바꿔도 다른 모듈을 고치지 않는다. 공유 접점은 `src/contracts` 하나뿐.
3. **확장 용이**: 출력 형식, 가져오기 형식, 규칙 유형, 섞기 방식, 문제 유형을 폴더 추가만으로 늘린다.
4. **배포 기준**: 설치 파일 하나로 다른 PC 에서 즉시 동작. 시작 시 업데이트 확인. 업데이트해도 문제 데이터 보존.
5. **재현성**: 같은 시드 + 같은 규칙 + 같은 문제 = 같은 시험지.

## 2. 모듈

| 모듈 | 위치 | 입력 → 출력 | 순수 함수 |
|---|---|---|---|
| contracts | `src/contracts` | 타입만 | - |
| content-model | `src/modules/content-model` | 블록 유틸(텍스트 추출, 정규화, 해시) | O |
| rng | `src/modules/rng` | 시드 → 재현 가능 난수 | O |
| objective-code | `src/modules/objective-code` | 학습목표 코드 파싱·구간(segment) 단위 접두 비교 (`해부 1` 이 `해부 14-1-3` 과 섞이지 않게) | O |
| registry | `src/core/registry` | 플러그인 등록/조회 | O |
| storage | `src/modules/storage` | SQLite 저장소, 마이그레이션 | 아니오(DB) |
| importers/* | `src/modules/importers/<id>` | 파일 → ImportDraft | O |
| layout-parser | `src/modules/layout-parser` | 형식 중립 LayoutBlock 열 + 프로파일·옵션 → 문제 초안·진단·사용 자산 ID | O |
| validators/* | `src/modules/validators/<id>` | 문제 → Diagnostic[] | O |
| rules | `src/modules/rules` | RuleSet 스키마 검증, 기본 프리셋 | O |
| constraints/* | `src/modules/constraints/<id>` | 제약 플러그인 | O |
| selector | `src/modules/selector` | 규칙+후보 → 선택 결과 | O |
| shuffler/* | `src/modules/shuffler/<id>` | 선택 → 섞인 선택 | O |
| exam-snapshot | `src/modules/exam-snapshot` | 섞인 선택 → 불변 확정본 | O |
| generation | `src/modules/generation` | 선택→섞기→확정본 파이프라인 | O |
| render-html | `src/modules/render-html` | 블록/확정본 → HTML+CSS 문자열 (화면 미리보기와 PDF 가 공용) | O |
| exporters/* | `src/modules/exporters/<id>` | 확정본 → 파일 | O |
| history | `src/modules/history` | 최근 출제 제외 등 이력 로직 | O |
| backup | `src/modules/backup` | DB 백업/복원 | 아니오(파일) |
| updater | `src/modules/updater` | 업데이트 확인·적용 | 아니오(네트워크) |
| app | `src/app` | Electron main + renderer(UI). 모듈을 조립만 한다 | - |

## 3. 의존 규칙 (dependency-cruiser 가 강제, 위반 시 빌드 실패)

```
contracts            → (없음)
content-model, rng   → contracts
registry             → contracts
storage              → contracts, content-model
layout-parser        → contracts, content-model, objective-code
importers/*          → contracts, content-model, layout-parser, importers/text (글자만 읽는 형식이 붙여넣기 해석을 재사용)
validators/*         → contracts, content-model
objective-code       → contracts
rules                → contracts, objective-code
constraints/*        → contracts, content-model, objective-code
selector             → contracts, content-model, objective-code, rng   (제약은 주입받는다)
shuffler/*           → contracts, rng, objective-code (학습목표 순 정렬)
exam-snapshot        → contracts, content-model
generation           → contracts, exam-snapshot, content-model, rng   (selector/shuffler는 주입받는다)
render-html          → contracts, content-model
exporters/*          → contracts, content-model, render-html   (storage 금지!)
history              → contracts
backup               → contracts
updater              → (없음)
app/shared           → contracts                          (main↔renderer IPC 타입·라우트 메타데이터, 업무 로직 없음)
app/main             → 모든 src/modules, src/core, app/shared   (조립 전용 루트, Node/Electron)
app/preload          → app/shared                          (contextBridge 로 window.qb 노출)
app/renderer         → app/shared, contracts, content-model, render-html, objective-code  (브라우저 전용: storage·importers·exporters·node:* 금지)
```

- 같은 계층의 모듈끼리(예: `exporters/pdf` ↔ `exporters/docx`)도 서로 import 하지 않는다.
- `exporters/*` 는 storage 를 절대 import 하지 않는다 → DB 가 바뀌어도 출력은 영향 없음.
- UI(renderer)는 `app` 이 노출하는 IPC API 로만 로직을 호출한다.
- 문제 해석 규칙·프로파일은 `layout-parser/index.ts`가 공개한다. 형식별 importer는 문서 고유 변환 후 이를 호출한다. `importers/docx`의 기존 프로파일 export는 호환을 위해 유지한다.

## 4. 데이터 흐름

```
[파일] → importer → ImportDraft → validators → (사람 검수) → storage
storage ─후보→ selector(+rules+constraints) → shuffler → exam-snapshot ─→ exporters → [PDF/DOCX/XLSX]
                                                            └→ history 기록
```

`ExamSnapshot` 이 방화벽이다. 확정되는 순간 문제 내용을 복사해 불변으로 만들고 `contentHash` 를 기록한다.
출력기는 이것만 받는다.

## 5. 불변 조건 (모든 섞기 전략이 지켜야 함 — `tests/invariants`)

1. 예문(`passage`), 문제 본문(`stem`), 해설은 섞기 전후 동일.
2. 선지 집합이 동일 (누락·중복·변형 없음). 선지 내용은 ID 로 대응.
3. `answerChoiceIds` 는 선지 ID 로 추적되어, 섞은 뒤 `answerLabels` 가 정확히 같은 선지를 가리킨다.
4. `fixedPosition` 선지와 `shufflePolicy: 'lock-all'` 문제의 선지는 위치가 바뀌지 않는다.
5. `passageGroupId` 가 같은 문항은 연속 배치되고 묶음 내부 순서가 유지된다.
6. 같은 시드 → 같은 결과.
7. 출력물에서 추출한 텍스트가 확정본과 일치 (`contentHash` 검증).

## 6. 선지 번호 처리

선지 번호(①~⑤)는 **저장하지 않는다.** 가져올 때 제거하고, 확정본을 만들 때 위치로 다시 붙인다.
(번호를 내용에 넣어두면 섞은 뒤 번호가 뒤죽박죽이 된다.)

## 7. 데이터 위치와 업데이트

- 문제 DB: `%APPDATA%/<앱이름>/data/bank.sqlite`. 프로그램 폴더와 분리 → 업데이트/재설치에도 보존.
- 스키마 변경은 `storage/migrations/NNN-*.ts` 로만. 마이그레이션 직전 자동 백업.
- 프로그램 코드/UI 는 GitHub(공개)에, 문제 데이터는 올리지 않는다 (`.gitignore` 로 차단).
- 업데이트: GitHub Releases + electron-updater. 실패해도 프로그램은 정상 실행.

## 8. 기술 스택

- Electron + TypeScript + React(Vite)
- SQLite: better-sqlite3
- 테스트: vitest
- 의존 검사: dependency-cruiser
- 출력: PDF = Electron printToPDF(HTML), DOCX = `docx`, XLSX = `exceljs`
- 가져오기(docx): jszip + XML 직접 파싱 (서식·이미지·표·텍스트박스 보존 목적)
- 폰트: 시험지는 Windows 기본 바탕·맑은 고딕(Word·PDF 동일), UI 는 Pretendard 번들

## 8-1. 앱 계층 (5단계)

```
src/app/shared/index.ts    main·preload·renderer가 공유하는 공개 진입점
  api.ts                   IPC 계약: 채널 이름 + 요청/응답 타입
  routes.ts                라우트 ID·제목·설명·아이콘 이름의 공통 표(브라우저 코드 없음)
src/app/main/              Electron main = 조립 루트. 모듈을 생성·연결하고 IPC 핸들러를 등록
  services/*               화면 단위 서비스(문제은행, 가져오기, 시험 만들기, 출력, 백업…) — 모듈을 조합만 한다
src/app/preload/           contextBridge 로 api.ts 의 함수만 노출 (ipcRenderer 직접 노출 금지)
src/app/renderer/          React UI. 미리보기는 render-html 을 직접 사용(같은 HTML = 같은 PDF)
```
- renderer의 `main.tsx`는 루트 렌더와 전역 스타일만 연결한다. `app/`은 셸·라우터·사이드바, `screens/<id>/`는 개별 화면, `components/`·`hooks/`·`lib/`는 화면 공용 코드다.
- 화면 사이 import와 공통 컴포넌트→화면 import를 dependency-cruiser로 금지한다. 폴더 밖에서는 공개 `index.ts`만 사용한다. 화면·컴포넌트 스타일은 옆의 CSS Module, 전역은 `tokens.css`·`base.css`만 둔다.
- `app/shared/routes.ts`의 단일 라우트 표를 renderer의 `app/routes.ts`가 화면 컴포넌트와 연결하고 main 캡처도 같은 ID 목록을 사용한다. 새 화면은 이 표에 항목 하나와 `screens/<id>/` 폴더를 추가한다. 자세한 규칙은 `docs/STAGE5A2.md` 참조.
- 보안: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, 외부 URL 탐색·새 창 차단, CSP.
- 데이터 위치: `%APPDATA%/QuestionBank/` (`data/bank.sqlite`, `settings.json`, `backups/`). 개발·검수 시 `QB_DATA_DIR` 로 다른 폴더 지정.
- **SQLite 네이티브 모듈**: better-sqlite3 13 은 Node-API(N-API) 바이너리(`prebuilds/win32-x64.node`)를 패키지에 포함한다. Node-API 는 ABI 가 안정적이라 **테스트(Node 22)와 앱(Electron 45, 내장 Node 24)이 같은 파일**을 쓴다(2026-11-02 실제 확인). 재빌드 불필요: electron-builder `npmRebuild: false`, asar 에서는 better-sqlite3 를 풀어 둔다(`asarUnpack`). electron-vite 는 의존성을 번들하지 않고 외부화한다.
- 검수용 캡처 모드: `QB_CAPTURE_DIR` 가 지정되면 모든 화면을 차례로 열어 PNG 로 저장하고 종료(디자인 검수 자동화).
- 가져오기 분석·검수·저장 IPC와 배치는 main 서비스가 담당한다. renderer는 수정 패치만 전달하며 상세 미리보기는 공용 components의 render-html iframe을 사용한다. `bank?batch=<id>`는 저장 문제의 `extra.importBatchId`로 조회한다. 5B 구현·캡처 확장은 `docs/STAGE5B.md` 참조.
- PDF: 숨은 BrowserWindow 에 render-html 결과를 넣고 `webContents.printToPDF` → `createPdfExporter` 의 `PdfRenderer` 로 주입.
- 시험지 글꼴: Windows 기본 `바탕`·`맑은 고딕`(Word 출력과 동일). UI 글꼴: Pretendard(번들, OFL).

## 9. 역할 분담

- 설계·계약·검수: Claude
- 구현: Codex (모듈 단위로 작업, `AGENTS.md` 규칙 준수)
- `src/contracts` 변경은 Claude 승인 필요.

## 10. 한글(HWP) 관련 결정

- **가져오기 형식(v1.0.2)**: Word(.docx, 서식 보존) · PDF(`importers/pdf`, pdf.js 로 글자만 읽어 붙여넣기 해석 재사용) · 한글(.hwpx)·OpenDocument(.odt)·RTF·HTML(`importers/office-text`, 글자만) · 텍스트(.txt/.md, UTF-8 또는 CP949). 새 형식은 `importers/index.ts` 의 `allImporters` 에만 추가한다. 옛 .doc/.hwp(이진) 는 읽지 않는다(.docx/.hwpx 로 다시 저장 안내). 글자만 읽는 형식은 밑줄·표·그림·수식이 빠지며 검수 화면에 안내(info)를 남긴다.
- **한글 저장(HWPX)**: 1차 범위 밖. 사용자 승인(스파이크 진행, 가능하면 지원). PDF/Word/Excel 완료 후 스파이크로 검증 (이미지·밑줄·표 보존, Windows 한글에서 열림). 통과하면 `exporters/hwpx` 플러그인으로 추가.
  참고: kordoc(`markdownToHwpx`, MIT), airmang/hwpx-plugins(python-hwpx, Apache-2.0). 이미지 지원은 미확인.
- 위 도구는 개발 보조용 MCP/스킬로 설치(프로젝트 범위). 앱 배포물에는 스파이크 통과 전까지 포함하지 않는다.

## 11. 확정된 결정 (2026-10-29)

- 가져오기는 **(A)/A항 등급만**. 등급 없음·다른 등급·학습목표 줄 없는 문제는 제외(제외 목록 표시).
- 출처 태그는 무시(진단·규칙·UI 에서 사용하지 않음).
- **지문(stem+passage)이 같은 문제는 중복. 같은 지문 중 문서의 첫 번째 1문제만 사용**(가져오기에서 나머지 제외). 선택 단계에서도 한 시험·4개 모의고사 전체에 함께 나오지 않게 안전장치.
- 4개 모의고사 간 문제 겹침 금지. 정답 위치는 각 번호 **최소 10%** 만 보장(약간의 편중 허용).
- 한 대단원 슬롯의 문제는 **반드시 중단원이 서로 달라야 한다(엄격)**. 중단원이 하나뿐인 대단원(법규 2-1)은 면제. 중단원이 문제 수보다 적으면 남는 자리는 빈 번호.
- 법규 대단원 1~4 각 5문제, 해부는 규칙 문서대로. 후보가 모자라면 **빈 번호로 남긴다.**
- 미확정: 법규 "첫째·둘째 번호가 안 겹치도록"의 의미(대단원 2·3 은 중단원이 부족해 엄격 적용이 불가능 → '가능하면' 모드).

## 11-1. 문제 추가 기능 (2026-10-29, 담당 이사 요청)

- 문제집에 있는 문항도 문제은행에 넣고 싶다. 원본 데이터는 **PDF 파일이고 문제와 해설이 각각 따로** 있다.
- 따라서 PDF 자동 가져오기가 아니라 **프로그램 안에서 문제를 직접 추가**하는 기능이 필요하다(5단계 UI).
  - 한 문제씩 입력하는 편집기: 본문 / 예문(보기·이미지·표) / 선지 / 정답 / 해설 / 학습목표 / 등급. 해설은 나중에 따로 붙일 수 있어야 한다(문제와 해설이 따로 있는 원본 때문).
  - **붙여넣기 지원**: PDF 에서 복사한 글자를 붙여 넣으면 번호·선지(①~⑤)를 자동으로 나누어 준다. 이미지는 클립보드/파일로 추가.
  - 저장 전에 검증기(validators)를 실행하고, 같은 지문의 기존 문제(`questionContentKey`)가 있으면 알려 준다(첫 문제만 사용 정책).
  - 학습목표 코드는 출제 규칙의 기준이므로 입력을 유도한다(없으면 출제 대상에서 제외됨을 표시).
- PDF 가져오기는 글자 추출만 한다(구현됨, v1.0.2). 밑줄·이미지·표는 못 읽고, 스캔본(글자 없는 PDF)은 오류로 알린다. OCR 은 아직 없다.

## 12. 이전의 보류 항목 (처리됨)

- 출처태그 `<년-월-번호>` 의 정확한 의미, `(A)` 등급의 의미
- 규칙 파일(`규칙.docx`)의 세부 해석 → 제약은 `needsConfirmation` 으로 표시하고 편집 가능하게 둔다
- 학습목표 없는 문제(약 11), 형식 불규칙 문제(1), 코드 오타, 지문 중복 8쌍 → 가져오기 검수 화면에서 처리
