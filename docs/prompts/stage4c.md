## 4C단계: 실제 Word·Excel 검수에서 나온 수정 (해설의 선지 번호 안전장치 + 레이아웃 다듬기)

검수자가 실제 문제로 docx/xlsx 를 만들어 **실제 Word·Excel 에서 열어** 확인한 결과다. 가장 중요한 것은 4C-1 이다.

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 구현하고 테스트를 돌려 통과한 뒤에만 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md(명령에 `npm run test:fast` 가 추가됨), docs/ARCHITECTURE.md, src/contracts/index.ts, docs/STAGE2.md, docs/STAGE4A.md, docs/STAGE4B.md 를 `Get-Content -Encoding UTF8` 로 읽어라. `npm.cmd`/`npx.cmd`. 계약 수정 금지. 실제 문제 파일(문제 디비/, 규칙.docx), `.tmp-realcheck/` 접근 금지. 네트워크 설치 금지.
- 작업 중에는 `npm.cmd run test:fast`, 마무리 전에는 `npm.cmd test`(전체, 약 1분 30초), `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과.

## 4C-1. 해설·본문의 선지 번호 참조 → 선지 자동 고정 (정확성, 최우선)
**문제**: 실제 데이터의 약 14%(법규 31문제, 해부 2문제)는 해설이 "① 의료기관: …", "② 조산원: …", "⦁①, ②, ④ 간호사를 제외한…"처럼 **선지 번호로 설명**한다. 지금은 이 문제들의 선지가 섞이므로, 섞인 시험지에서 **해설의 번호와 시험지의 선지 번호가 어긋난다**(예: 해설은 "④ 종합병원은…"인데 시험지에서는 그 선지가 ③). 학생에게 틀린 해설이 된다.
**결정**: 해설·본문(stem)·예문(passage)에 원문자(①~⑩)가 하나라도 있으면 그 문제의 **선지를 섞지 않는다**(`shufflePolicy: 'lock-all'`). 원문자가 법 조항 번호 같은 다른 뜻일 수도 있으므로, 사람이 문제 편집에서 해제할 수 있게 진단으로 알린다. (해설 번호를 자동으로 바꿔 쓰는 방식은 법 조항 번호를 잘못 바꿀 위험이 있어 이번에는 하지 않는다.)
- content-model: `referencesChoiceLabels(blocks: Block[]): boolean` 추가·export — 블록(표 안 중첩 포함) 텍스트에 ①~⑩ 가 있으면 true. 테스트(중첩 표, 없는 경우, ⑩).
- importers/docx: 새 옵션 `lockChoicesOnReference?: boolean`(기본 true). 문제의 explanation/stem/passage 중 하나라도 `referencesChoiceLabels` 면 `shufflePolicy = 'lock-all'` 로 두고 info 진단 `CHOICES_LOCKED_BY_REFERENCE`(위치, 문제 앞 20자, "해설·본문에 선지 번호(①~⑤)가 있어 선지 순서를 고정했습니다. 번호가 법 조항 등 선지와 무관하면 문제 편집에서 고정을 해제하세요"). 선지 본문에 원문자가 있어 `fixedPosition` 이 되는 기존 규칙은 그대로 유지. 테스트(해설 참조→잠금, 본문 참조→잠금, 참조 없음→free, 옵션 false→free).
- validators: 새 플러그인 `choice-label-reference` — 같은 조건인데 `shufflePolicy === 'free'` 이면 warn `CHOICE_LABEL_REFERENCE_UNLOCKED`("선지를 섞으면 해설·본문의 번호가 시험지와 어긋납니다. 선지 순서를 고정하세요"). 나중에 앱에서 직접 추가한 문제를 위한 것. `standardValidators` 에 등록. 테스트.
- 종단 무결성: `tests/fixtures/examBank.ts` 가짜 은행에 "해설이 선지 번호를 참조하는 문제"(잠금 상태)를 섞고, `tests/e2e/exam-integrity.test.ts` 에 **해설·본문에 원문자가 있는 원본 문제는 확정본에서 선지 순서(sourceChoiceId 순서)가 원본과 같다**는 검사를 추가. 또 가짜 은행에서 잠금을 일부러 풀었을 때(free) 이 검사가 실패함을 보이는 메타 테스트.

## 4C-2. 문제지 레이아웃 다듬기 (Word 와 HTML 을 같은 규칙으로)
실제 Word 화면에서 확인된 점:
 a. 번호("1.")가 따로 한 줄을 차지하고 문제 줄이 다음 줄에 나온다 → 시험지 관례대로 **`1. 문제 줄` 을 한 문단에**(번호 뒤 공백, 두 번째 줄부터는 번호 폭만큼 내어쓰기). stem 의 첫 블록이 문단이 아니면(이미지/표) 번호만 한 줄로 두는 예외 처리.
 b. 문항 사이 간격이 없어 빽빽하다 → 문항 앞 간격(Word 약 8pt, HTML 동일 느낌의 margin).
 c. **한 문항이 단·쪽 경계에서 쪼개진다**(실제로 6번이 왼쪽 단 끝에서 시작해 오른쪽 단으로 넘어감) → Word: 문항의 마지막 문단을 제외한 모든 문단에 `keepNext`, 모든 문단 `keepLines`, 문항 안 표의 행은 `cantSplit`. (문항이 한 단보다 길면 Word 가 알아서 넘김 — 그 한계는 문서화.) HTML 은 기존 `break-inside: avoid` 유지 확인.
 d. 정답지 표에 머리글이 없다 → 각 쌍의 머리글 "번호 | 정답"(굵게, 연한 음영), 셀 가운데 정렬. HTML 정답 격자도 같은 구성.
 e. 해설지도 문항 사이 간격 추가, "N. 정답: ④" 줄은 지금처럼 굵게.
- 기존 출력 검증 헬퍼(`tests/fixtures/extractText.ts`, `htmlText.ts`, `assertExportMatchesSnapshot`)를 번호가 문제 줄과 한 문단이 된 구조에 맞게 고쳐라(검사의 엄격함은 낮추지 말 것: 번호별 stem/passage/선지/정답/해설 대조는 그대로).
- 테스트: docx 의 각 문항 첫 문단이 "N. "으로 시작하고 stem 텍스트를 포함, keepNext/keepLines/cantSplit 존재, 정답표 머리글, HTML 의 번호+문제 줄 한 요소.

## 4C-3. Excel 다듬기
실제 Excel 인쇄에서 확인된 점: 열이 여러 쪽으로 쪼개져 문제지 시트가 8~16쪽으로 인쇄되고, 내용 없는 큰 행 높이가 생기며, 빈 번호 행의 학습목표 칸에 "미지정"이 찍힌다.
- 모든 시트 페이지 설정: A4, 가로 방향, **너비 1쪽에 맞춤**(fitToPage, fitToWidth 1, fitToHeight 0), 머리글 행 반복 인쇄(printTitlesRows '1:1'), 좁은 여백, 가로 가운데.
- 행 높이: 셀 텍스트 길이와 열 너비(문자 수 기준), 줄바꿈 수로 줄 수를 추정해 `줄 수 × 약 15pt`(최소 18pt), 이미지가 있으면 이미지 높이 이상, 최대 409pt. 지나치게 큰 빈 행이 생기지 않게.
- 번호 열 가운데 정렬. 빈 번호 행: 학습목표 칸은 비우고, 문제 칸에 "(출제 가능한 문제가 없어 비워 둔 번호입니다)".
- 테스트: exceljs 로 다시 읽어 페이지 설정 값, 행 높이 범위(텍스트 짧은 행이 과도하게 크지 않음), 빈 번호 행 텍스트.

## 마무리
- `docs/STAGE4C.md` 에 변경점·한계(문항이 한 단보다 길 때, 해설 번호 자동 변환을 하지 않은 이유)를 기록.
- `npm.cmd test`(전체), `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과. AGENTS.md 최종 보고 형식으로 보고(계약 변경 요청, 못 한 것 포함).
