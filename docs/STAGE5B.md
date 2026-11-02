# 5B단계 — 공용 문서 해석과 가져오기 검수

## 구조와 규칙을 바꾸는 곳

`layout-parser/index.ts`의 `parseLayout(blocks, profile, options, locatedDiagnostics?)`가 형식과 무관하게 문제 레코드를 만든다. 입력 `LayoutBlock`은 내용 블록·평문·원문 위치(`sourceIndex`, 1부터 시작)·종류와 선택적 자동 원문자 정보를 가진다. 표·상자·이미지는 문제 경계 판정에서 제외한다. 출력은 `DraftQuestion[]`, 진단, 사용 자산 ID이며 자산 바이트는 취급하지 않는다. 입력과 입력 진단은 변경하지 않는다.

| 바꿀 내용 | 파일 |
|---|---|
| 문제 번호·태그·선지·정답·해설·목표 양식 | `src/modules/layout-parser/profile.ts` |
| 앞보기, 문제 경계, 내용 분류, 고정 선지, 위치 진단 연결 | `src/modules/layout-parser/records.ts` |
| 등급·목표 필터, 첫 지문만 유지, 번호 참조에 따른 선지 고정, 진단 인덱스 재연결 | `src/modules/layout-parser/index.ts` |
| Word의 XML·이미지·자동 번호·텍스트박스·수식 변환 | `src/modules/importers/docx/` |
| PDF 복사 텍스트의 줄 보정 | `src/modules/importers/text/cleanup.ts` |

`LayoutProfile`, `standardProfile`, `validateProfile`은 layout-parser가 소유하며 기존 docx·importers 공개 진입점에서 같은 이름으로 다시 export한다. 선택 필드 `explanationNumberPattern`을 추가했다. 기존 DOCX 테스트 73개는 기대값과 소스를 바꾸지 않았다. Word 고유 처리도 XML·미디어·번호·블록 읽기로 파일을 나눴다.

의존 규칙은 `layout-parser → contracts, content-model, objective-code`, `importers/* → contracts, content-model, layout-parser`다. 계약 파일은 그대로이며 앱 검수 타입은 `app/shared/import.ts`에 있다.

## 텍스트 해석

`textImporter`는 id `text`, 확장자 `.txt`이며 UTF-8을 엄격하게 디코딩한다. 잘못된 바이트는 한국어 `TEXT_INVALID`로 안내한다. `parseQuestionText(text, options)`는 동기 붙여넣기 API이며 `profile`을 교체할 수 있다. UTF-8 BOM을 제거하고 CRLF·CR을 LF로 통일한 뒤 줄을 문단으로 만들고 동일한 layout-parser를 호출한다.

`pdfCopyCleanup`은 기본 true다.

- 원문자가 ①부터 순서대로 나타나는 한 줄은 선지별로 나눈다. 문제 본문이 선지 앞에 있으면 그 부분도 별도 줄로 둔다. 순서가 다르거나 정답·해설·목표·태그 라벨 줄이면 나누지 않는다.
- 번호·선지·정답·해설·목표·태그로 시작하지 않는 줄이 본문·선지·해설 뒤에 이어지면 공백 하나로 잇는다. 빈 줄은 연결 경계로 남긴다. 연결된 블록은 첫 줄의 원문 위치를 유지한다.
- 원문자 주위 NBSP·전각 공백을 일반 공백으로 정리한다. 쪽 번호 단독 줄과 반복되는 라벨 없는 텍스트는 삭제하지 않고 `PDF_ARTIFACT_SUSPECTED` 경고만 낸다. 경고는 검수의 문서 전체 진단에서 확인한다.

`parseExplanationText(text, profile?)`는 `1. 해설…`, `01) …`, `[해설] 1번 …` 형태로 나누고 번호 문자열과 여러 해설 블록을 반환한다. 앞자리 0은 보존한다. 번호 없는 서문은 포함하지 않는다. 번호 패턴은 프로파일의 `explanationNumberPattern`으로 교체한다. 문제 추가 화면 연결은 5C 범위다.

## 가져오기 흐름과 IPC

1. 과목 선택 → Word·텍스트 여러 파일 선택 또는 끌어놓기. 파일 선택 대화상자는 main에 있고, 드롭 경로는 preload의 `webUtils.getPathForFile`로 얻는다.
2. `import.analyze({paths, options})`: 로컬 절대 경로·존재·일반 파일·확장자·50MB 이하 확인 → registry의 importer 선택 → standardValidators → 은행 중복 검사 → main 메모리 배치 보관. 경로 오류는 요청 전체를 실패시키며 파싱 실패는 파일명이 붙은 전체 진단으로 표시한다.
3. 검수 표: 정상·경고·오류·제외 집계, 별도의 `SKIPPED_*` 목록, 은행 중복 필터, 원문 위치·목표·등급·본문 앞 80자·이미지/지문 표시. 행을 펼치면 render-html 공용 미리보기와 진단·수정 입력을 표시한다.
4. 수정은 renderer 상태에 보관한다. ↑↓ 이동, Enter 펼치기, Space 포함/제외를 지원한다. 학습목표는 objective-code로 확인하며 읽을 수 없는 코드는 앱 검수 오류로 처리한다. 기존 목표 누락·비표준 형식 validator의 경고 정책은 유지한다.
5. `import.commit({batchId, patches})`: 패치 형식·범위·중복 확인 → 목표·등급·고정·포함 변경 → 재검증 → 오류와 제외 항목은 사유 반환 → 사용 자산 저장 → `questions.upsertMany`. main에서 `crypto.randomUUID`와 주입 시계를 사용하고 원래 항목 순서에 따라 1ms씩 증가시킨다. `extra.importBatchId`, `extra.sourceFile`을 보존한다.
6. 성공 배치는 폐기한다. 저장 토스트의 실행 취소는 10초 동안 `bank.deleteMany(savedIds)`로 이번 저장 문제만 삭제한다. 문제은행에서 보기는 `bank?batch=<id>`로 연결한다. `import.discard(batchId)`는 저장 없이 배치를 버린다. 화면을 떠나거나 취소해도 배치를 폐기한다.

`import.pickFiles`, `import.analyze`, `import.commit`, `import.discard`, `bank.deleteMany`는 기존 IPC의 주 창·주 프레임 검증과 한국어 `Result` 오류 변환을 공유한다. `pathsForFiles`는 preload 내부 변환이며 IPC 채널이 아니다.

## 은행 중복 정책

같은 과목의 기존 문제를 `questionContentKey`로 비교한다. 선지가 달라도 본문·예문이 같으면 warn `DUPLICATE_IN_BANK`에 기존 문제 ID와 학습목표를 넣고 기본 제외한다. 이미 은행에 저장된 쪽을 먼저 유지한다. 여러 파일 사이에서도 먼저 분석한 파일의 문제를 남긴다. 사용자가 포함을 명시하면 중복도 저장할 수 있다. 문서 안 중복은 importer의 기존 `SKIPPED_DUPLICATE_PASSAGE` 정책을 따른다.

## 캡처 확장

이 환경에서는 Electron 실행·화면 캡처를 수행하지 않았다. 아래는 검수자가 사용할 설정 예시이며 실제 문제 경로는 포함하지 않았다.

```powershell
$env:QB_DATA_DIR = 'D:\검수용데이터'
$env:QB_CAPTURE_DIR = 'D:\검수용캡처'
$env:QB_CAPTURE_IMPORT_FILES = 'D:\검수용입력\가짜.docx;D:\검수용입력\가짜.txt'
$env:QB_CAPTURE_IMPORT_SUBJECT = 'law'
npm.cmd run build
npm.cmd run capture
```

두 가져오기 환경변수는 함께 지정한다. main이 먼저 분석하고 검수 결과만 캡처 화면에 전달한다. 기존 32장과 별개로 `import-review-{light|dark}-{1360x840|1100x700}.png` 4장을 저장한다. 첫 경고 행을 펼쳐 보이는 위치로 스크롤하고 경고가 없으면 첫 행을 펼친다. 미리보기 준비 이후 캡처한다. 캡처 보고서에도 추가 대상이 포함된다. 실제 저장은 하지 않는다.

캡처 모드만 앱 준비 전에 `CalculateNativeWinOcclusion`을 비활성화하고 renderer backgrounding·timer throttling을 끄며 `backgroundThrottling: false`를 설정한다. 앱 준비·문서 로드·JavaScript 실행·준비 확인·글꼴과 두 프레임 대기·PNG 캡처·오류 조회에 시간 제한이 있다. 기본 단계 제한은 10초, 가져오기 분석 제한은 60초다. 시간 초과는 보고서의 오류이며 종료 코드는 1이다. 단일 실행 잠금 실패는 요청한 한국어 안내를 보고서에 즉시 쓰고 코드 1로 종료한다.

## 한계와 검수 범위

- PDF 자동 읽기·OCR·클립보드 이미지·문제 추가 편집기는 이번 범위 밖이다. 복사 텍스트만 처리한다. 표·이미지 배치는 텍스트 붙여넣기로 복원할 수 없다.
- PDF 보정은 보수적인 휴리스틱이다. 정상 본문의 반복 줄도 머리글 의심 경고를 받을 수 있고 원문자 순서가 선지 모양인 본문은 나뉠 수 있다. 원본 내용은 미리보기에서 확인하고 필요한 경우 보정을 끈 API 또는 원본 텍스트 수정으로 처리한다.
- 은행 중복은 분석 시점 기준이다. 분석 이후 별도 배치에서 같은 지문이 저장되면 이 배치에는 새 중복이 반영되지 않는다.
- 자산 저장 후 문제 일괄 저장이 실패하면 자산만 남을 수 있다. 재시도는 가능하며 문제 저장은 storage의 트랜잭션을 사용한다. 실행 취소는 문제만 삭제하고 공유될 수 있는 자산은 보존한다.
- 배치는 프로세스 메모리에만 있고 앱 종료 후 복구되지 않는다. 오류 항목도 저장 결과와 함께 배치가 폐기되므로 다시 분석해야 한다.
- 화면·키보드·최소 창 크기·라이트/다크 시각 검수는 검수자가 수행한다. renderer는 타입 검사·정적 렌더 테스트·CSS 토큰 검사·빌드로 검증한다.
- 실제 문제 파일·금지 폴더 접근, 네트워크 설치, git commit/push는 하지 않았다. 사용자 변경인 `docs/NEXT.md`, `docs/prompts/stage5b.md`는 그대로 둔다. 계약 변경 요청은 없다.

## 검사 결과와 파일 목록

중간 검사에서 발생한 실패도 아래에 남긴다. 테스트 기준을 낮추거나 기존 DOCX 기대값을 바꾸지 않았다.

- 최초 앱 연결 뒤 `npm.cmd run typecheck`는 bank 메서드를 잘못 놓은 위치와 진단 ref 추론 오류로 실패했다. 서비스 위치와 명시적 진단 타입을 수정한 뒤 통과했다.
- 새 단위 테스트 최초 실행(`npx.cmd vitest run ...`)은 텍스트 보정이 공백을 늘리는 문제와 과목 순서 변경에 따른 이전 bank 기대값으로 42개 통과·2개 실패였다. 공백 보정을 수정하고 bank 테스트를 설정 순서 정책에 맞췄다. DOCX 테스트는 수정하지 않았다.
- 검수 정적 렌더 검사(`npx.cmd vitest run ...`)는 HTML의 `tabindex`를 테스트에서 `tabIndex`로 비교해 25개 통과·1개 실패였다. HTML 속성 표기를 고친 뒤 통과했다.
- 첫 `npm.cmd test` 전체 실행은 66개 파일·594개 테스트, 107.52초로 통과했다. 이후 보완을 포함한 재검사에서는 기존 선택기 성능 테스트 한 개가 precheck 740.85ms로 300ms 기준을 넘어 593개 통과·1개 실패, 종료 코드 1이었다. 빌드·타입 검사를 함께 실행한 상태였으며, 선택기와 제한값은 그대로 두고 나머지 검사를 끝낸 뒤 전체 테스트를 단독 재실행했다.
- 임시 `layout-parser → storage` import를 넣은 `npm.cmd run lint:deps`는 의도대로 위반 1개를 검출하고 종료 코드 1이었다. 임시 파일은 finally에서 삭제했다.

| 최종 명령 | 결과 |
|---|---|
| `npm.cmd test` (단독 실행) | 통과, 66개 파일·594개 테스트, 95.27초, 종료 코드 0. 앞서 실패한 성능 항목도 precheck 191ms로 통과 |
| `npm.cmd run format` | 통과, 종료 코드 0 |
| `npm.cmd run typecheck` | 통과, root·web·node, 종료 코드 0 |
| `npm.cmd run lint:deps` | 통과, 247개 모듈·722개 의존·위반 0, 종료 코드 0 |
| `npm.cmd run format:check` | 통과, 종료 코드 0 |
| `npm.cmd run build` | 통과, main·preload·renderer·로컬 글꼴, 종료 코드 0 |
| `git diff --check` | 통과, 종료 코드 0 |
| `git diff --exit-code -- src/contracts/index.ts` | 통과, 계약 변경 없음, 종료 코드 0 |

아래는 변경한 68개 파일 경로 전체다. A 신규, M 수정, D 이전 경로 삭제다. 공용 미리보기 세 컴포넌트와 CSS는 bank에서 components로 이동했다. 빌드 산출물은 목록에서 제외한다.

```text
M	.dependency-cruiser.cjs
M	docs/ARCHITECTURE.md
A	docs/STAGE5B.md
M	src/app/main/capture.test.ts
M	src/app/main/capture.ts
M	src/app/main/index.ts
M	src/app/main/ipc.test.ts
M	src/app/main/ipc.ts
M	src/app/main/services/bank.test.ts
M	src/app/main/services/bank.ts
A	src/app/main/services/import-review.ts
A	src/app/main/services/import.test.ts
A	src/app/main/services/import.ts
A	src/app/main/startup.test.ts
M	src/app/preload/index.ts
A	src/app/renderer/components/PreviewFrame.module.css
A	src/app/renderer/components/PreviewFrame.tsx
A	src/app/renderer/components/PreviewPlaceholder.module.css
A	src/app/renderer/components/PreviewPlaceholder.tsx
A	src/app/renderer/components/QuestionPreview.module.css
A	src/app/renderer/components/QuestionPreview.tsx
M	src/app/renderer/components/SearchInput.module.css
M	src/app/renderer/components/index.ts
M	src/app/renderer/screens/bank/BankScreen.tsx
D	src/app/renderer/screens/bank/PreviewFrame.module.css
D	src/app/renderer/screens/bank/PreviewFrame.tsx
D	src/app/renderer/screens/bank/PreviewPlaceholder.module.css
D	src/app/renderer/screens/bank/PreviewPlaceholder.tsx
M	src/app/renderer/screens/bank/QuestionList.tsx
D	src/app/renderer/screens/bank/QuestionPreview.module.css
D	src/app/renderer/screens/bank/QuestionPreview.tsx
M	src/app/renderer/screens/bank/preview.test.ts
M	src/app/renderer/screens/bank/useBankData.ts
M	src/app/renderer/screens/home/HomeScreen.module.css
M	src/app/renderer/screens/home/HomeScreen.tsx
A	src/app/renderer/screens/import/ImportExpanded.module.css
A	src/app/renderer/screens/import/ImportExpanded.tsx
A	src/app/renderer/screens/import/ImportItemEditor.module.css
A	src/app/renderer/screens/import/ImportItemEditor.tsx
A	src/app/renderer/screens/import/ImportOptionsPanel.module.css
A	src/app/renderer/screens/import/ImportOptionsPanel.tsx
A	src/app/renderer/screens/import/ImportReviewTable.module.css
A	src/app/renderer/screens/import/ImportReviewTable.tsx
A	src/app/renderer/screens/import/ImportSavedToast.module.css
A	src/app/renderer/screens/import/ImportSavedToast.tsx
A	src/app/renderer/screens/import/ImportScreen.module.css
A	src/app/renderer/screens/import/ImportScreen.tsx
A	src/app/renderer/screens/import/index.ts
A	src/app/renderer/screens/import/review.test.ts
A	src/app/renderer/screens/import/review.ts
A	src/app/renderer/screens/import/useImport.ts
M	src/app/shared/api.ts
A	src/app/shared/import.ts
M	src/app/shared/index.ts
M	src/modules/importers/docx/index.ts
A	src/modules/importers/docx/media.ts
A	src/modules/importers/docx/numbering.ts
A	src/modules/importers/docx/reader.ts
A	src/modules/importers/docx/xml.ts
M	src/modules/importers/index.ts
A	src/modules/importers/text/cleanup.ts
A	src/modules/importers/text/index.ts
A	src/modules/importers/text/text.test.ts
A	src/modules/layout-parser/index.ts
A	src/modules/layout-parser/layout-parser.test.ts
A	src/modules/layout-parser/profile.ts
A	src/modules/layout-parser/records.ts
A	src/modules/layout-parser/types.ts
```
