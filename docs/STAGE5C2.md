# 5C2단계 — 편집기 다듬기와 PDF 붙여넣기 보강

## 변경점

- 공통 `Select`를 만들고 편집기 과목·등급, 가져오기 옵션 과목과 검수 등급을 교체했다. Input과 같은 높이·간격·테두리·반경 토큰, 위쪽 라벨, 다크 모드, 오류 설명과 포커스 링을 사용한다. 내부 네이티브 select의 키보드 조작을 유지한다.
- 체크박스·라디오는 전역 토큰 스타일을 공유한다. Windows 고대비 모드에서는 기본 컨트롤로 표시한다.
- 이미지 추가는 보조 버튼과 숨은 파일 입력으로 바꾸었다. 파일·클립보드·끌어놓기에 같은 이미지 검증을 사용한다.
- 서식 도구는 lucide의 Underline/Bold/Italic/Superscript/Subscript 아이콘, 한국어 aria-label, 단축키 툴팁과 aria-pressed를 사용한다. 선택 영역 변경 시 눌림 상태를 갱신한다. 단축키는 Ctrl+U/B/I, 위첨자 Ctrl+Shift+=, 아래첨자 Ctrl+=다.
- 학습목표 입력과 “목록에서 고르기” 버튼을 하나의 입력 그룹으로 붙였다.
- `edit?id=`의 PDF 패널은 기본으로 접고, 추가 모드는 펼친다. 글자가 있으면 자동 분리가 주 버튼이 되며, 비어 있으면 비활성 사유를 표시한다. 자동 분리가 주 행동일 때 저장은 보조 버튼이다.

## 줄바꿈 잇기 규칙

`parseQuestionText(text, options)`의 `joinWrappedLinesWith?: 'space' | 'none'`과 `parseExplanationText(text, options)`가 같은 규칙을 쓴다. 기본값은 `space`다. 기존 `parseExplanationText(text, profile)` 호출도 지원한다.

1. `space`(띄어쓰기로): 이어지는 두 줄 사이에 공백 하나를 넣는다.
2. `none`(붙여서): 공백 없이 잇는다. 단, 앞 줄이 유니코드 문장부호(`\p{P}`, 닫는 괄호·따옴표 포함) 또는 `>`로 끝나거나, 다음 줄이 여는 괄호(`\p{Ps}`)·`<`·영문 A–Z/a–z·숫자 0–9로 시작하면 공백 하나를 넣는다.
3. 두 방식 모두 각 줄 앞뒤 여백은 제거한다. 문제 번호·새 선지·정답·해설·목표·출처 라벨과 빈 줄은 연결 경계다. 같은 선지 안의 잘린 줄은 잇지만 다음 선지나 정답 줄로 이어 붙이지 않는다.
4. 숫자만 있는 줄·쪽 번호 모양·반복 머리글 의심 줄은 삭제하거나 앞줄에 합치지 않고 원문과 `PDF_ARTIFACT_SUSPECTED` 경고를 남긴다. 숫자만 있는 본문도 쪽 번호로 의심될 수 있으므로 미리보기에서 확인한다.
5. 해설은 번호별로 나눈 뒤 본문 줄을 잇는다. 해설 속 ①·② 참조를 여러 선지로 나누지 않는다. 반복 머리글 경고는 해설 번호 경계를 넘어 탐지하며 각 결과에 붙여넣기 전체 경고로 전달한다.

예: `가짜 자\n는?`는 공백 모드에서 “가짜 자 는?”, 붙여서 모드에서 “가짜 자는?”가 된다. `설명.\n다음`과 `앞\nABC`는 두 모드 모두 공백을 유지한다.

패널의 “줄바꿈 잇기: 띄어쓰기로 / 붙여서”를 바꾸면 현재 붙여넣은 글을 즉시 다시 해석해 폼과 미리보기에 반영한다. 뒤늦게 끝난 이전 요청은 버린다. 선택은 설정의 `pasteJoin`에 저장하고 다음 편집 화면·앱 재실행에서 읽는다. 이전 설정 파일에 값이 없으면 `space`를 사용하며 잘못된 값은 `validateSettings`가 거부한다. 해설도 현재 선택한 방식을 사용한다.

## 해설 정답 표기

번호 머리를 제거한 뒤 본문이 시작하기 전의 독립된 정답 줄을 추출한다. 빈 줄은 허용한다.

| 입력 예 | answerLabels |
|---|---|
| `정답 ③` | `['③']` |
| `정답: ③` / `정답：③` | `['③']` |
| `[정답] ③` | `['③']` |
| `답 ③` | `['③']` |
| `정답 3` | `['3']` |

쉼표·공백으로 나열한 복수 정답도 지원하며 중복 표기는 제거한다. 예를 들어 `01. 정답 ③` 다음 줄의 설명은 번호 `01`, 정답 `③`, 해설 본문으로 나뉜다. 추출한 정답 줄은 해설 본문에서 제거한다. 정답 없는 해설은 `answerLabels`를 생략하고, 본문 중 “정답”을 참조하는 줄은 그대로 보존한다.

편집기 짝짓기 표에 정답 열과 문항별 적용 체크를 추가했다. 문제에 정답이 비어 있으면 기본 체크한다. 기존 정답이 있으면 기본 해제하고, 서로 다르면 덮어쓰기 경고를 표시한다. 사용자가 체크한 문항만 정답을 적용한다. 체크하지 않으면 해설만 적용한다.

main의 `bank.applyExplanations`는 원래 번호·작업 묶음·정답 범위를 확인하고 위치를 선지 ID로 변환한다. 범위 밖 정답이 선택되면 한국어 오류로 전체 저장을 막는다. 현재 작성 중인 문제는 폼에 반영하고, 이미 저장된 문항은 기존 일괄 저장 경로로 갱신한다.

## 캡처 준비

- 각 콘텐츠 크기 설정 전에 전체 화면 해제 이벤트와 최대화 해제 이벤트를 기다린다. 이후 `setContentSize`를 호출한다.
- 캡처 모드에서는 기존 main의 close 처리에서 창 상태 저장을 건너뛰는 보호를 유지한다.
- render-html HTML이 바뀌면 iframe을 새로 만들고 이전 그리기 대기를 취소한다. 해당 HTML의 load와 두 프레임 후에만 그 폼의 준비를 알린다.
- 편집기는 현재 폼과 그려진 미리보기가 같은 객체여야 준비된다. 해석 중, 설정 읽기 중, 300ms 디바운스 검증 중과 새 폼 검증 결과가 아직 없는 동안에도 기다린다. 오류가 있어도 현재 폼의 미리보기가 그려진 뒤 오류 상태를 전달한다.
- add-paste는 작업 묶음 생성까지 기다리며 준비 제한은 60초다. 준비 제한의 시작은 글자 전달·화면 이동 이후다. 일반 화면 제한은 10초이며 각 실행 단계의 제한도 유지한다. 글꼴·두 프레임·400ms 합성 대기 이후 캡처하는 순서는 유지한다.

## 검수 범위와 제한

가짜 문자열·메모리 DB·모의 BrowserWindow로 검증했다. 실제 문제 파일과 `.tmp-realcheck/`에 접근하지 않았다. Electron 실행·실제 화면 캡처·네트워크 설치·git commit/push는 하지 않았다. 기존 사용자 프롬프트 파일은 변경하지 않았다. 실제 IME·선택 영역·라이트/다크 화면과 캡처 PNG 시각 검수는 검수자가 수행한다.

`src/contracts/index.ts` 변경과 계약 변경 요청은 없다. 앱 전용 IPC 타입만 확장했다.

## 검사 결과

| 명령 | 결과 |
|---|---|
| `npm.cmd test` (최종 전체) | 통과, 71개 파일·669개 테스트, 94.96초, 종료 코드 0 |
| `npm.cmd run typecheck` | 통과, root·web·node, 종료 코드 0 |
| `npm.cmd run lint:deps` | 통과, 283개 모듈·870개 의존, 위반 0, 종료 코드 0 |
| `npm.cmd run format` | 통과, 종료 코드 0 |
| `npm.cmd run format:check` | 통과, 종료 코드 0 |
| `npm.cmd run build` | 통과, main·preload·renderer 생성, 종료 코드 0 |
| `git diff --check` | 통과, 종료 코드 0 |
| `git diff --exit-code -- src/contracts/index.ts` | 통과, 계약 변경 없음, 종료 코드 0 |

필수 검사를 모두 통과했다.

중간 검사 이력:

- 최초 타입 검사는 PowerShell 파이프에서 새 한글 문자열이 `?`로 치환되어 정규식 구문 오류(TS1507)로 실패했다. UTF-8 출력 인코딩을 명시하고 영향을 받은 문자열·치환을 바로잡은 뒤 통과했다.
- 첫 관련 검사는 6개 파일 중 5개 통과·1개 실패, 75개 테스트 중 74개 통과·1개 실패였다. 숫자만 있는 줄을 일반 숫자 시작 문장으로 사용한 테스트가 기존 쪽 번호 의심 경계에 걸렸다. 숫자 시작 문장과 쪽 번호를 구별하는 입력으로 수정했다.
- 이후 `npm.cmd run test:fast`는 67개 파일·611개 테스트 통과, 종료 코드 0이었다.
- 추가 UI/현재 미리보기 검사 12개와 줄 잇기/캡처 검사 46개가 각각 통과했다.
- 첫 `npm.cmd test` 전체는 71개 파일·668개 테스트 통과, 98.84초, 종료 코드 0이었다. 마지막 패널 간격·번호 간 반복 머리글 보강을 반영한 뒤 전체 검사를 다시 실행했다.

## 만든/수정한 파일 목록

A 신규, M 수정. 빌드 산출물과 기존 사용자 프롬프트는 제외한다.

```text
A docs/STAGE5C2.md
A src/app/renderer/components/PreviewFrame.test.ts
A src/app/renderer/components/Select.module.css
A src/app/renderer/components/Select.tsx
A src/app/renderer/screens/editor/EditorBasics.module.css
A src/app/renderer/screens/editor/EditorPastePanel.module.css
A src/app/renderer/screens/editor/ExplanationAnswer.module.css
A src/app/renderer/screens/editor/ExplanationAnswer.tsx
A src/app/renderer/screens/editor/ExplanationMatches.module.css
A src/app/renderer/screens/editor/ExplanationMatches.tsx
A src/app/renderer/screens/editor/usePasteJoin.ts
A src/modules/importers/text/explanation.ts
M src/app/main/capture.test.ts
M src/app/main/capture.ts
M src/app/main/services/editor.test.ts
M src/app/main/services/editor.ts
M src/app/main/settings.test.ts
M src/app/main/settings.ts
M src/app/renderer/components/BlockListEditor.tsx
M src/app/renderer/components/PreviewFrame.tsx
M src/app/renderer/components/RichTextField.module.css
M src/app/renderer/components/RichTextField.tsx
M src/app/renderer/components/components.test.ts
M src/app/renderer/components/index.ts
M src/app/renderer/lib/editor/editor.test.ts
M src/app/renderer/lib/editor/index.ts
M src/app/renderer/screens/editor/EditorBasics.tsx
M src/app/renderer/screens/editor/EditorPastePanel.tsx
M src/app/renderer/screens/editor/EditorScreen.module.css
M src/app/renderer/screens/editor/EditorScreen.tsx
M src/app/renderer/screens/editor/ExplanationPaste.tsx
M src/app/renderer/screens/editor/editor.test.ts
M src/app/renderer/screens/editor/useEditor.ts
M src/app/renderer/screens/import/ImportItemEditor.module.css
M src/app/renderer/screens/import/ImportItemEditor.tsx
M src/app/renderer/screens/import/ImportOptionsPanel.module.css
M src/app/renderer/screens/import/ImportOptionsPanel.tsx
M src/app/renderer/styles/base.css
M src/app/shared/api.ts
M src/app/shared/editor.ts
M src/modules/importers/text/cleanup.ts
M src/modules/importers/text/index.ts
M src/modules/importers/text/text.test.ts
```
