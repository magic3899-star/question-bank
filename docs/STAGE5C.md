# 5C단계 — 문제 추가·편집과 PDF 복사 텍스트

## 편집기와 화면 연결

`screens/editor/`의 한 편집기를 `add`와 `edit?id=...`에 연결한다. 라우트 메타데이터는 shared의 기존 표에 있으며, app의 화면 조립에서 두 ID를 editor에 연결한다. 편집 라우트는 사이드바에서 숨긴다. 문제은행 머리글의 문제 추가, 상세의 편집·삭제, 해설 없는 문제 필터를 연결했다. 학습목표 트리 노드는 공용 components로 옮겨 은행과 편집기 대화상자가 같은 트리를 사용한다.

왼쪽은 기본 정보·붙여넣기·문제 줄·예문·선지·해설, 오른쪽은 공용 `PreviewFrame`과 검사 결과다. `render-html`의 같은 HTML을 sandbox iframe에 표시한다. 기존 디자인 토큰과 시스템/수동 다크 모드를 사용한다. 검사는 입력 변경 후 300ms에 main으로 요청하고 이전 요청의 늦은 결과는 버린다. 검사 중과 오류가 있으면 저장을 막고 이유를 표시한다. 진단을 누르면 관련 입력 영역으로 이동한다. 목표 누락은 경고, 해설 누락은 정보이며 저장할 수 있다. 정답 누락은 기존 `ANSWER_MISSING` 오류다.

선지는 2~10개이며 ID로 정답을 추적한다. 이동·추가·삭제·복수 정답·위치 고정을 지원한다. 번호는 위치에 따라 표시한다. 내용 앞의 원문자 번호는 main 검증에서 제거 안내와 함께 저장을 막는다. 본문·예문·해설의 원문자 참조는 자동으로 `lock-all`이 되고, 명시적 해제는 `extra.allowChoiceShuffle`로 유지한다. 해제 시 검증 경고를 표시한다. 다른 선지를 참조하는 선지에는 위치 고정 적용 버튼이 나온다.

저장 전에 main이 같은 과목의 `questionContentKey`를 비교하며 자기 자신은 제외한다. 중복이면 기존 문제를 자산과 함께 미리 보여주고, 확인 후 `force: true`로 재요청한다. 경고 확인과 중복 확인은 앱 안 Dialog다. 저장·삭제 토스트에서 새 문제 삭제 또는 이전 문제 복원으로 실행 취소한다. 계속 추가는 과목·목표·등급을 유지한다. 아직 처리하지 않은 묶음이 있으면 저장하고 다음/건너뛰기로 마무리한다.

현재 폼 또는 묶음에 저장하지 않은 문제가 있으면 앱 안 이동을 확인한다. 직접 해시 이동·뒤로 가기도 현재 화면으로 되돌린 후 앱 Dialog를 표시한다. main에는 dirty 상태를 IPC로 전달하며 창 닫기에서 Electron 확인 대화상자를 표시한다. 캡처 모드의 자동 라우트 이동과 종료에는 이 확인을 적용하지 않는다.

## 서식 모델과 블록

`lib/rich-text/index.ts`는 DOM을 사용하지 않는다. 편집기 모델은 `{ text } | { tag, children }` 트리이며 문단은 p/div, 줄바꿈은 br 또는 run의 `\n`이다. u, b/strong, i/em, sup, sub만 서식으로 해석한다. 나머지 태그·속성은 서식으로 남기지 않고 자식 글자만 보존한다. HTML 출력에서는 글자를 이스케이프한다. 중첩 서식은 합성하고 같은 서식의 인접 run을 병합하며 빈 run과 false 서식 속성을 제거한다. 공백과 `\n`은 보존한다. 빈 DOM 문단의 단독 br은 빈 문단으로 복원한다.

`RichTextField`만 DOM을 간단한 트리로 읽는다. contentEditable과 다섯 서식 버튼, Ctrl+U/B/I, textbox 라벨과 multiline 속성을 제공한다. 기본 붙여넣기는 항상 text/plain이다. 기존 문단 밖 이미지·표는 글자를 고칠 때에도 보존한다. `BlockListEditor`는 문단·1×1 보기·표·이미지의 추가/삭제/이동과 표의 마지막 행/열 추가/삭제를 제공한다. 셀은 RichTextField다. 이미지 파일 선택과 이미지 클립보드 붙여넣기를 지원한다. 파일/클립보드 이미지는 main의 MIME·시그니처·10MB 제한 검사를 거쳐 sha256 기반 ID를 받고, 실제 저장 시 사용된 자산을 저장한다. 기존 가져오기 자산은 기존 ID와 바이트를 보존한다.

## 문제 붙여넣기와 해설 짝짓기

`editor.parseText`는 5B `parseQuestionText`를 목표·등급 필터와 문서 내부 중복 제외를 끈 상태로 호출한다. 문제집의 등급·목표 없는 문항도 초안으로 돌아온다. 이번 작업의 `extra.addBatchId`, 원래 번호 `extra.originalNumber`, 추가 순서 `extra.addOrder`를 보존한다. 정답은 추정하지 않는다. 각 문제와 전체의 해석 당시 진단을 표시한다. PDF 흔적 경고는 붙여넣기 전체 경고임을 밝히고 각 문제에서도 확인할 수 있다. 현재 수정 내용의 진단은 오른쪽 검사 패널에서 확인한다.

이미 내용이 있는 폼은 덮어쓰기를 확인한다. 한 문제를 기존 문제 편집기에 붙이면 기존 문제 ID·생성 시각을 유지한다. 여러 문제는 새 작업 묶음으로 연속 추가한다. 문제 목록에 원래 번호·앞부분·상태가 표시되고 저장하고 다음/건너뛰기로 진행한다. 새 문항 ID와 생성 시각은 실제 저장할 때만 부여한다.

해설 붙여넣기는 `parseExplanationText` 결과와 별도의 정답 위치를 반환한다. 앞자리 0을 포함한 번호 문자열을 정확히 비교하고, 원래 번호가 없으면 추가 순서를 사용한다. 짝짓기 표에는 문제 앞부분·해설 앞부분·정답 번호·일치 여부를 표시한다. 짝 없는 문제/해설과 중복 번호는 구별하며, 모호한 짝은 적용하지 않는다. 정답 적용 체크는 기본 해제이며 사용자가 선택해야 기존 정답도 바꾼다.

확인하면 이번 묶음의 이미 저장된 문제는 `bank.applyExplanations`로 일괄 갱신하고 `updatedAt`을 바꾼다. main은 같은 묶음·번호·정답 범위를 모두 확인한 뒤 단일 `upsertMany`를 호출한다. 작성 중인 문항과 현재 미저장 변경이 있는 문항은 폼에 적용한 뒤 사용자가 저장한다. 따라서 해설 적용이 현재 수정 중인 본문·선지를 덮어쓰지 않는다.

## IPC와 저장 경계

계약 파일 `src/contracts/index.ts`는 변경하지 않았다. 앱 전용 요청/응답은 `app/shared/editor.ts`와 `api.ts`에 둔다. 기존 주 창·주 프레임 확인과 한국어 Result 오류 변환을 모든 채널에 적용한다.

| API | 역할 |
|---|---|
| `bank.validate(question)` | 구조 확인, 기존 검증기, 목표 코드 확인, 빈 해설 정보 |
| `bank.save({question, assets, force})` | 재검증, 중복 확인, 사용 자산 저장, ID·시각 부여, 이전 내용 반환 |
| `bank.delete(ids)` / `bank.restore(questions)` | 삭제 전 내용 반환 / 실행 취소 복원 |
| `bank.objectiveCodes(subject)` | 같은 과목의 코드 목록·중복 제거·구간 정렬 |
| `assets.add({bytes, mime})` | 새 이미지 검증과 sha256 자산 구성 |
| `editor.parseText({text, subject})` | 문제 초안·작업 묶음·진단 |
| `editor.parseExplanations({text})` | 번호별 해설과 선택 가능한 정답 위치 |
| `bank.applyExplanations({pairs})` | 번호·묶음 검증 후 저장된 해설 일괄 갱신 |
| `editor.setDirty(dirty)` | main의 창 닫기 확인 상태 |
| `bank.list({withoutExplanation, ...})` | 공백·빈 표를 포함한 해설 누락 필터 |

저장 중의 중복 저장 요청은 거부한다. Block 종류·깊이·크기, 표 형태, 문자열·서식·선지 목록, 자산 해시와 파일 형식을 main에서 확인한다. 자산 저장 후 문제 저장 실패 시 자산만 남을 수 있으며, 재시도할 수 있다. 공유될 수 있는 자산은 실행 취소 때 삭제하지 않는다.

## 캡처

준비 신호 → 글꼴 준비와 requestAnimationFrame 두 번 → **`CAPTURE_COMPOSITOR_SETTLE_MS = 400`ms** → `capturePage` 순서다. sandbox iframe은 별도 프로세스의 합성이 두 프레임보다 늦을 수 있어, 실제 화면에서는 정상인 미리보기가 흰 상자로 캡처되던 문제를 피하기 위한 추가 대기다. 일반 앱 화면에는 이 대기를 적용하지 않는다.

기본 대상에 빈 `add`, 은행 첫 문제의 `edit`가 포함된다. edit 캡처에는 검수 DB에 최소 한 문제가 있어야 한다. `QB_CAPTURE_PASTE_FILE`에 가짜 UTF-8 `.txt` 파일을 지정하면 main이 글자를 세션에 전달하고 renderer가 같은 파싱 IPC를 호출한다. 연속 추가 모드 준비와 미리보기 이후 `add-paste-{light|dark}-{1360x840|1100x700}.png` 네 장을 추가한다. 실제 저장은 하지 않는다. 실제 문제 경로는 이 문서에 포함하지 않았다.

## 한계와 검수 범위

- PDF 파일 읽기·OCR은 하지 않는다. 복사한 글자만 분리하므로 밑줄·표·이미지는 직원이 별도로 입력한다.
- 기본 텍스트 양식은 5B 프로파일을 따른다. 원래 문제 번호가 없는 텍스트는 번호를 추가한 뒤 해석하거나 직접 입력한다. 번호 `01`과 `1`은 자동으로 같다고 추정하지 않는다.
- 작업 묶음과 저장 전 폼은 메모리에만 있다. 앱 종료 후 작업 목록은 복구되지 않는다. 저장된 문제는 은행의 해설 없음 필터와 편집기로 찾아 보완할 수 있다.
- 기존 stem/choice 안의 이미지·표는 보존하고 미리보기에 표시한다. 이 영역의 구조 편집은 제공하지 않으며 새 이미지·표는 예문/해설 블록 편집기를 사용한다.
- contentEditable의 실제 선택 영역·IME·클립보드·키보드·창 닫기와 라이트/다크 시각 검수는 검수자가 수행한다. 이 환경에서 Electron 실행·캡처는 시도하지 않았다. renderer는 순수 변환 테스트, 정적 렌더, 타입 검사와 빌드로 검증한다.
- 실제 문제 파일·`.tmp-realcheck/` 접근, 네트워크 설치, git commit/push는 하지 않았다. 기존 사용자 파일 `docs/prompts/stage5c.md`는 수정하지 않았다. 계약 변경 요청은 없다.

## 검사 결과

최종 결과와 변경 파일 목록은 아래에 기록한다.

| 최종 명령 | 결과 |
|---|---|
| `npm.cmd test` (단독 실행) | 통과, 70개 파일·629개 테스트, 97.04초, 종료 코드 0 |
| `npm.cmd run typecheck` | 통과, root·web·node, 종료 코드 0 |
| `npm.cmd run lint:deps` | 통과, 272개 모듈·834개 의존, 위반 0, 종료 코드 0 |
| `npm.cmd run format` | 통과, 종료 코드 0 |
| `npm.cmd run format:check` | 통과, 종료 코드 0 |
| `npm.cmd run build` | 통과, main·preload·renderer와 로컬 글꼴 생성, 종료 코드 0 |
| `git diff --check` | 통과, 종료 코드 0 |
| `git diff --exit-code -- src/contracts/index.ts` | 통과, 계약 변경 없음, 종료 코드 0 |

중간 검사 이력:

- 최초 typecheck는 편집 패널에 오류 문자열 대신 오류 처리 함수를 넘겨야 하는 타입 오류로 실패했다. 이어 캡처 경로 정규식의 인코딩 문제를 확인해 고쳤다. 이후 typecheck는 통과했다.
- 첫 `npm.cmd run test:fast`는 67개 파일 중 66개 통과·1개 실패, 테스트 578개 통과·1개 실패였다. 새 IPC 채널을 먼저 등록해 공유 채널 표와 등록 순서가 다른 것이 원인이었다. 공유 표 순서로 등록하도록 고친 뒤 IPC 포함 94개 관련 검사가 통과했다.
- 새 순수 변환·서비스 검사 최초 14개, 이후 보완된 변환·서비스·정적 렌더 검사 17개가 각각 통과했다.

변경 파일 전체 목록이다. A 신규, M 수정, D 공용 위치로 이동한 이전 파일 삭제. 빌드 산출물과 기존 사용자 프롬프트 파일은 제외한다.

```text
A docs/STAGE5C.md
M src/app/main/capture.test.ts
M src/app/main/capture.ts
M src/app/main/index.ts
M src/app/main/ipc.ts
M src/app/main/services/bank.ts
A src/app/main/services/editor-input.ts
A src/app/main/services/editor.test.ts
A src/app/main/services/editor.ts
M src/app/preload/index.ts
M src/app/renderer/app/App.tsx
M src/app/renderer/app/PageHeader.tsx
M src/app/renderer/app/Sidebar.tsx
M src/app/renderer/app/routes.ts
A src/app/renderer/components/BlockListEditor.module.css
A src/app/renderer/components/BlockListEditor.tsx
M src/app/renderer/components/Dialog.module.css
M src/app/renderer/components/Dialog.tsx
M src/app/renderer/components/QuestionPreview.tsx
A src/app/renderer/components/RichTextField.module.css
A src/app/renderer/components/RichTextField.tsx
A src/app/renderer/components/TreeNodes.module.css
A src/app/renderer/components/TreeNodes.tsx
M src/app/renderer/components/index.ts
M src/app/renderer/hooks/index.ts
A src/app/renderer/hooks/useUnsaved.ts
A src/app/renderer/lib/editor/editor.test.ts
A src/app/renderer/lib/editor/index.ts
M src/app/renderer/lib/index.ts
M src/app/renderer/lib/navigation.ts
A src/app/renderer/lib/rich-text/index.ts
A src/app/renderer/lib/rich-text/rich-text.test.ts
A src/app/renderer/screens/bank/BankActions.tsx
M src/app/renderer/screens/bank/BankScreen.tsx
M src/app/renderer/screens/bank/ObjectiveTree.tsx
D src/app/renderer/screens/bank/TreeNodes.module.css
D src/app/renderer/screens/bank/TreeNodes.tsx
M src/app/renderer/screens/bank/useBankData.ts
A src/app/renderer/screens/editor/DuplicatePreview.module.css
A src/app/renderer/screens/editor/DuplicatePreview.tsx
A src/app/renderer/screens/editor/EditorBasics.tsx
A src/app/renderer/screens/editor/EditorChoices.tsx
A src/app/renderer/screens/editor/EditorPastePanel.tsx
A src/app/renderer/screens/editor/EditorScreen.module.css
A src/app/renderer/screens/editor/EditorScreen.tsx
A src/app/renderer/screens/editor/ExplanationPaste.tsx
A src/app/renderer/screens/editor/editor.test.ts
A src/app/renderer/screens/editor/index.ts
A src/app/renderer/screens/editor/useEditor.ts
M src/app/renderer/styles/base.css
M src/app/shared/api.ts
A src/app/shared/editor.ts
M src/app/shared/index.ts
M src/app/shared/routes.ts
```
