# 작업: 가져오기 화면에 "문제집 + 정답집" 연결 (과목 자동 등록·기본 출제 규칙·검수 표 페이지 나누기)

먼저 `AGENTS.md` 를 읽고 따른다(형식 Prettier, 파일 분리 ≤ 약 300줄, 테스트 필수, `docs/DESIGN.md` 토큰, 한국어 메시지). git commit/push 는 하지 않는다.
**`src/contracts/index.ts` 수정 금지**(필요하면 "계약 변경 요청"). 실제 문제 파일(`문제 디비/`, *.pdf, *.docx)은 읽지 않는다. 테스트는 `tests/fixtures/workbook.ts` 의 가짜 책을 쓴다.
PowerShell 에서 파일은 `Get-Content -Encoding UTF8`, npm 은 `npm.cmd`.

## 배경
`src/modules/workbook/` (문제집 줄 배열 + 정답집 줄 배열 → `ImportDraft`, 문제마다 `subject` 가 카탈로그 id) 와 `src/modules/subject-catalog/` (21과목) 가 이미 있다(먼저 읽는다: `index.ts`, `types.ts`, 테스트).
이제 앱에서 사용자가 **문제집 PDF 2권 + 정답집 PDF 1권을 한꺼번에 골라** 가져오면 문제·선지·정답·해설·학습목표가 합쳐져 검수 표에 나오고 저장되게 한다. 한 번에 **3,600문제 이상**이 나온다. 과목은 21개이고 앱에는 지금 `law`, `anatomy` 2개만 등록돼 있다.
**가장 중요한 규칙: 문제의 지문·문제·선지·정답·해설이 서로 섞이지 않는다.** 이미 모듈이 짝을 맞춘다. 이 단계에서 내용을 바꾸지 않는다.

## 해야 할 일
### 1. PDF 글자 읽기를 서비스에서 쓸 수 있게
- `src/modules/importers/index.ts` 에서 `extractPdfLines`(이미 `pdf/extract.ts` 에 있음)와 `PdfReadError` 를 export 한다(다른 import 경로는 늘리지 않는다).

### 2. 가져오기 옵션: 과목 "자동"
- `src/app/shared/import.ts`: `ImportOptions.subject` 에 특수값 `'auto'` 를 허용하고 상수 `WORKBOOK_SUBJECT = 'auto'` 를 export. 과목 선택 칸(`ImportOptionsPanel.tsx`)의 **첫 항목**으로 `문제집 + 정답집 (과목 자동)` 을 넣는다. 선택하면 칸 아래에 보조 설명: `문제집 PDF 와 정답집 PDF 를 함께 고르세요. 과목은 PART 제목으로, 정답·해설·학습목표는 정답집에서 읽습니다.` 이때 `A 등급만`(등급 필터)과 `같은 지문은 첫 문제만` 옵션은 숨기거나 비활성(이 모드에서는 쓰지 않음)하고, `학습목표 없는 문제 제외`·`해설에 선지 번호가 있으면 선지 고정` 옵션은 그대로 쓴다.
- `import-review.ts` 의 `validateOptions` 가 `'auto'` 를 받아들이게 한다(기존 과목 검증은 유지).
- 드롭 영역 문구(ImportScreen)는 `auto` 일 때 `문제집 PDF 와 정답집 PDF 를 한꺼번에 놓으세요` 로 바뀐다.

### 3. 분석(`src/app/main/services/import.ts`, 이미 230줄이므로 새 파일로 나눈다: `import-workbook.ts`)
- `options.subject === 'auto'` 이면:
  1. 모든 경로를 읽고(기존 `readImportFile`: 50MB 상한, 확장자) **PDF 가 아닌 파일이 있으면 오류**: `문제집·정답집 가져오기는 PDF 파일만 고를 수 있습니다: <파일명>`.
  2. 각 PDF 를 `extractPdfLines` 로 읽고 진행 표시(`onProgress`: `{file, label: '글자 읽는 중', done, total}` — 가능하면 쪽 단위, 어렵다면 파일 단위)를 낸다. 읽기 실패(`PdfReadError`)는 파일명을 넣은 한국어 오류.
  3. `detectBook(lines)` 로 문제집/정답집을 가린다. `unknown` 이 있으면 `<파일명>은 문제집도 정답집도 아닌 것 같습니다. '001 〉〉〉 정답 ③' 형태의 정답집과 번호·선지가 있는 문제집 PDF 를 고르세요.` 문제집이 없거나 정답집이 없으면 각각 안내(`정답집 PDF 도 함께 고르세요 …`).
  4. `buildWorkbookDraft({questionBooks, answerBooks}, {requireObjective, lockChoicesOnReference})` 를 부른다(옵션은 화면 옵션을 전달). 결과 하나의 draft 를 기존 검수 흐름(review 만들기)에 넣는다. `review.files` 는 입력 PDF 마다 한 줄(이름, 종류 `문제집`/`정답집`, 문제 수는 문제집은 그 책에서 나온 문제 수, 정답집은 0, skipped 는 문제집만)로 보여준다 — `ImportReview.files` 의 모양을 바꾸지 말고 `name` 에 `(문제집)`/`(정답집)` 을 붙이는 정도로 한다.
  5. **중복 판정(은행·배치) 규칙이 이 모드에서는 다르다.** 같은 문제 본문이 **선지만 다른 변형**으로 여러 번 나오는 책이므로, 본문(stem) 만으로 중복 처리하면 변형 문제가 사라진다. 이 모드에서는 중복 키를 `questionContentKey(question)` + 선지 글자 전체(정규화: 공백 제거) 로 하고, 배치 안 중복 제외(`DUPLICATE_IN_BATCH`)는 이 키가 같을 때만, 은행과의 중복(`DUPLICATE_IN_BANK`)도 같은 키로 비교한다(은행의 모든 과목 문제와 비교: `storage.questions.query({})`). 일반 과목 선택 모드의 동작은 그대로.
  6. 3,600개 이상에서도 느리지 않게: 은행 문제 키를 한 번만 만들어 Map 으로 비교한다.
- 이 서비스의 의존성 주입: `deps.readPdfLines?: (data: Uint8Array) => Promise<{ lines: string[]; pages: number }>` (기본값은 `extractPdfLines`) — 테스트에서 가짜 줄 배열을 넣을 수 있게.

### 4. 저장(commit) 시 과목·기본 규칙 자동 등록
- `commit` 에서 저장하는 문제들의 `subject` 중 **설정의 과목 목록에 없는 것**을 모아 `deps.ensureSubjects(ids)` 를 **문제를 저장하기 전에** 부른다(실패하면 저장하지 않고 오류).
- `src/app/main/index.ts` 에서 `ensureSubjects` 를 이렇게 연결한다: 카탈로그에서 해당 id 의 `{id, name}` 을 설정의 `subjects` 끝에 추가(`settings.update({ subjects })`, 이미 있으면 건너뜀), 그리고 `rulesService.ensureSubjectRules(ids)` 로 기본 출제 규칙을 만든다.
- `src/modules/rules/index.ts` 에 `subjectRuleSet(subject: CatalogSubject): RuleSet` 추가: `id: subject.id`, `name: subject.name`, `subject: subject.id`, `examCount: 4`, `startNumber: subject.startNumber`, 슬롯 1개 `{ id: `${subject.id}-all`, label: `${subject.name} 전체`, count: subject.examCount(문항수), filter: { kind: 'objectivePrefix', prefixes: [subject.prefix] } }`, 제약 `no-overlap-across-exams`(scope all)·`no-duplicate-content`(scope run), `note: '국시원 문항 수 기준의 기본 규칙입니다. 단원별 배분이 정해지면 슬롯을 나누어 고치세요.'`. (`law`, `anatomy` 는 기존 `presetRuleSets()` 그대로 — `subjectRuleSet` 로 대체하지 않는다.) `.dependency-cruiser.cjs` 에서 `rules` → `subject-catalog` 의존을 허용한다.
- `src/app/main/services/rules.ts`: `ensureSubjectRules(ids: string[])` — 이미 그 과목(`subject === id`)의 규칙이 하나라도 있으면 건너뛰고, 없을 때만 `subjectRuleSet` 을 저장한다(사용자가 지웠거나 고친 규칙을 덮어쓰지 않는다). 카탈로그에 없는 id 는 무시.
- 기존 사용자(설정에 2과목만 있음)가 업데이트한 뒤 처음 문제집을 가져올 때 21과목이 모두 생겨야 한다(위 흐름으로 충족).

### 5. 검수 표 페이지 나누기
- `ImportReviewTable.tsx` (`items.map` 으로 모든 행을 그린다)가 수천 행에서 느려지므로 **한 번에 100행씩 페이지로** 보여 준다: 표 위/아래에 `이전`·`다음`·`N / M 쪽`·`전체 N개`. 행 번호(`index`)는 전체 기준 그대로. 상태 필터(전체/오류/경고/제외/정상 — 이미 있으면 재사용, 없으면 간단히 추가)가 있으면 필터 후 페이지를 센다. 키보드 이동(↑↓)·펼치기·포함/제외는 현재 페이지 안에서 동작하고 페이지 끝에서 이전/다음 쪽으로 넘어가게 하거나 최소한 깨지지 않게 한다.
- 일괄 동작이 필요하다: 검수 표 위에 `보이는 목록 모두 포함`/`제외`가 이미 있으면 필터 결과 전체에 적용되는지 확인하고, 없으면 만들지 않는다(범위 밖).
- 순수 함수(페이지 나누기·필터)는 파일로 분리하고 `review.test.ts` 방식으로 시험한다.

### 6. 저장 결과 안내
- 저장 후 토스트(`ImportSavedToast`)에 `N문제를 저장했습니다. 새로 등록된 과목: …` 처럼 새 과목이 생겼으면 알린다(`ImportCommitResult` 를 바꾸지 말고 화면 쪽에서 `settings` 비교 또는 `commit` 결과에 선택적 필드 `newSubjects?: string[]` 를 `app/shared/import.ts` 에 추가해도 된다).

## 테스트
- `import-workbook` : 가짜 책(`tests/fixtures/workbook.ts`)으로 `analyze({options:{subject:'auto'}, paths})` 전체 흐름(가짜 `readPdfLines` 주입, 임시 파일 경로 사용: 기존 import 서비스 테스트 방식을 따른다): 문제 수·과목·정답·해설이 문제별로 짝이 맞음, PDF 아닌 파일 오류, 정답집만/문제집만 오류, unknown 파일 오류, 같은 본문·다른 선지 변형이 중복으로 사라지지 않음, 같은 본문·같은 선지만 중복 처리(배치/은행), 일반 모드 중복 동작 불변.
- `commit`: 새 과목이 설정에 추가되고 기본 규칙이 만들어짐(이미 규칙이 있는 과목은 건드리지 않음), 두 번째 가져오기에서 중복 추가 없음, `ensureSubjects` 실패 시 문제가 저장되지 않음.
- `rules`: `subjectRuleSet` 모양(슬롯 수·count·prefix·startNumber)과 카탈로그 21과목 전부에서 유효(`rules.check` 같은 기존 검증을 통과).
- 화면 순수 함수: 페이지 나누기 경계(0개, 100개, 101개, 마지막 쪽), 옵션 `auto` 일 때 숨기는 옵션 목록.
- 기존 테스트 전부 통과.

## 마무리
`npm.cmd run format`, `format:check`, `typecheck`, `lint:deps`, 전체 `npm.cmd test`, `npm.cmd run build` 통과. (실제 Electron 창은 띄우지 않는다.)

## 최종 보고 형식
1. 만든/수정한 파일 2. 실행한 명령과 결과 3. 못한 것·막힌 것·가정 4. 계약 변경 요청
