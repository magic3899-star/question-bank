## 5B단계: 문서 해석 규칙 공용화(layout-parser) + 텍스트 붙여넣기 해석 + 가져오기 화면

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 구현하고 검사를 통과시킨 뒤에만 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md(§3·§8-1·§11·§11-1), docs/DESIGN.md(§4.3 가져오기), src/contracts/index.ts, docs/STAGE2.md·STAGE2B 관련·STAGE3B.md·STAGE4C.md·STAGE5A.md·STAGE5A2.md, `src/modules/importers/**`, `src/app/**` 를 `Get-Content -Encoding UTF8` 로 읽어라. `npm.cmd`/`npx.cmd`. 계약(`src/contracts/index.ts`) 수정 금지. 실제 문제 파일·`.tmp-realcheck/` 접근 금지. 네트워크 설치 금지.
- 이 환경에서는 Electron 창을 띄울 수 없다(샌드박스). 캡처는 하지 말고 검수자가 한다. renderer 는 build·typecheck 로 검증.
- 마무리 전 `npm.cmd test`(전체), `npm.cmd run typecheck`, `npm.cmd run lint:deps`, `npm.cmd run format`→`format:check`, `npm.cmd run build` 모두 통과.

## 5B-0. 검수에서 나온 수정 (실제 문제 DB 로 캡처해 확인함)
 a. **캡처 모드가 PC 화면이 잠기거나 꺼져 있으면 멈춘다**(창이 가려졌다고 판단한 Chromium 이 `requestAnimationFrame` 을 멈춤 → 준비 대기에서 무한 대기). `QB_CAPTURE_DIR` 가 있을 때 main 이 앱 준비 전에 `app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')`, `appendSwitch('disable-renderer-backgrounding')`, `appendSwitch('disable-background-timer-throttling')` 을 넣고, 창의 `webPreferences.backgroundThrottling = false`. (검수자가 이 옵션으로 32장 캡처 성공을 확인함.) 캡처 대기 단계마다 시간 제한을 둬서 어떤 경우에도 무한 대기하지 않게(제한 초과는 보고서 오류로).
 b. 캡처 모드에서 단일 실행 잠금을 얻지 못하면(다른 문제은행 창이 실행 중) 즉시 실패 보고서("이미 실행 중인 문제은행 창이 있어 캡처할 수 없습니다. 창을 모두 닫고 다시 실행하세요.")를 쓰고 종료 코드 1.
 c. 검색창(`SearchInput`)의 돋보기 아이콘이 안내 문구 첫 글자를 가린다 → 아이콘 폭만큼 안쪽 여백.
 d. 홈 "주의 필요"에서 학습목표 없는 문제가 **0개**여도 경고 아이콘·버튼이 나온다 → 0개면 정상 상태(체크 아이콘, "모든 문제에 학습목표가 있습니다", 버튼 없음).
 e. 문제 목록 정렬의 과목 순서를 과목 ID 순이 아니라 **설정의 과목 순서**(트리와 같은 순서)로.

## 5B-1. 공용 해석 모듈 `src/modules/layout-parser` (리팩터링 — 동작 변경 금지)
지금 `importers/docx` 안에 있는 "문서 구조 → 문제 레코드" 해석(출처 태그 경계, 앞보기 문제 시작 판정, 문제 줄/예문/선지/정답/해설/학습목표 줄, 등급 필터, 학습목표 없음 제외, 같은 지문 첫 문제만, 해설의 선지 번호 참조 시 선지 고정, 관련 진단)을 **형식과 무관한 공용 모듈**로 옮긴다. 목적: Word 가져오기와 텍스트(붙여넣기) 해석이 **같은 규칙**을 쓰게 해서, 규칙을 고칠 때 한 곳만 고치면 되게.
- 입력: 형식 중립 블록 열 `LayoutBlock[]`(예: `{ block: Block; text: string; circledNumbering?: boolean; sourceIndex: number; kind: 'paragraph'|'table'|'image'|'box' }` — 필요한 정보만, 이 모듈에서 정의·export), `LayoutProfile`, 옵션(`subject`, `includeGrades`, `requireObjective`, `dedupeByPassage`, `lockChoicesOnReference`, `sourceFile`).
- 출력: `{ questions: DraftQuestion[]; diagnostics: Diagnostic[]; usedAssetIds: string[] }` (자산 바이트는 다루지 않는다 — docx 고유).
- `LayoutProfile`·`standardProfile`·`validateProfile` 은 layout-parser 로 옮기고 `importers/docx` 에서 기존 이름으로 다시 export(호환 유지).
- `importers/docx` 는: zip/XML 읽기 → 자동 번호 복원·텍스트박스→1×1 표·이미지 자산·수식 평탄화 등 **docx 고유 처리**로 `LayoutBlock[]` 생성 → layout-parser 호출 → 자산 첨부. 
- **기존 docx 테스트는 기대값을 바꾸지 말고 전부 그대로 통과해야 한다**(동작 동일의 증거). layout-parser 자체 단위 테스트를 추가(가짜 LayoutBlock 열로 각 규칙).
- 의존 규칙: `layout-parser → contracts, content-model, objective-code`; `importers/* → contracts, content-model, layout-parser`. ARCHITECTURE.md §2·§3 에 반영, `.dependency-cruiser.cjs` 갱신 + 임시 위반 확인.

## 5B-2. 텍스트 해석 `src/modules/importers/text` (붙여넣기·.txt)
`textImporter: Importer`(id 'text', extensions ['.txt']) + `parseQuestionText(text: string, options): ImportDraft`(붙여넣기용, 같은 옵션).
- UTF-8(BOM 제거), CRLF/CR → LF, 각 줄을 문단 블록으로 → layout-parser.
- **PDF 에서 복사한 글자의 흔한 형태**를 처리(옵션 `pdfCopyCleanup` 기본 true):
  1. 한 줄에 선지 여러 개(`① 가 ② 나 ③ 다 ④ 라 ⑤ 마`): 원문자가 ①부터 순서대로 나타나면 선지별 줄로 나눈다(순서가 아니면 나누지 않음 — 본문 속 원문자 보호).
  2. 줄바꿈으로 잘린 문장: 문제 번호·원문자·`정답:`·`해설:`·학습목표 줄·태그로 시작하지 않는 줄이 문제 줄/선지/해설 줄 바로 뒤에 오면 **앞 줄에 이어 붙인다**(공백 하나로). 빈 줄은 경계로 유지.
  3. 원문자 앞뒤의 NBSP·전각 공백 정규화, 쪽 번호만 있는 줄(`- 3 -`, `3`, `3/12`)과 반복되는 머리글 제거는 하지 말고 **경고 진단**(`PDF_ARTIFACT_SUSPECTED`)만.
- 해설만 따로 붙여넣는 흐름을 위해 `parseExplanationText(text): { number: string; explanation: Block[] }[]` 도 제공: `1. 해설…` / `01) …` / `[해설] 1번 …` 같은 번호 머리로 나눈다(번호 패턴은 프로파일 필드로). 5C(문제 추가 화면)에서 쓴다.
- 테스트: 위 각 형태(가짜 문장), 프로파일 교체, 결정성, 빈 입력.

## 5B-3. 가져오기 화면 (DESIGN.md §4.3)
### main 서비스 `src/app/main/services/import.ts` + IPC
- `import.pickFiles()` → 파일 선택 대화상자(.docx, .txt, 여러 개). 렌더러의 드래그&드롭은 preload 에서 `webUtils.getPathForFile(file)` 로 경로를 얻어 `import.analyze` 로.
- `import.analyze({ paths, options })`: 경로 검증(존재, 확장자, 50MB 이하) → 확장자별 importer(registry 로 선택) → `standardValidators` → **은행과의 중복 검사**: 같은 과목의 기존 문제 `questionContentKey` 와 비교해 같으면 warn `DUPLICATE_IN_BANK`(기존 문제 ID·학습목표 포함), 기본 처리 = 제외("같은 지문은 첫 문제만" — 이미 은행에 있는 쪽이 먼저). 결과를 `batchId` 로 main 메모리에 보관하고 `ImportReview` 반환: `{ batchId, files: [{name, questions, skipped}], items: [{ index, status: 'ok'|'warn'|'error'|'excluded', excludedReason?, diagnostics, summary(학습목표·등급·문제 앞 80자·이미지/지문 여부), draft(미리보기용 Question 형태), }], skipped: Diagnostic[](SKIPPED_* — 가져오기 단계에서 이미 빠진 문제), assets: 미리보기에 필요한 것만, counts }`.
- `import.commit({ batchId, patches })`: patches = `[{ index, include?: boolean, objectiveCode?: string, grade?: string, shufflePolicy?: 'free'|'lock-all' }]` 적용 → 다시 검증(오류가 남은 항목은 저장하지 않고 이유 반환) → ID(`crypto.randomUUID`), 생성 시각(원래 순서 유지되게 1ms 씩 증가, main 의 시계 주입), `extra.importBatchId`, `extra.sourceFile` → 쓰인 자산 저장 + `questions.upsertMany` → `{ saved: number, savedIds, notSaved: [{index, reason}] }`.
- `import.discard(batchId)`, `bank.deleteMany(ids)`(실행 취소용, 이후 단계도 사용).
- 서비스 테스트(가짜 docx — `tests/fixtures/docxBuilder.ts`, 가짜 txt, `:memory:` storage): 분석 상태 분류, 은행 중복 탐지, 패치 적용(학습목표 입력으로 오류 해소 등), 저장 ID·순서·자산, 실행 취소, 잘못된 경로·확장자·크기의 한국어 오류, 사라진 batchId.
### renderer `screens/import/`
- 처음: 끌어놓기 영역(여러 파일) + "파일 선택" 버튼 + 옵션 패널: 과목(설정의 과목 목록, 필수), "A 등급만"(기본 켬), "학습목표 없는 문제 제외"(켬), "같은 지문은 첫 문제만"(켬), "해설에 선지 번호가 있으면 선지 고정"(켬). 각 옵션 옆에 한 줄 설명.
- 분석 중: 파일 이름과 진행 표시.
- **검수 표**: 상단 요약("문제 252개 · 정상 230 · 경고 14 · 오류 3 · 제외 5 · 가져오기 전 제외 24"), 필터 탭(전체/경고/오류/제외/은행과 중복/가져오기 전 제외), 행: 원문 위치·학습목표·등급·문제 앞부분·배지. 행 펼치기 → 왼쪽 `render-html` 미리보기(은행 화면과 같은 미리보기 컴포넌트를 components 로 옮겨 공유), 오른쪽 진단 목록 + 즉석 수정(학습목표 입력 — objective-code 로 형식 검사, 등급 선택, 선지 고정 토글, 포함/제외 토글). 수정은 화면 상태에 두고 저장 때 patches 로.
- 하단 고정 바: "N개 저장"(정상+경고, 오류는 수정하기 전엔 제외) → 확인 대화상자(저장 수, 제외 수, 오류로 저장 안 되는 수) → 저장 → 토스트("N개를 저장했습니다", 실행 취소(10초), "문제은행에서 보기" → 이번 가져오기 묶음만 필터: `bank?batch=<id>` — bank 목록 서비스에 batch 필터 추가) → 취소 버튼은 batch 폐기.
- 키보드: 행 이동(↑↓), 펼치기(Enter), 포함 토글(Space).
- 빈/오류/로딩 상태, 다크 모드, 최소 창 크기.
### 검수용 캡처 확장
캡처 모드에서 `QB_CAPTURE_IMPORT_FILES`(세미콜론으로 구분한 경로)와 `QB_CAPTURE_IMPORT_SUBJECT` 가 있으면, 'import' 라우트를 캡처하기 전에 그 파일들을 분석해 **검수 표 상태**로 띄우고(첫 경고 행 펼침), `import-review-{theme}-{size}.png` 도 추가로 저장. (검수자가 실제 문서로 확인하는 용도.)

## 5B-4. 문서
`docs/STAGE5B.md`: layout-parser 구조와 "규칙을 바꾸는 곳", 텍스트 해석 규칙(PDF 복사 처리), 가져오기 흐름·IPC·은행 중복 정책, 캡처 확장 사용법, 한계. AGENTS.md 최종 보고 형식(계약 변경 요청 포함).
