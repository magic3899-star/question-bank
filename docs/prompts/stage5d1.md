## 5D1단계: 출제 규칙 편집기 + 시험 만들기 마법사(선택·섞기·확정본 미리보기) + 문제 바꾸기·회차 다시 뽑기

사용자의 핵심 기능이다: 문제은행에서 **규칙대로 뽑고, 섞고, 시험지 확정본을 미리 본다.** 파일 저장(PDF·Word·Excel)과 출제 이력은 다음 단계(5D2)다. 확정 규칙은 ARCHITECTURE §11(법규 대단원 1~4 각 5문제·중단원 엄격·단일 중단원 면제, 해부 7문제, 4개 모의고사 겹침 금지, 같은 지문 중복 금지, 후보 부족 시 빈 번호, 정답 위치 최소 10%).

## 실행 방식
- 계획만 말하고 멈추지 마라. 구현하고 검사를 통과시킨 뒤에만 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md(§3·§4·§5·§8-1·§11), docs/DESIGN.md(§4.4 시험 만들기·§4.5 규칙 편집기), src/contracts/index.ts, docs/STAGE3*.md·STAGE4A.md·STAGE5*.md, `src/modules/{rules,selector,constraints,shuffler,generation,exam-snapshot,render-html}/**`, `src/app/**` 를 `Get-Content -Encoding UTF8` 로 읽어라. 계약 수정 금지(필요하면 보고서에 요청). 실제 문제 파일·`.tmp-realcheck/` 접근 금지. 네트워크 설치 금지. Electron 실행·캡처 금지(검수자가 함).
- 마무리 전 `npm.cmd test`(전체), `typecheck`, `lint:deps`, `format`→`format:check`, `build` 모두 통과.

## 5D1-1. generation 모듈 확장 (순수, 테스트 필수)
 a. `replaceQuestion(input, deps)`: 이미 만든 한 번의 실행(run: 회차별 `SelectedExam`, 섞기 후)에서 **한 회차의 한 문제만 다른 문제로 교체**. 같은 슬롯의 후보 중 모든 제약(`filterCandidates` — state: 다른 회차들 = chosenSoFar, 이 회차의 나머지 문제 = currentChosen, 슬롯 = 같은 슬롯의 나머지 + 정적 풀)을 통과하는 문제를 rng 로 고른다. 다른 문제들의 순서·선지 순서는 **그대로**, 새 문제는 원래 자리(같은 번호)에 들어가고 선지는 섞기 규칙(lock·고정 존중)대로. 후보가 없으면 변경 없이 진단(`NO_REPLACEMENT`: 이유 — 어떤 제약이 후보를 줄였는지)으로 알림. 빈 번호 자리를 채우는 데도 쓸 수 있게(빈 번호 → 문제) 지원.
 b. `regenerateExam(input, deps)`: **한 회차만 다시 뽑기**. 다른 회차는 그대로 두고, 그 회차를 새 시드로 다시 선택·섞기(다른 회차의 문제·지문과 겹치지 않음).
 c. 두 함수 모두 결과로 갱신된 확정본(`buildSnapshot`, `verifySnapshot` 통과)을 돌려준다. 결정성(같은 시드 → 같은 결과), 입력 불변.
 d. 테스트: 교체 후에도 4개 회차 간 같은 문제·같은 지문 없음, 중단원 엄격 규칙 유지, 다른 문항 불변, 빈 번호 채우기, 후보 없음 진단, 회차 다시 뽑기 후 무결성(`tests/e2e/assertSnapshotMatchesSource` 재사용). 
 e. (정답 위치 최소 10% 는 교체 뒤 깨질 수 있다 — 교체된 회차의 정답 분포를 계산해 미달이면 info `ANSWER_SHARE_BELOW_MIN` 으로 알려 주기만 한다.)

## 5D1-2. main 서비스·IPC
- **규칙 서비스** `services/rules.ts`: 첫 실행에 저장된 규칙이 없으면 `presetRuleSets()` 를 저장. `rules.list()`(이름·과목·회차·문제 수·확인 필요 여부), `rules.get(id)`, `rules.save(ruleSet)`(`validateRuleSet` + 알려진 제약 종류 = standardConstraints 의 id — 오류면 저장 거부, 한국어 진단 반환), `rules.duplicate(id)`, `rules.delete(id)`, `rules.resetPreset(id)`(프리셋을 기본값으로), `rules.describe(ruleSet)`(`describeRuleSet` 문장), `rules.check(ruleSet)` → 은행 기준 사전 점검: 슬롯별 { 라벨, 필요 수(회차 × 개수, 겹침 금지면), 정적 후보 수, 서로 다른 중단원 수(중단원 엄격 규칙이 있으면) } + `selector.precheck` 진단.
- **시험 만들기 서비스** `services/generate.ts`: `exam.generate({ ruleSetId, seed?, shuffle: { shuffleQuestionOrder, shuffleChoices, balanceAnswerPositions, minAnswerPositionShare }, excludeRecentExams?: number, titleTemplate })` → 해당 과목의 은행 문제(학습목표 있는 것)·자산·출제 이력으로 `generateExams` 실행(`excludeRecentExams` 가 있으면 규칙 사본에 `exclude-recent` 제약 추가). 시드가 없으면 main 에서 무작위로 만들어 결과에 포함(사용자가 기록·재현). 결과를 `sessionId` 로 main 메모리에 보관하고 `{ sessionId, seed, snapshots, diagnostics, slotSummary }` 반환. `exam.replaceQuestion({ sessionId, examIndex, number })`, `exam.regenerateExam({ sessionId, examIndex })`, `exam.discard(sessionId)`. 같은 세션 동시 수정 방지.
- 서비스 테스트(`:memory:` storage + 가짜 은행 — 법규형 4슬롯·해부형 규칙): 프리셋 자동 저장, 규칙 저장 검증 오류, 사전 점검 수치, 생성(시드 기록·결정성), 최근 N회 제외, 문제 교체·회차 다시 뽑기, 잘못된 세션.

## 5D1-3. 출제 규칙 편집기 화면 `screens/rules/` (DESIGN.md §4.5)
- 왼쪽: 규칙 목록(프리셋 표시, 과목, 회차×문제, "확인 필요" 배지). 오른쪽: 편집 폼.
- 폼: 이름, 과목, 회차 수, 시작 번호, **슬롯 카드**(라벨, 문제 수, 대상 학습목표 — 은행 학습목표 트리에서 대단원/중단원/코드 다중 선택 대화상자, 선택한 접두 표시) + 각 슬롯의 **현재 후보 수**(실시간 `rules.check`, 디바운스), 슬롯 추가·삭제·순서 이동.
- 제약 목록: 종류 선택(4종) + 종류별 파라미터 폼과 한 줄 설명(예: "같은 회차 안에서 중단원이 서로 달라야 합니다. 중단원이 하나뿐인 단원은 면제"), `needsConfirmation` 이면 노란 "확인 필요" 배지와 note.
- 오른쪽(또는 아래) 상시 **사전 점검**: 슬롯별 막대(필요 vs 가능), 빈 번호 예상, 진단 목록. 오류면 저장 비활성.
- 저장·복제·삭제(확인)·프리셋 되돌리기. 저장하지 않고 떠나면 확인.

## 5D1-4. 시험 만들기 마법사 `screens/generate/` (DESIGN.md §4.4, 상단 단계 표시)
 1. **규칙 선택**: 과목별 규칙 카드(describeRuleSet 요약 + 은행 후보 현황 + 확인 필요 배지).
 2. **옵션**: 문제 순서 섞기(켬), 선지 섞기(켬), 정답 위치 균형(켬, 최소 비율 % 입력 — 기본 10), 최근 N회 출제 문제 제외(끔/숫자), 시드(자동 — "다시 만들기용 번호"로 표시 / 직접 입력), 제목 형식(기본 `{규칙 이름} 모의고사 {회차}회`).
 3. **사전 점검**: `rules.check` 결과 막대 + 진단. 빈 번호가 예상되면 어디가 몇 개 비는지 안내하고 그래도 진행 가능. 오류면 진행 불가(이유).
 4. **결과 미리보기**: 회차 탭(1회~N회), 문제지/정답지/해설지 전환 — `render-html` 의 `renderExamHtml` 로 만든 **A4 종이 모양** 미리보기(sandbox iframe, 확대/축소 버튼), 오른쪽 문항 목록(번호·학습목표·슬롯·문제 앞부분·빈 번호 표시) — 문항마다 **"다른 문제로 바꾸기"**, 빈 번호에는 **"채우기 시도"**, 회차 탭에 **"이 회차 다시 뽑기"**. 바꾼 결과는 즉시 미리보기에 반영, 진단(대체 후보 없음 등)은 토스트/패널로. 정답 분포(①~⑤ 개수) 작은 표시.
 5. 다음 단계(저장)는 5D2 에서 구현 — 지금은 "파일 저장은 다음 단계에서 제공됩니다" 비활성 버튼과 안내.
- 세션은 화면을 떠나면 확인 후 폐기.

## 5D1-5. 검수용 캡처
캡처 모드 환경변수 `QB_CAPTURE_GENERATE_RULE`(규칙 id, 예: 프리셋 법규)가 있으면 그 규칙으로 고정 시드(`capture`) 생성까지 진행한 **결과 미리보기 단계**를 `generate-result-{theme}-{size}.png` 로 추가 저장. 'rules' 라우트는 첫 규칙이 선택된 상태로 캡처.

## 5D1-6. 문서
`docs/STAGE5D1.md`: 서비스·IPC, 문제 바꾸기·회차 다시 뽑기 알고리즘과 보장 범위, 화면 흐름, 한계. AGENTS.md 최종 보고 형식(계약 변경 요청 포함).
