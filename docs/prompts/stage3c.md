## 3c단계: "중단원은 반드시 서로 다르게 (단, 중단원이 하나뿐인 단원은 면제)"

## 실행 방식
- 계획만 말하고 멈추지 마라. 구현하고 테스트를 돌려 통과한 뒤에만 보고하라. 사용자에게 묻지 마라.
- AGENTS.md, docs/ARCHITECTURE.md(§11), src/contracts/index.ts(**내가 `Constraint.filterCandidates` 의 `state.slot` 에 `pool` 필드를 추가했다 — 다시 읽어라**), docs/STAGE3.md, docs/STAGE3B.md 를 `Get-Content -Encoding UTF8` 로 읽고 시작. `npm.cmd`/`npx.cmd`. 계약 수정 금지. 실제 문제 파일(문제 디비/, 규칙.docx), `.tmp-realcheck/` 접근 금지.

## 사용자 결정
"한 대단원 슬롯 안의 문제는 **반드시** 중단원이 서로 달라야 한다. 다만 그 슬롯에 중단원이 하나뿐이면(예: 법규 2-1 만 존재) 이 조건을 적용하지 않고 그대로 뽑는다. 후보가 모자라면 빈 번호로 남긴다."
→ 중단원이 4개뿐인 슬롯에서 5문제가 필요하면 4문제만 뽑고 1개는 **빈 번호**(blanks)로 남긴다. 중복 중단원으로 채우지 않는다.

## 3c-1. constraints/distinct-by-segment
- (계약) `state.slot.pool: readonly Question[]` 는 **지금 채우는 슬롯의 정적 후보 풀**(슬롯 필터에 일치하고 학습목표 코드가 파싱되는 문제 전부, 동적 제약 적용 전)이다. 선택기가 채워 넣어야 한다(3c-2).
- params `mode` 를 `'strict' | 'prefer' | 'strict-unless-single'` 로 확장하고 **기본값을 `'strict-unless-single'`** 로 바꿔라.
  - `strict-unless-single`: scope 'slot' 일 때, `state.slot.pool` 안의 서로 다른 `segmentKey(code, depth)` 가 **1종 이하**이면 제약을 **면제**(후보를 그대로 반환). 2종 이상이면 strict 와 동일하게 이미 뽑은 구간의 후보를 제거. scope 'exam' 일 때는 `state.currentChosen` 기준으로 같은 판정을 하되, 면제 판단은 `state.slot.pool` 이 아니라 후보 전체가 단일 구간인지로 하지 말고 **면제 없이 strict** 로 동작(시험 전체 범위에서는 면제를 두지 않는다).
  - `strict`/`prefer` 는 기존 동작 유지.
- verify: `strict-unless-single` 은 strict 와 같이 위반을 error `SEGMENT_NOT_DISTINCT` 로 보고하되, 면제된 슬롯(구간 1종)에서의 반복은 위반이 아니다. 그런데 verify 는 슬롯 풀 정보를 받지 못하므로, 시험 전체에서 같은 구간이 반복된 경우를 **info** `SEGMENT_REUSED`(“면제 가능 여부는 선택 단계에서 판단했습니다”) 로만 보고하라(error 로 내지 말 것). 이 한계를 STAGE3C.md 에 적어라.
- 테스트: (a) 중단원 6종·5문제 → 항상 5개 모두 다른 중단원(시드 200개). (b) 중단원 1종뿐인 슬롯에서 5문제 → 5개 모두 채움(면제). (c) 중단원 4종·5문제 → 4개만 채우고 1개 blank, 4개는 모두 다른 중단원(중복 채움 없음). (d) 중단원 2종, 한 종이 이미 다른 회차에서 소진된 경우 등 no-overlap 과 조합. (e) 기존 strict/prefer 테스트 유지.

## 3c-2. selector
- 각 슬롯의 정적 풀(`slot.pool`)을 `filterCandidates` 의 `state.slot.pool` 로 전달하라(이미 슬롯별 `entry.pool` 이 있다).
- 빈 번호 진단 `SLOT_BLANK` 의 원인 안내 문구에 "중단원이 서로 달라야 하는 규칙 때문에 N개 비었습니다" 같은 설명이 제약 이름으로 드러나게 하라(기존 원인 추정 로직 활용).
- 테스트: 위 (c) 시나리오를 selector 통합 테스트로(법규형 4슬롯, 4회차, no-overlap + no-duplicate-content + distinct-by-segment 조합), 성능(3b-8 기준 유지: 후보 800, 1초 이내), 결정성.

## 3c-3. 프리셋 (rules/presetRuleSets)
- 법규 프리셋의 `distinct-by-segment`(depth 2, scope slot) 를 `mode: 'strict-unless-single'`, **`needsConfirmation: false`** 로 바꾸고 note 를 "한 대단원의 문제는 중단원이 서로 달라야 하며, 중단원이 하나뿐인 대단원은 면제합니다. 중단원이 문제 수보다 적으면 남는 자리는 빈 번호로 남습니다." 로 갱신.
- 해부 프리셋은 변경 없음.
- `describeRuleSet` 문장에 위 모드 설명이 나오게. 테스트 갱신.

## 마무리
`docs/STAGE3C.md` 에 변경점·한계 기록. `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과. AGENTS.md 최종 보고 형식으로 보고.
