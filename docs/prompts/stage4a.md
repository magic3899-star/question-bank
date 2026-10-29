## 4A단계: 시험지 확정본(exam-snapshot) + 생성 파이프라인(generation) + HTML 렌더러(render-html) + 종단 무결성 테스트

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 구현하고 테스트를 돌려 통과한 뒤에만 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md(§3 의존 규칙, §4~§5), src/contracts/index.ts, docs/STAGE1~3C.md 를 `Get-Content -Encoding UTF8` 로 읽어라. `npm.cmd`/`npx.cmd`. 계약 수정 금지. 실제 문제 파일(문제 디비/, 규칙.docx), `.tmp-realcheck/` 접근 금지. 네트워크 설치 금지.
- `.dependency-cruiser.cjs` 를 갱신: `exam-snapshot → contracts, content-model`, `generation → contracts, exam-snapshot, content-model, rng`(selector/shuffler 는 **주입**받으며 import 하지 않는다 — ARCHITECTURE.md 확인), `render-html → contracts, content-model`, `exporters/* → contracts, content-model, render-html`(storage 금지). 위반이 실제로 잡히는지 임시 위반으로 확인하고 지워라.
- 모든 모듈은 순수(Math.random/Date/node:crypto/파일·네트워크 금지, 시각·ID 는 인자로 주입).

## 4A-1. content-model 보강
- `canonicalJson(value: unknown): string` 를 export(키 정렬, undefined 제외 — 기존 내부 함수를 공개). 
- `plainTextOfExam`… 같은 것은 만들지 말고, 필요한 유틸만 최소로.

## 4A-2. src/modules/exam-snapshot
`buildSnapshot(input): { snapshot: ExamSnapshot; diagnostics: Diagnostic[] }`
input: `{ exam: SelectedExam; rules: RuleSet; examIndex: number; seed: string; title: string; examId: string; createdAt: string; assets: Readonly<Record<string, AssetData>>; blankPlacement?: 'slot' | 'end' }`.
- 번호: `rules.startNumber + index`. 선지 라벨은 위치로 만든 원문자(①~⑩). 선지가 10개를 넘으면 error 진단 `LABEL_OVERFLOW`.
- `SnapshotItem`: `sourceQuestionId`, `passage`, `stem`, `choices[{label, content, sourceChoiceId}]`, `answerLabels`(정답 선지의 **현재 위치** 라벨, 오름차순), `explanation`, `objectiveCode`, `grade`. 블록은 깊은 복사한다.
- **빈 번호**: `exam.blanks` 의 각 항목마다 `count` 개의 `{ blank: true, number, sourceQuestionId: '', stem: [], choices: [], answerLabels: [], explanation: [] }` 항목. 배치: `blankPlacement: 'slot'`(기본)이면 해당 슬롯(`rules.slots` 순서)의 마지막 문제 바로 뒤, 문제 순서가 섞여 슬롯 경계를 알 수 없으면(문제들의 `slotOfQuestion` 이 슬롯 순서대로 연속이 아님) 자동으로 `'end'`(맨 뒤)로 처리. `'end'`면 항상 맨 뒤. 번호는 최종 배치 순서대로 연속.
- 자산: 모든 블록(지문·본문·선지·해설, 표 안 중첩 포함)의 이미지 assetId 를 모아 `snapshot.assets` 에 `AssetData` 복사. 누락된 asset 은 error 진단 `ASSET_MISSING`(문제 ID, assetId, "이미지를 다시 가져오세요" 안내)이고 스냅샷은 계속 만든다.
- `contentHash`: `sha256Hex(canonicalJson({ items, assets: 각 asset 의 { id, mime, sha256 } }))` (content-model 의 함수 사용. asset 의 base64 데이터 자체는 해시에 넣지 말고 `sha256` 필드를 사용하되, **asset 데이터를 실제로 sha256Hex 해서 `sha256` 필드와 일치하는지 검증**하고 불일치하면 error `ASSET_HASH_MISMATCH`).
- 결과 snapshot 은 **깊은 동결(deep freeze)**. `schemaVersion: 1`.
- `verifySnapshot(snapshot): Diagnostic[]`: contentHash 재계산 일치, 번호 연속, 라벨이 위치 순서의 원문자, answerLabels 가 존재하는 라벨, 이미지 참조 asset 존재, 빈 번호 항목의 필드가 비어 있음. 위반은 error 진단(한국어).
- 테스트: 번호/라벨/정답 라벨(섞인 뒤 위치 기준), 빈 번호 두 가지 배치, 누락 asset, 같은 입력 → 같은 해시, 선지 하나 바꾸면 해시가 바뀜, 동결(수정 시도 시 TypeError), verifySnapshot 이 변조(내용 수정한 복사본)를 잡음, 중첩 표 안 이미지 asset 수집, 입력 불변.

## 4A-3. src/modules/generation
```ts
generateExams(input: {
  rules: RuleSet; candidates: Question[]; assets: Readonly<Record<string, AssetData>>; history: HistoryEntry[];
  seed: string; shuffle: ShuffleOptions; shufflerId?: string /* 기본 'standard' */;
  titleTemplate: string /* '{회차}' 치환, 예: '구강해부학 모의고사 {회차}회' */;
  createdAt: string; examIdPrefix: string;
}, deps: { selector: Selector; shufflers: readonly Shuffler[] }): GenerationResult
```
GenerationResult: `{ snapshots: ExamSnapshot[]; diagnostics: Diagnostic[]; historyEntries: HistoryEntry[]; ok: boolean }` (`ok` = error 진단 없음).
- 흐름: `selector.precheck` 진단 수집 → `selector.select(rules, candidates, { rng: createRng(seed).fork('select'), history })` → 각 회차 `shuffler.apply(exam, shuffle, rng.fork('shuffle/exam'+i))` → `buildSnapshot`(examId = `${examIdPrefix}-${i+1}`) → `verifySnapshot` 진단 포함 → `historyEntries`(회차별 questionIds, 빈 번호 제외, title/seed/ruleSetId 포함).
- shufflerId 를 못 찾으면 error 진단 `SHUFFLER_NOT_FOUND`(없는 id 와 사용 가능한 id 목록) 후 중단. select 결과에 error 가 있으면 스냅샷을 만들지 않고 중단(빈 번호 warn 은 정상 진행).
- `rules.examCount` 회차 모두 생성. 같은 입력(+같은 seed) → 스냅샷 전체(해시 포함)가 항상 동일. 다른 seed → 다르게.
- 입력 불변. 테스트(가짜 selector/shuffler 주입 테스트 + `createSelector(standardConstraints)`/`standardShuffler` 실제 조합 테스트 모두): 결정성, 회차 수, 제목 치환, history 항목, shuffler 없음, select 오류 시 중단, 빈 번호 있는 규칙에서도 진행, precheck 진단 전달.
- ※ generation 은 selector/shuffler 구현을 import 하지 않는다. 실제 조합 테스트는 `tests/` 아래(예: `tests/e2e/`)에서 한다.

## 4A-4. src/modules/render-html
순수 HTML 문자열 생성. 화면 미리보기와 PDF 출력이 **같은 함수**를 쓴다.
- `renderBlocks(blocks: Block[], ctx: { assets: Record<string, AssetData> }): string`:
  - 문단 → `<p>`; run 서식 → `<u>`, `<strong>`, `<em>`, `<sup>`, `<sub>` (밑줄은 반드시 `<u>`); `\n` → `<br>`; `\t` → `&emsp;`; 연속 공백 보존(`white-space: pre-wrap`); **모든 텍스트와 속성은 HTML 이스케이프**(스크립트 주입 불가).
  - 이미지 → `<img src="data:{mime};base64,…" width height alt>`; mime 은 png/jpeg/gif/webp/bmp 만 허용(그 외는 `[지원하지 않는 이미지]` 자리표시), asset 없으면 `[이미지 없음]` 자리표시(경고 클래스).
  - 표 → `<table class="qb-table">` (중첩 가능, 셀 안 블록 재귀). 1×1 표는 `class="qb-box"` 를 추가해 박스(보기 상자)로 보이게.
- `renderExamHtml(snapshots: ExamSnapshot[], options: { parts: ExportPart[]; combineParts: boolean; templateId: string; fontFaceCss?: string }): { part: ExportPart | 'combined'; examId: string | null; title: string; html: string }[]`:
  - `ExportOptions`(contracts)와 호환. combineParts=true 면 회차마다(또는 전체 한 문서) 문제→정답→해설을 이어서, false 면 파트별 문서. 반환 항목은 파일 하나에 해당(`examId`/`title` 은 파일명 만들 때 쓰임; 여러 회차를 한 문서로 합치지는 말고 **회차별로 문서를 만든다**).
  - 템플릿 `'standard'`: A4, 여백 18mm, 본문 `'Noto Serif KR','바탕','Batang',serif` 10pt, 제목 `'Noto Sans KR','맑은 고딕','Malgun Gothic',sans-serif`. 상단 제목 + 성명/점수 칸(문제지만). 문제지는 CSS 다단(2단, `column-rule`), 문항 `break-inside: avoid`, 번호는 굵게, 선지는 한 줄에 하나(`ul` 아님, 라벨 + 내용), 예문(passage)은 문제와 같은 블록 안에 들여쓴 영역으로, `@page`/인쇄 CSS 포함. `fontFaceCss` 가 주어지면 `<style>` 앞에 삽입(앱이 번들 폰트를 data URI 로 줄 예정).
  - 정답지: 번호-정답 표(5쌍 단위 격자), 빈 번호는 "—". 해설지: 번호, 정답, 해설 블록, 학습목표. 빈 번호 문항은 문제지에 "(출제 가능한 문제가 없어 비워 둔 번호입니다)" 점선 박스.
  - 알 수 없는 templateId → 'standard' 로 대체하고 진단을 돌려주지 말고(순수 문자열 함수) 문서 `<head>` 에 주석 대신, 별도 `resolveTemplate(templateId): { id; usedFallback: boolean }` 를 export.
  - 같은 입력 → 같은 HTML(결정적). 외부 리소스 참조(http/https/file) 없음 — 자기완결.
- 테스트: 이스케이프(`<script>`, 따옴표, `&`), 서식 태그, 밑줄 보존, 중첩 표·1×1 박스, 이미지 data URI·허용 안 되는 mime·누락 asset, 빈 번호 박스, 정답 격자, 해설 구조, 파트 조합(combine true/false) 문서 수, 외부 URL 없음, 결정성, **텍스트 일치 검사**(HTML 태그를 제거해 만든 텍스트에 스냅샷의 모든 문항 stem/선지/passage/해설 텍스트가 순서대로 들어 있음 — 테스트용 `htmlToPlainText` 헬퍼를 `tests/fixtures/htmlText.ts` 로 만들어 export).

## 4A-5. 종단 무결성 테스트 (가장 중요) — tests/e2e/exam-integrity.test.ts
가짜 문제은행(과목 2개, 문제 300개: 지문 이미지·표·텍스트박스형 1×1 표·밑줄 서식·고정 선지·lock-all·복수 정답 포함, 학습목표 `과목 {단원}-{중단원}-{번호}`)으로 `createSelector(standardConstraints)` + `shufflers` + `generateExams` 를 실제 조합해 시드 100개 이상 반복:
 1. 모든 스냅샷에 대해 `assertSnapshotMatchesSource(snapshot, sourceQuestionsById)` (이 함수를 `tests/e2e/assertSnapshotMatchesSource.ts` 로 만들어 export — 이후 exporter 테스트가 재사용): 각 항목의 `passage`/`stem`/`explanation` 이 원본과 `blocksEqual`(아니, **깊은 동일** — 정규화 없이 원본 그대로) 이고, 선지 집합이 원본과 같으며(ID↔content), `answerLabels` 가 가리키는 선지의 content 가 원본 정답 선지의 content 와 같고, `fixedPosition` 선지의 위치가 원본 위치와 같으며, 번호가 연속이고, `verifySnapshot` 이 빈 배열.
 2. 4개 회차 전체에서 같은 `sourceQuestionId` 가 두 번 나오지 않음, 같은 지문(`questionContentKey`) 두 번 나오지 않음.
 3. 같은 시드 두 번 → 스냅샷 JSON 완전 동일(해시 포함).
 4. 빈 번호가 생기는 규칙(후보 부족)에서도 위 검사가 통과하고 빈 번호 항목이 있음.
 5. **일부러 훼손한 스냅샷**(지문 한 글자 변경, 정답 라벨 이동, 선지 내용 교체)을 `assertSnapshotMatchesSource` 가 실패로 잡는 메타 테스트.

## 마무리
- `docs/STAGE4A.md`: 모듈 사용법, 번호·빈 번호 배치 규칙, 한계(예: 지문 묶음 `PassageGroup` 의 공용 지문 렌더링은 아직 미지원 — 데이터에 아직 없음), 폰트는 `fontFaceCss` 로 주입.
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과. AGENTS.md 최종 보고 형식으로 보고(계약 변경 요청, 못 한 것 포함).
