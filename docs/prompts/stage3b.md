## 3b단계: 사용자가 확정한 규칙 반영

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 구현하고 테스트를 돌려 통과한 뒤에만 보고하라. 사용자에게 묻지 마라.
- AGENTS.md, docs/ARCHITECTURE.md(§11 확정된 결정), src/contracts/index.ts(**내가 `SelectedExam.blanks`, `SnapshotItem.blank` 를 추가했다 — 다시 읽어라**), docs/STAGE1~3.md 를 `Get-Content -Encoding UTF8` 로 읽고 시작. `npm.cmd`/`npx.cmd` 사용. 계약 수정 금지. 실제 문제 파일(문제 디비/, 규칙.docx), `.tmp-realcheck/` 접근 금지.
- 기존 테스트는 계약 변경과 이번 결정에 맞게 고쳐도 된다(이유를 보고에 적어라). 모든 검사 통과 필수.

## 확정된 결정 (사용자 답변)
1. **(A) 또는 A항 등급 문제만 가져온다.** 등급이 없거나 다른 등급이면 제외. **학습목표 줄이 없는 문제도 제외.** 제외된 문제는 조용히 사라지면 안 되고 목록(진단)으로 남긴다.
2. **출처 태그는 무시.** 태그 줄은 문제 경계 판정(해설에 흡수되지 않게)에만 쓰고, 저장하지 않으며(`sourceTag` 미설정), 태그 관련 진단(`SOURCE_TAG_MALFORMED` 등)은 내지 않는다.
3. **지문이 같은 문제 = 중복. 같은 지문 중 문서에서 첫 번째 1문제만 사용한다**(나머지는 가져오기에서 제외하고 목록으로 남김). 그래도 은행에 같은 지문 문제가 따로 들어와 있을 수 있으므로, 선택 단계에서도 한 시험·4개 모의고사 전체(run)에 함께 나오지 않게 한다(안전장치).
4. **4개 모의고사끼리 문제 겹침 금지**(확정).
5. **후보가 모자라면 빈 번호(공백)로 남긴다.** 오류로 중단하지 않는다.
6. 법규는 대단원 1·2·3·4 각 5문제(총 20문제 × 4회).
7. 정답 위치 편중은 섞을 때 바로잡되 **완전히 고를 필요는 없다.** 각 정답 위치(①~⑤)가 시험 문항 수의 **최소 10%** 이상이면 충분하고 약간의 편중은 허용(3b-7 참조).
8. 법규 대단원처럼 중단원이 하나뿐인 단원(예: 2-1 만 존재)은 "서로 다른 중단원" 조건을 적용하지 않고 그 중단원에서 그대로 뽑는다(= 3b-4 의 prefer 모드).

## 3b-1. importers/docx
- `includeGrades` 기본 `['A']` 유지. 변경: 등급 표시가 **없는** 문제도 제외한다(3단계에서 만든 `GRADE_MISSING` 경고 동작을 제거). 제외 진단 `SKIPPED_BY_GRADE` 의 메시지에 사유(“등급 B”, “등급 표시 없음”)를 구분해서 적는다. `includeGrades` 가 `null`/`[]` 이면 등급 필터 없음(이 경우 등급 없는 문제는 포함).
- 새 옵션 `requireObjective?: boolean`(기본 true): 학습목표(코드)가 없는 문제는 제외하고 문제마다 info `SKIPPED_NO_OBJECTIVE`(출처 문단 위치, 문제 앞 20자). false 면 포함(OBJECTIVE_MISSING 은 validators 가 경고).
- 제외된 문제의 이미지 asset 정리, 다음 문제 경계 인식에 영향 없음 — 기존 테스트 유지.
- 출처 태그: 위 결정 2 대로. 태그 줄을 만나면 이전 레코드를 닫고 무시한다(`<2026-01-26` 처럼 닫는 `>` 없는 것도 같은 방식으로 무시, 진단 없음).
- 테스트 갱신/추가: 등급 없음 제외, 등급 B 제외, 사유 구분 메시지, 학습목표 없음 제외, `requireObjective:false`, 태그 무시(저장 안 됨, 진단 없음), 태그가 해설에 흡수되지 않음.

## 3b-1b. importers/docx — 같은 지문은 첫 문제만
- 새 옵션 `dedupeByPassage?: boolean`(기본 true). 등급·학습목표 필터를 통과한 문제들 중 `questionContentKey`(아래 3b-2)가 같은 문제가 여럿이면 **문서 순서상 첫 번째만 남기고** 나머지는 제외, 제외 문제마다 info `SKIPPED_DUPLICATE_PASSAGE`(제외된 문제 위치, 문제 앞 20자, "남긴 문제: …번째 문단 부근" 안내). 필터에서 먼저 제외된 문제는 "첫 번째" 후보가 아니다(통과한 것 중 첫 번째). 이미지 asset 정리 포함. `false` 면 모두 포함.
- 테스트: 지문 같고 선지 다른 쌍 → 첫 번째만 남음, 3개 이상 그룹, 텍스트 같고 이미지 다른 경우는 다른 지문, 등급으로 먼저 제외된 문제는 기준이 되지 않음, `dedupeByPassage:false`.
- (참고: 은행에 이미 있는 문제와의 중복 판정은 나중에 앱 단계에서 같은 `questionContentKey` 로 한다.)

## 3b-2. 중복 판정의 단일 기준 — content-model
- `questionContentKey(q: { stem: Block[]; passage?: Block[] }): string` 를 content-model 에 추가·export: stem + passage 의 `blocksToPlainText` 를 합쳐 모든 공백(전각 포함)과 문장 앞 문제 번호 접두("1.", "01.")를 제거하고 소문자화. **이미지가 있으면 이미지 asset id 도 키에 포함**(텍스트가 같아도 그림이 다르면 다른 지문). **선지는 키에 포함하지 않는다.** 테스트.
- `validators/duplicate-stem`: 이 함수를 사용. 지문이 같은 모든 그룹을 warn 으로 보고한다. 코드는 유지(`DUPLICATE_EXACT`: 선지까지 같음, `DUPLICATE_STEM_VARIANT`: 선지만 다름)하되 두 경우 모두 severity **warn**, 메시지에 "지문이 같아 중복으로 취급되며 한 시험·모든 회차에서 함께 출제되지 않습니다" 안내.
- `constraints/no-duplicate-content`: 같은 함수(`questionContentKey`)를 사용하고 **선지 비교는 하지 않는다**(지문만 같으면 중복). 기본 scope 'run'. 메시지/테스트 갱신(선지가 다른 변형 문제 쌍도 함께 뽑히지 않음).

## 3b-3. 빈 번호(공백) — selector, shuffler, rules
- (계약) `SelectedExam.blanks: { slotId: string; count: number }[]` (후보가 모자라 채우지 못한 자리). `SnapshotItem.blank?: boolean`.
- selector: 후보 부족은 더 이상 error 가 아니다. 되돌림 시도(슬롯 200회/회차 50회)를 그대로 하되, 끝내 못 채우면 **채운 만큼만 선택하고 `blanks` 에 부족 개수를 기록**, 진단은 warn `SLOT_BLANK`(회차, 슬롯 라벨, 필요/채움/비는 개수, 원인 제약명 추정, "빈 번호로 남습니다" 안내). 성공 시 `blanks: []`. 모든 `SelectedExam` 에 `blanks` 포함.
- precheck: 슬롯 부족은 error 가 아니라 warn `SLOT_SHORTAGE`(“N개 모자라 시험지에 빈 번호가 생깁니다”) 로 바꾼다. 학습목표 없는 문제 info 는 유지. UNKNOWN_CONSTRAINT 만 error.
- shuffler: `blanks` 를 변경 없이 그대로 전달. 불변 조건 테스트(`assertShufflerInvariants`)에 "blanks 보존" 추가. tests/fixtures/builders.ts 의 `SelectedExam` 생성 헬퍼도 갱신.
- rules: `describeRuleSet` 에 "후보가 모자라면 빈 번호로 남습니다" 문장 추가.

## 3b-4. distinct-by-segment '가능하면' 모드
`constraints/distinct-by-segment` params 에 `mode?: 'strict' | 'prefer'`(기본 'strict') 추가. 'prefer': 중복 구간을 피한 후보가 **하나라도 있으면** 그것만 반환하고, **하나도 없으면** 필터링하지 않은 후보를 그대로 반환(= 가능한 한 서로 다른 구간, 불가능하면 허용). verify 는 prefer 모드에서 위반을 error 가 아니라 info `SEGMENT_REUSED`(몇 번 재사용) 로 보고. 테스트: strict 와 prefer 의 차이, 중단원이 부족한 슬롯(예: 서로 다른 중단원 후보가 2종뿐인데 5문제 필요)에서 prefer 는 5문제를 채우고 strict 는 blank.

## 3b-5. 규칙 프리셋 갱신 (rules/presetRuleSets)
 1. 법규(`law`, examCount 4, startNumber 1): 슬롯 4개 — 'prefixes: ['법규 1']' 5문제, ['법규 2'] 5, ['법규 3'] 5, ['법규 4'] 5 (합계 20). 제약: `no-overlap-across-exams`(scope all, **확정**: needsConfirmation 제거), `no-duplicate-content`(scope run, 확정), `distinct-by-segment`(depth 3, scope exam, mode strict, 확정 — 같은 학습목표 중복 금지), `distinct-by-segment`(depth 2, scope slot, **mode prefer**, `needsConfirmation: true`, note "규칙 문서의 ‘첫째·둘째 번호가 안 겹치도록’을 ‘슬롯(대단원) 안에서 중단원이 서로 다르게’로 해석했습니다. 대단원 2는 중단원이 1개뿐이라 엄격 적용이 불가능해 ‘가능하면’으로 적용합니다. 확인 필요"). 미완성 note 는 제거하고 note 에 위 해석 안내만 둔다.
 2. 구강해부학: 기존 슬롯 유지. 제약: `no-overlap-across-exams`(확정), `no-duplicate-content`(run, 확정). `needsConfirmation` 제약 없음.
 - 프리셋 검증 테스트와 `describeRuleSet` 문장 테스트 갱신. 법규 프리셋도 이제 슬롯 합계가 20 이어야 한다(테스트).

## 3b-7. 정답 위치 균형 완화 (shuffler/standard)
- (계약) `ShuffleOptions.minAnswerPositionShare?: number` 가 추가되었다(기본 0.1).
- `balanceAnswerPositions` 가 true 일 때: 단일 정답·free·정답이 놓일 수 있는 위치가 있는 문제 수를 n 이라 하고 위치 수를 P(= 선지 수의 최댓값 또는 5)라 할 때, 각 위치의 **최소 보장 개수** `m = ceil(minAnswerPositionShare × n)` 을 구한다(`P × m > n` 이어서 불가능하면 `m = floor(n / P)`). 각 위치가 최소 m 개를 갖도록 목표 위치를 먼저 배정(고정 선지 때문에 그 위치에 놓을 수 없는 문제는 가능한 위치 중에서)하고, **남은 문제들은 정답 위치를 제약 없이 무작위**로 둔다(약간의 편중 허용). 이전의 "최대-최소 ≤ 1" 균등 배정 방식은 폐기한다.
- 불변 조건 테스트 9번을 바꿔라: 모든 문제가 free·단일 정답·고정 없음이고 선지 수가 같은 시험에서, 문항 수 n 에 대해 각 정답 위치 개수 ≥ 위 m. n < P 인 경우는 보장 대상이 아님(가능한 한 서로 다른 위치). 시드 500개 반복. 편중이 남을 수 있음(최소만 보장)도 문서화.
- 테스트: n=7, 20, 21, 100 에서 최소 보장, 균등하지 않아도 통과하는 경우, 고정 선지로 특정 위치가 불가능한 문제가 섞인 경우, `minAnswerPositionShare: 0` 은 균형 없음과 같음.

## 3b-6. validators 영향 확인
- `objective-missing`, `answer-distribution` 등은 유지. `ref.sourceTag` 를 채우는 코드가 있으면 제거(태그 무시).
- 전체 검사 후 STAGE 문서(STAGE2/3.md)의 해당 설명을 갱신하고 `docs/STAGE3B.md` 에 변경점·한계 요약.

## 마무리
`npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과. AGENTS.md 최종 보고 형식으로 보고(계약 변경 요청, 못 한 것 포함).

## 3b-8. selector 성능 — 불가능한 규칙에서 42초 걸림 (반드시 수정)
검수자가 측정한 결과: 후보 800개, 슬롯 4개×5문제, 4회차, 제약 `distinct-by-segment`(depth 2, scope slot, **strict**) + `no-overlap-across-exams` + `no-duplicate-content` 에서, 각 대단원에 중단원이 하나뿐이라 **불가능한** 경우 `select` 가 **약 42초**, `precheck` 도 약 42초. 정상 경우는 76ms. 이제 후보 부족이 오류가 아니라 정상 흐름(빈 번호)이므로 이 경로가 흔하다 — UI 가 멈추면 안 된다.
- 재현 스크립트를 테스트로 만들어라(`selector.test.ts`): 위와 같은 구성(가짜 문제 800개: `법규 {1+i%4}-1-{i}`, 지문 텍스트는 문제마다 다르게)에서 `select` 와 `precheck` 가 각각 **1초 이내**(CI 가 느린 경우를 감안해 기준을 명시), 결과는 슬롯당 가능한 만큼(strict 중단원이라 1문제)만 채우고 `blanks` 에 부족분을 기록, 같은 시드로 두 번 돌리면 결과 동일(결정성).
- 해결 방법(결정적이어야 한다 — 시간(ms)이 아니라 **작업량 카운터**로 상한을 둬라, 벽시계 시간 사용 금지):
  1. 슬롯 내 시도 루프: 최근 K(예: 10)번 연속 시도에서 "채운 문제 수의 최대값"이 늘지 않으면 그 슬롯의 탐색을 중단한다.
  2. 회차 전체 재시도(최대 50): 최근 3번 재시도에서 전체 채운 수가 늘지 않으면 중단한다.
  3. 회차당 `filterCandidates` 호출 횟수에 상한(예: 20,000, 상수로 노출)을 두고 초과하면 지금까지의 최선 결과로 마무리.
  4. 기존의 "되돌림으로 해결되는 인위적 사례" 테스트는 계속 통과해야 한다(조기 중단 때문에 해를 놓치지 않을 것).
- 상한에 걸려 중단된 경우 warn `SELECTION_SEARCH_LIMIT`(“탐색 한도에 도달해 일부 슬롯을 비웠습니다. 제약을 완화하면 더 채울 수 있습니다”)를 `SLOT_BLANK` 와 함께 낸다.
- `precheck` 의 시험 선택은 더 작은 상한(예: 회차당 2,000)으로 돌리고, 정적 후보 수 계산(필요/가능)을 먼저 하라. 불가능 시나리오에서 `precheck` 는 300ms 이내.

## 3b-9. selector 의존 정리
- ARCHITECTURE.md §3 이 `selector → rng` 를 허용하도록 바뀌었다. selector 안에 복사해 둔 `precheckRng` 구현을 삭제하고 `rng` 모듈의 `createRng` 를 import 해서 써라. `.dependency-cruiser.cjs` 를 맞춰 갱신하고 위반이 여전히 잡히는지 확인.
