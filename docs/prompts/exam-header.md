# 작업: 시험지 머리 정보(교시·시험 시간·문항 수·배점·성명/수험번호 칸)

먼저 `AGENTS.md` 를 읽고 따른다(형식: Prettier, 파일 단위 분리, 테스트 필수). git commit/push 는 하지 않는다.
**`src/contracts/index.ts` 는 이미 수정해 두었다(`ExamHeader`, `ExportOptions.header?`). 더 고치지 말고 그대로 쓴다.**
PowerShell 에서 파일은 `Get-Content -Encoding UTF8`, npm 은 `npm.cmd`. 문제 데이터 파일은 읽지 않는다(테스트는 가짜 문제만).

## 목적
국시원 필기시험지처럼 문제지 맨 위에 시험 정보를 넣는다. 지금은 제목 아래에 `성명: ____　점수: ____` 줄만 있다.

## 동작(모든 출력기 공통 규칙)
`ExportOptions.header` 가 **없으면** 지금과 완전히 같게 출력한다(회귀 금지: 기존 테스트가 그대로 통과해야 한다).
`header` 가 있으면 **문제지(questions 파트)에만** 아래를 적용한다. 정답지·해설지는 바꾸지 않는다.

1. 시험 정보 줄 1개: 값이 있는 항목만 ` · ` 로 이어 적는다. 순서 고정.
   - `period` (공백만이면 없는 것) → 예: `1교시`
   - `durationMinutes` (양의 정수일 때) → `시험 시간 85분`
   - 문항 수(항상 표시) → `총 {snapshot.items.length}문항`
   - `pointsPerQuestion` (양수일 때; 정수면 `1점`, 소수면 `0.5점`) → `문항당 1점`
   예) `1교시 · 시험 시간 85분 · 총 100문항 · 문항당 1점`
   `period`·시간·배점이 모두 없어도 `총 N문항` 줄은 넣는다.
2. 응시자 칸: `candidateFields` 가 true 이면 `성명: ____________________　수험번호: ____________________` 한 줄(점수 칸은 없다). false 이면 칸 줄을 넣지 않는다.
   (`header` 가 없을 때의 옛 `성명 … 점수` 줄은 그대로 유지.)

## 해야 할 일
1. `src/modules/render-html/index.ts` (PDF 와 미리보기가 이 HTML 을 쓴다): `renderPart` 가 `options.header` 를 받아 위 규칙대로 `<div class="qb-exam-info">` 와 `<div class="qb-student">` 를 만든다. 필요하면 `renderPart` 시그니처에 header 를 추가. CSS 는 기존 `standardCss`(파일을 먼저 읽어서 위치 확인)에 `.qb-exam-info`(가운데 정렬 또는 제목과 어울리는 정돈된 한 줄, 글자 크기는 본문보다 약간 작게, 아래 여백) 를 추가한다. 인쇄에서도 깨지지 않게.
2. `src/modules/exporters/docx/index.ts`: 같은 규칙으로 Paragraph 를 넣는다(제목 아래, 문제 앞).
3. `src/modules/exporters/xlsx/index.ts`: 문제지 시트에 같은 정보를 제목 아래 행에 넣는다(구조를 먼저 읽고 기존 열 구조·인쇄 설정을 깨지 않게. 정보 줄과 응시자 칸 줄을 각각 한 행으로).
4. 세 출력기가 같은 문구를 만들도록 **문구 생성 함수를 한 곳에 둔다**: `src/modules/render-html` 이 아니라 exporters 쪽에서도 쓰려면 모듈 규칙(ARCHITECTURE.md §3, `.dependency-cruiser.cjs`)을 확인해서 허용되는 위치에 둔다. `exporters/*` 는 render-html 을 이미 쓰고 있다면 render-html 의 `index.ts` 에서 `describeExamHeader(snapshot, header): { info: string; candidate: string | undefined }` 를 export 해서 docx·xlsx 가 가져다 쓴다. 허용되지 않으면 이유를 보고하고 각 출력기에 중복 구현하지 말고 멈춰서 보고한다.
5. 앱 연결:
   - `src/app/shared/exam.ts` 의 `ExportRequest` 에 `header?: ExamHeader` 추가(contracts 에서 import).
   - `src/app/main/services/export.ts`: `parseRequest` 에서 `header` 를 검증한다(객체 아님/타입 틀림/`durationMinutes` 가 1~600 정수 아님/`pointsPerQuestion` 이 0 초과 100 이하 숫자 아님/`period` 가 30자 초과이면 한국어 메시지로 오류). 통과하면 `exporter.export` 의 옵션에 `header` 로 전달. 값은 새 객체로 정규화해서 넘긴다(알 수 없는 필드 버림).
   - 화면: `src/app/renderer/components/ExportOptions.tsx` 에 `시험지 머리` 영역을 추가한다. 항목: 교시(문자 입력, 예 `1교시`), 시험 시간(분, 숫자), 문항당 배점(숫자), `성명·수험번호 칸 넣기` 체크(기본 켜짐), 그리고 맨 위에 `시험지 머리 정보 넣기` 체크(기본 **꺼짐** — 꺼져 있으면 `header` 를 보내지 않아 예전 출력). 이 컴포넌트는 `StepSave.tsx`(시험 만들기)와 `HistoryScreen.tsx`(출제 이력 다시 저장)에서 같이 쓰므로, 상태는 새 훅 `useExamHeader`(`src/app/renderer/components/useExamHeader.ts`)로 만들어 두 곳이 같은 방식으로 쓰게 하고, 저장 요청에 `header` 를 실어 보낸다. 입력이 올바르지 않으면 저장 버튼을 막고 이유를 보여준다(시간: 1~600 정수, 배점: 0 초과 100 이하).
   - 스타일은 `docs/DESIGN.md` 의 토큰만 쓴다(`ExportOptions.module.css` 에 추가). 다크 모드·키보드 접근·`label` 연결을 지킨다.
6. 테스트(가짜 문제만):
   - render-html: header 없음 → 기존과 같은 HTML(기존 테스트 유지), header 있음 → 정보 줄 문구가 정확함(각 항목 유무 조합: 전부/교시만/없음·candidateFields 켬/끔), 정답지·해설지에는 정보 줄이 없음, 사용자 입력 `period` 의 `<`·`&` 가 이스케이프됨.
   - docx: header 있을 때 문서 XML 에 정보 문구가 있고 header 없을 때는 `수험번호` 가 없음(jszip 으로 열어 확인; 기존 docx 테스트 방식을 따른다).
   - xlsx: 같은 확인(exceljs 로 읽기).
   - export 서비스: 잘못된 header(시간 0, 배점 -1, period 31자, 문자열 header)는 한국어 오류, 올바른 header 는 출력기에 전달됨(기존 `src/app/main/services/exam.test.ts` 의 방식 참고).
   - 화면 훅 `useExamHeader` 는 순수 함수(검증·요청 만들기)로 분리해서 vitest 로 시험한다. 기존 renderer 테스트 방식(`components.test.ts` 등)을 따른다.
7. 마무리: `npm.cmd run format`, `format:check`, `typecheck`, `lint:deps`, 관련 테스트, 그리고 전체 `npm.cmd test` 와 `npm.cmd run build` 를 통과시킨다.

## 최종 보고 형식
1. 만든/수정한 파일 목록
2. 실행한 명령과 결과(통과/실패 그대로)
3. 하지 못한 것, 막힌 것, 가정한 것
4. 계약 변경 요청(있으면)
