## 2단계 보완 (실제 문서로 검수하다 발견된 문제 수정)

## 실행 방식
- 계획만 말하고 멈추지 마라. 수정하고 테스트를 돌려 통과한 뒤에만 보고하라. 사용자에게 묻지 마라.
- AGENTS.md, docs/STAGE2.md, `src/modules/importers/docx/index.ts` 를 `Get-Content -Encoding UTF8` 로 읽고 시작하라. `npm.cmd` / `npx.cmd` 사용. 계약(`src/contracts/index.ts`) 수정 금지.
- **실제 문제 파일(문제 디비/, 규칙.docx)은 읽지 마라.** 아래 "실제 데이터에서 확인된 형태"는 모양만 알려주는 것이다. 테스트에는 가짜 더미 문장만 써라.
- `.tmp-realcheck/` 폴더는 검수자(나)의 임시 폴더이니 건드리지 마라.

## 문제 1: 학습목표 줄 패턴이 너무 엄격 (가장 중요)
현재 기본 패턴은 `과목 코드 문장 (등급)` 한 가지만 인식해서, 실제 문서의 학습목표 줄 약 49개를 놓쳐 "학습목표 없음"으로 처리됐다. 실제 문서에 섞여 있는 형태(내용은 더미로 바꿔서 테스트에 넣어라):
```
법규 1-1-3 학습목표 문장을 열거할 수 있다. (A)      ← 기준 형태
법규 1-3-14. 학습목표 문장을 열거할 수 있다. (A)     ← 코드 뒤에 마침표
법규 2-1-8(A)                                       ← 문장 없이 등급만, 공백 없음
법규 3-1-5 (A)                                      ← 문장 없이 등급만 (끝에 공백/탭이 붙기도 함)
법규 3-3-8. (A)                                     ← 코드 뒤 마침표 + 등급만
법규 3-4-3 B항                                       ← 등급이 "B항" 형태
해부 2-2-15 A항 (끝 공백)                            ← "A항"
법규 2-1-5 학습목표 문장을 설명할 수 있다.            ← 등급 없음
해부 14-1-3 (B)                                     ← 코드 첫 자리가 두 자리
```
요구:
- `standardProfile.objectiveLinePattern` 을 위 모든 형태를 한 줄로 인식하도록 고쳐라. 등급은 선택, 문장도 선택. 등급은 `(A)`, `(B)`, `A항`, `B항` 모두 grade 로 추출(`A`/`B` 만 저장). 코드 뒤 마침표는 무시. 끝 공백/탭 허용. 결과 `objectiveCode` 는 항상 `과목 코드`(예: "법규 3-4-3"), 문장이 없으면 `extra.objectiveText` 는 비움.
- 패턴이 **해설 본문의 일반 문장과 혼동되면 안 된다**: 예) "법규 규정에 따라 …" (코드 숫자 없음), "⦁법규 1-1-3 참고" (불릿 시작) 은 학습목표 줄이 아니다. 학습목표 줄은 줄 맨 앞(공백 허용)에서 `과목명(한글 1~10자) + 선택적 공백 + 숫자코드` 로 시작해야 한다.
- 이 때문에 JS 정규식에 같은 이름의 그룹을 중복해서 쓰지 못하면 grade 추출은 두 단계로(패턴 매치 후 별도 정규식) 구현해도 된다. `LayoutProfile` 의 JSON 직렬화 가능성은 유지하라(필요하면 `gradePattern` 선택 필드를 추가해도 된다).
- 위 9개 형태 각각에 대한 테스트 + 오인 방지 테스트(해설 안에 "법규 ..." 일반 문장, 불릿 줄).

## 문제 2: 자동 번호(원문자) 선지가 통째로 누락됨
실제 문서에 선지 5개가 `w:numPr` 자동 번호로 되어 있고 본문에는 "①" 글자가 없는 문제가 있다(문제 줄 + 자동번호 문단 5개 + 정답 + 해설). 현재는 AUTO_NUMBERING_IGNORED 와 UNPARSED_BLOCKS 만 내고 **문제 전체를 버린다**. numbering.xml 정의는 이렇다:
```
<w:num w:numId="3"> → abstractNumId 3, lvl 0: start=1, numFmt="decimalEnclosedCircle", lvlText="%1"
```
요구:
- `word/numbering.xml` 을 읽어 numId → abstractNum → ilvl 의 `numFmt`/`start`/`lvlText` 를 해석하라(`w:lvlOverride/w:startOverride` 있으면 반영).
- numFmt 가 `decimalEnclosedCircle`(및 `decimalEnclosedCircleChinese`, `decimalEnclosedFcircle` 같은 원문자 계열)인 자동 번호 문단은, 같은 numId·ilvl 의 연속 카운터(문서 순서대로 1,2,3…, 시작값 반영)로 원문자(①②③…⑩)를 계산해 **선지 번호 글자가 앞에 붙어 있는 것처럼 취급**하라(선지 판정에만 사용하고 content 에는 번호 글자를 넣지 않는다 — 기존 규칙과 동일).
- 카운터는 같은 numId 가 문서에서 다시 등장할 때 이어서 증가한다는 점에 주의(Word 동작). 한 문제의 선지 묶음마다 1부터 다시 시작하려면 문서에 별도 numId 나 startOverride 가 있을 것이다. 이어서 증가한 값이 ⑤를 넘어 ⑥~이 되면(예: 두 번째 문제의 선지가 ⑥~⑩) **선지 위치(1~5)는 "해당 문제 안에서의 순서"로 다시 센다** — 즉 선지 판정은 "원문자 계열 자동 번호 문단"이라는 사실만 사용하고 숫자 값에는 의존하지 말라. (카운터는 진단 메시지 용도로만.)
- 그 외 numFmt(예: `decimal` "%1.")는 지금처럼 AUTO_NUMBERING_IGNORED 경고 유지.
- 정상 복원된 경우에는 AUTO_NUMBERING_IGNORED 를 내지 말고, 대신 info 진단 `AUTO_NUMBERING_RESTORED`(복원한 문제 위치 포함)를 내라.
- docxBuilder 에 numbering 정의(numFmt, start, 여러 numId)와 numPr 문단을 만드는 옵션을 추가하고 테스트: 선지 5개가 자동 번호인 문제, 같은 numId 를 두 문제가 공유해 카운터가 이어지는 경우(둘 다 정상 5지선다로 파싱), numFmt=decimal 은 경고 유지, numbering.xml 이 없을 때 안전 처리.

## 문제 3: 사소한 오류 처리
 a. 출처 태그가 `<2026-01-26` 처럼 닫는 `>` 가 빠진 경우가 있다. 태그 패턴은 닫는 `>` 가 없어도 태그로 인식하고(저장되는 sourceTag 는 정규화하지 말고 원문 그대로) warn `SOURCE_TAG_MALFORMED` 를 내라. 해설의 마지막 줄로 흡수되면 안 된다.
 b. 첫 문제 이전에 있는 제목 줄(예: "1-01. 의료관계법규", "1-02. 구강해부학")은 UNPARSED_BLOCKS(warn) 가 아니라 info 진단 `PREAMBLE_IGNORED` 로 낮춰라. 문서 앞부분(첫 문제/태그 이전)의 내용만 해당하고, 문제 중간에서 버려진 내용은 계속 warn.
 c. `UNPARSED_BLOCKS` 가 여러 문단에 대해 문단마다 따로 나오면 시끄럽다. 같은 문서에서 **연속된** 버려진 블록은 하나의 진단으로 합쳐(처음 몇 줄 미리보기 + "외 N개 문단") 내라.

## 마무리
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과(기존 90개 테스트 포함).
- docs/STAGE2.md 의 한계/가정 표를 이번 변경에 맞게 갱신.
- AGENTS.md 최종 보고 형식으로 보고. 처리하지 못한 것은 솔직히 적어라.
