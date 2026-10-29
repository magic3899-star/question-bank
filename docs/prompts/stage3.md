## 3단계: 등급 필터 + 학습목표 코드 + 출제 규칙 엔진 + 선택기 + 섞기 + 불변 조건 테스트

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 파일을 만들고 테스트를 돌려 통과한 뒤에만 최종 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md(§3 의존 규칙에 `objective-code` 모듈이 새로 추가됨), src/contracts/index.ts, docs/STAGE1.md, docs/STAGE2.md 를 `Get-Content -Encoding UTF8` 로 읽어라. `npm.cmd`/`npx.cmd` 사용. 네트워크 설치 금지(새 패키지가 꼭 필요하면 보고서에 적고 대안으로 구현).
- 계약 수정 금지. 실제 문제 파일(문제 디비/, 규칙.docx) 접근 금지, `.tmp-realcheck/` 건드리지 말 것. 테스트 데이터는 `tests/fixtures/builders.ts` 로 만든 가짜 문제.
- `.dependency-cruiser.cjs` 를 새 의존 규칙에 맞게 갱신하라: `objective-code`(contracts 만 import 가능), `rules → contracts, objective-code`, `constraints/* → contracts, content-model, objective-code`(형제 constraints 끼리 금지, 집계 `constraints/index.ts` 는 하위 import 허용), `selector → contracts, content-model, objective-code`, `shuffler/*`(형제 금지, 집계 허용, rng import 가능 — 섞기에 쓸 `shuffled` 유틸만). 위반 import 를 임시로 만들어 각 규칙이 실제로 실패하는지 확인하고 지워라.

## 3-0. importers/docx — 등급 필터 (`includeGrades`)
`parse` 의 options 에 `includeGrades?: string[] | null` 을 추가(기본 `['A']`; `null` 또는 `[]` 이면 모든 등급 포함).
- 학습목표 줄에서 읽은 등급(`(A)`, `A항` 모두 `A` 로 정규화됨)이 **있고** includeGrades 에 없으면 그 문제는 `draft.questions` 에 넣지 않고, 문제마다 info 진단 `SKIPPED_BY_GRADE`(메시지에 등급, 출처태그, 문제 앞 20자 미리보기, "등급 필터를 바꾸면 가져올 수 있습니다" 안내, ref 에 sourceTag)를 남긴다. 건너뛴 문제의 이미지 asset 은 draft.assets 에서도 제외(다른 문제가 같은 이미지를 쓰면 유지).
- 등급 표시가 **없는** 문제는 포함하고 warn `GRADE_MISSING` 을 낸다(조용히 버리지 않는다).
- 테스트: 기본값, `['A','B']`, `null`, 건너뜀 진단 내용, 등급 없음 경고, 건너뛴 문제의 이미지 정리, 건너뛴 문제가 레코드 경계 판정을 망치지 않음(다음 문제 정상 인식).

## 3-A. src/modules/objective-code (신규, 순수)
학습목표 코드 `"해부 2-2-4"` 를 다룬다.
- `parseObjectiveCode(code): { subject: string; segments: number[] } | null` (공백 정규화, 전각 공백/연속 공백 허용, 형식 불일치는 null)
- `matchesObjectivePrefix(code, prefix): boolean` — **구간(segment) 단위 비교**. prefix 예: `"해부 1"`, `"해부 1-"`, `"해부 2-2"`, `"해부"`(과목만). `"해부 1"` 은 `"해부 1-2-3"` 에 일치하고 `"해부 14-1-3"` 에는 **일치하지 않는다**. 후행 하이픈 있어도 같은 의미. 과목명이 다르면 불일치. 코드가 파싱 불가면 불일치.
- `segmentKey(code, depth): string | null` — 앞의 depth 개 구간으로 만든 키(예: depth 2 → "해부 2-2"). depth 가 구간 수보다 크면 가능한 만큼.
- `compareObjectiveCodes(a,b): number` (과목, 구간 숫자 순)
- 테스트: 위 예시, 엣지(빈 문자열, 이상한 입력, 구간 1개, 큰 숫자), `해부 1` vs `해부 14` 혼동 방지.

## 3-B. src/modules/rules (순수)
- `RULESET_SCHEMA_VERSION = 1` 상수와 `validateRuleSet(rules: RuleSet, knownConstraintKinds?: string[]): Diagnostic[]` — 검사: id/name/subject 비어 있지 않음, examCount ≥ 1 정수, startNumber 정수, slots 1개 이상, slot id 유일, slot count 양의 정수, filter 종류별 필수 필드(objectivePrefix 의 prefixes 비어 있지 않음 등), 제약 kind 가 알려진 목록에 있는지(목록이 주어졌을 때), `needsConfirmation` 제약이 있으면 info `UNCONFIRMED_RULE`. 메시지는 한국어로 고치는 방법까지.
- `slotsTotalCount(rules)`, `describeRuleSet(rules): string[]` (사람이 읽는 요약 문장 목록: "회차 4개, 각 7문제", "슬롯 '해부 1~2단원': 2문제 …", 제약 설명 — UI 가 그대로 보여줄 것).
- 프리셋(데이터만, 코드 로직 없음) `presetRuleSets(): RuleSet[]`:
  1. 구강해부학(`subject: 'anatomy'`, examCount 4, startNumber 21): 슬롯 6개 — ① prefixes ['해부 1','해부 2'] 2문제 ② ['해부 3'] 1문제 ③ ['해부 4'] 1 ④ ['해부 5'] 1 ⑤ ['해부 6'] 1 ⑥ ['해부 7','해부 8','해부 9'] 1문제 (합계 7). 제약: `no-overlap-across-exams`(scope all, needsConfirmation: true, note "4개 모의고사 사이에 같은 문제가 겹치면 안 되는지 확인 필요"), `no-duplicate-content`(scope run, 확정).
  2. 의료관계법규(`subject: 'law'`, examCount 4, startNumber 1): **미완성 프리셋**. 슬롯 1개만 — ['법규 1'] 5문제. `note: '규칙 문서에 대단원 2·3·4 규칙이 없어 미완성입니다. 출제 규칙 화면에서 나머지 슬롯을 추가하세요.'` 제약: `distinct-by-segment`(params {depth: 2, scope: 'slot'}, needsConfirmation: true, note "5문제의 중단원(법규 1-x)이 서로 달라야 하는지 확인 필요"), `distinct-by-segment`(depth 3, scope 'exam' — 같은 학습목표 중복 금지, 확정), `no-overlap-across-exams`(needsConfirmation: true), `no-duplicate-content`.
  프리셋은 `validateRuleSet` 을 통과해야 한다(법규는 info/warn 허용, error 없음). 테스트로 확인.
- 테스트: 정상, 각 오류 유형, describeRuleSet 문장, 프리셋 검증, 입력을 변형하지 않음(불변).

## 3-C. src/modules/constraints/* (제약 플러그인, 각 폴더 독립 + 집계 `constraints/index.ts` 의 `standardConstraints: Constraint[]`)
`Constraint`(contracts) 의 `filterCandidates` 와 `verify` 를 구현. 모두 순수. `state.currentChosen` 은 지금 뽑는 시험에서 이미 뽑힌 문제들(이전 슬롯 + 이번 슬롯에서 앞서 뽑은 것), `state.slot` 은 지금 채우는 슬롯의 id 와 그 슬롯에서 이미 뽑은 문제들, `state.chosenSoFar` 는 앞선 회차들의 완성된 시험들. (계약의 `Constraint.filterCandidates` state 에 `slot` 필드가 추가되었다 — 계약을 다시 읽어라.) `spec.params` 는 검증하고 잘못되면 `verify` 에서 error 진단(`CONSTRAINT_PARAMS_INVALID`)을 내며 `filterCandidates` 는 후보를 그대로 둔다(예외 던지지 않음).
 1. `no-overlap-across-exams` (id/kind: 'no-overlap-across-exams', params `{ scope?: 'all' }`): 앞선 회차에 이미 쓰인 문제 ID 는 후보에서 제거. verify: 회차 간 ID 중복 있으면 error `OVERLAP_ACROSS_EXAMS`(어느 문제가 몇 회·몇 회에 중복인지).
 2. `no-duplicate-content` (params `{ scope?: 'exam' | 'run' }` 기본 'run'): 지문 동일 문제(stem+passage 정규화 텍스트 + 선지 집합까지 동일 = "완전 동일")가 이미 같은 시험(scope exam) 또는 모든 회차(scope run)에 있으면 후보 제거. 정규화는 content-model 의 `blocksToPlainText` 후 모든 공백·전각공백·앞 번호 제거, 소문자. verify: 위반 시 error `DUPLICATE_CONTENT_SELECTED`.
 3. `distinct-by-segment` (params `{ depth: number; scope?: 'slot' | 'exam' }`, 기본 'exam'): `segmentKey(code, depth)` 가 같은 문제를 둘 이상 뽑지 않음. scope 'exam' 은 `state.currentChosen` 기준, scope 'slot' 은 `state.slot.chosen` 기준(계약에 `slot` 정보가 새로 추가되었다 — 선택기가 슬롯마다 채워 준다). 학습목표 코드가 없거나 파싱 불가인 문제는 대상이 아니다(통과). verify 는 위반 시 error `SEGMENT_NOT_DISTINCT`(scope 'slot' 의 verify 는 `rules` 를 받지 못하므로 'exam' 범위로만 검사하고, 슬롯 범위 검증이 불가능하다는 점을 STAGE3.md 에 기록). depth 를 코드 전체(예: 3)로 주면 "같은 학습목표 중복 금지" 가 된다.
 4. `exclude-recent` (params `{ lastNExams: number }`): `ctx.history`(최신순이라고 가정하지 말고 createdAt 으로 정렬) 중 최근 N 개 시험의 questionIds 를 후보에서 제거. verify: 위반 시 error `RECENT_QUESTION_USED`.
 - 각 제약 폴더에 자체 테스트(정상/경계/잘못된 params/입력 불변). 형제 import 금지.

## 3-D. src/modules/selector (순수)
`createSelector(constraints: readonly Constraint[]): Selector` (contracts 의 Selector 구현). 제약은 `kind` 로 찾는다(`ConstraintSpec.kind === Constraint.id`).
**select(rules, candidates, ctx)** 알고리즘:
 - 후보 풀: 학습목표 코드가 파싱 가능한 문제만(없는 문제는 제외하고 info `NO_OBJECTIVE_EXCLUDED` 1건 요약: 몇 개). 슬롯 `filter` 는 구간 단위 매칭(`matchesObjectivePrefix`)으로 평가: `all`, `objectivePrefix`(prefixes 중 하나라도 일치), `tag`(tags 중 하나라도 포함), `sourceTag`(values 중 하나와 일치).
 - 회차(0..examCount-1)마다, 슬롯들을 **후보가 적은 순서**로 처리(가장 제약 심한 슬롯 먼저)하되 결과 `questions` 는 **rules.slots 순서**로 평탄화. 한 슬롯 안에서는 문제를 하나씩 뽑는다: 후보 = 슬롯 필터 일치 ∧ 이 회차에 아직 안 뽑힘 ∧ 모든 제약의 `filterCandidates` 통과(매번 현재 선택분 `currentChosen` 반영해 다시 계산) → `rng.fork('exam{e}/slot{slotId}/attempt{k}')` 로 무작위 하나.
 - **되돌림(backtracking)**: 슬롯 내 후보가 바닥나 count 를 못 채우면 해당 슬롯을 다른 난수열로 다시 시도(최대 200회). 그래도 실패하면 회차 전체를 다시 시도(최대 50회, 다른 fork). 그래도 실패하면 error `SLOT_SHORTAGE`(슬롯 라벨, 필요/가능 수, 원인이 된 제약 이름 추정 — 제약 적용 전후 후보 수 비교로 어떤 제약이 후보를 몇 개 줄였는지 한국어로) 를 내고 가능한 만큼만 채운 결과를 돌려준다(예외 던지지 않음).
 - 모든 회차 완료 후 각 제약의 `verify` 진단을 모아 포함. `needsConfirmation` 제약이 하나라도 적용되었으면 warn `UNCONFIRMED_RULE_APPLIED`(해당 제약 note 포함). 
 - 같은 입력 + 같은 `ctx.rng.seed` 면 항상 같은 결과(결정성). 입력 배열/객체 변형 금지.
 - 알 수 없는 constraint kind → error `UNKNOWN_CONSTRAINT`(실행은 해당 제약 없이 계속하지 말고 select 를 중단하고 빈 결과 + 오류 진단).
**precheck(rules, candidates, ctx)**: (a) `UNKNOWN_CONSTRAINT`; (b) 슬롯별 정적 후보 수(슬롯 필터 일치) 대비 필요 수(`count × (no-overlap-across-exams 가 있으면 examCount, 아니면 count)`) 를 계산해 부족 시 error `SLOT_SHORTAGE`(필요/가능/부족 개수 한국어), 여유가 1.2배 미만이면 warn `SLOT_TIGHT`; (c) 학습목표 없는 문제 수 info; (d) 시험 삼아 `select` 를 `rng = createRng('precheck')` 로 한 번 돌려 실패 진단이 있으면 함께 반환. 위 진단들의 `message` 는 한국어, 사용자가 무엇을 고쳐야 하는지(문제 추가/슬롯 개수 조정/제약 완화) 안내. precheck 는 `rng` 를 `ctx.rng` 가 아닌 자체 시드로 쓰고 부작용 없음.
 - 테스트 (tests/fixtures/builders.ts 사용, 가짜 코드 "과목 1-2-3" 등):
   기본 개수/슬롯 순서; 결정성; 시드 다르면 다름(충분히 큰 풀에서); `해부 1` 슬롯이 `해부 14-1-3` 을 뽑지 않음; distinct-by-segment 가 실제로 작동(후보가 충분한 경우 항상 만족 — 시드 200개 반복); no-overlap 회차 간 중복 0(시드 100개); exclude-recent; no-duplicate-content(완전 동일 문제 쌍이 한 시험/전체에 둘 다 안 나옴); 후보 부족 시 SLOT_SHORTAGE 메시지 내용; SLOT_TIGHT; 제약 때문에 부족한 경우 원인 제약명이 메시지에 나옴; UNKNOWN_CONSTRAINT; UNCONFIRMED_RULE_APPLIED; 학습목표 없는 문제 제외 info; **탐욕 선택이 실패하지만 되돌림으로 해결되는 인위적 사례**(예: 슬롯 A 가 문제 x 를 먼저 뽑으면 슬롯 B 가 불가능해지는 구성) ; 입력 불변; 성능(후보 800개, 슬롯 6개, 4회차 ≤ 1초).

## 3-E. src/modules/shuffler/standard (순수) + 집계 `shuffler/index.ts` 의 `shufflers: Shuffler[]`
`Shuffler`(contracts) id `'standard'`. `apply(exam, options, rng)` — 입력을 변형하지 않고 새 `SelectedExam` 을 돌려준다(Question 객체도 복사).
 - `shuffleQuestionOrder`: 문제 순서를 섞는다. 단위(unit) = 같은 `passageGroupId` 를 가진 문항들의 묶음(묶음 내부 상대 순서 유지, 연속 배치), `passageGroupId` 없으면 문제 하나가 한 단위. false 면 순서 유지. `slotOfQuestion` 은 그대로 보존.
 - `shuffleChoices`: `shufflePolicy === 'free'` 인 문제에서 `fixedPosition` 이 아닌 선지들만, **고정 선지가 차지한 위치를 제외한 나머지 위치들 안에서** 무작위로 재배치(고정 선지는 원래 인덱스 유지). `lock-all` 이면 변경 없음. 정답은 선지 ID 라 그대로 유지됨. false 면 변경 없음.
 - `balanceAnswerPositions`(shuffleChoices 가 true 일 때만 의미): 단일 정답이면서 `free` 인 문제들에 대해, 정답이 놓일 수 있는 위치(고정 선지가 점유하지 않은 위치)의 집합을 구하고, 시험 전체에서 정답 위치별 개수가 **가능한 범위에서 최대 1 차이 이내**가 되도록 목표 위치를 탐욕적으로 배정(현재 개수가 가장 적은 위치 우선, 동률은 rng) 한 뒤, 그 위치에 정답이 오도록 나머지 선지를 무작위 배치. 복수 정답·고정 선지로 불가능한 문제는 일반 무작위. 균형이 불가능한 경우(예: 문제가 위치 수보다 훨씬 적음)는 가능한 한 고르게.
 - 난수는 용도별로 `rng.fork('order')`, `rng.fork('choices/{questionId}')`, `rng.fork('balance')` 처럼 분리해 한 부분의 변경이 다른 부분의 결과를 흔들지 않게 한다.
 - 테스트: 개별 동작 + 아래 불변 조건 테스트.

## 3-F. tests/invariants — 불변 조건 테스트 (가장 중요, 새 섞기 전략은 모두 이걸 통과해야 함)
`tests/invariants/shuffler.invariants.test.ts`: `shufflers`(집계 파일) 의 **모든 플러그인**에 대해, `createRng` 시드 500개 이상으로 생성한 무작위 시험들(문항 수 0·1·2·20, 선지 2~6개, 고정 선지 섞임, lock-all 문제, 복수 정답 문제, 선지 본문이 같은 선지가 있는 문제, passageGroup(3개 묶음 포함), passage/이미지/표가 있는 문제, 모든 선지가 고정인 문제)을 만들어 옵션 조합(`shuffleQuestionOrder`/`shuffleChoices`/`balanceAnswerPositions` 모든 8가지)마다 다음을 검사:
 1. 입력 객체가 변형되지 않음(깊은 비교 + 입력을 deep-freeze 해서 실행).
 2. 문제 집합 동일(ID 누락·중복 없음), `stem`, `passage`, `explanation`, `objectiveCode`, `answerChoiceIds`, `subject` 등 선지 외 필드가 문제별로 전혀 바뀌지 않음(깊은 비교).
 3. 각 문제의 선지 집합이 동일(ID 별로 content 가 완전히 같고 누락·중복·변형 없음).
 4. **정답 추적**: 섞은 뒤에도 `answerChoiceIds` 가 가리키는 선지의 content 가 원래와 같다(ID→content 맵으로 비교) — 정답 위치가 아니라 ID 로 추적됨을 증명.
 5. `fixedPosition` 선지와 `lock-all` 문제의 선지는 인덱스 불변.
 6. 같은 passageGroupId 문항은 연속 배치되고 묶음 내부 상대 순서 유지.
 7. 결정성: 같은 시드로 두 번 실행하면 deep-equal. 다른 시드면 (충분히 큰 경우) 대부분 달라짐.
 8. `slotOfQuestion` 보존.
 9. balanceAnswerPositions: 모든 문제가 free·단일 정답·고정 없음인 시험에서 정답 위치별 개수 최대-최소 ≤ 1.
 10. shuffleChoices=false 이면 모든 선지 순서 불변, shuffleQuestionOrder=false 이면 문제 순서 불변.
이 테스트가 정말로 위반을 잡는지 확인하기 위해, 테스트 파일 안에 **의도적으로 잘못된 가짜 섞기 구현 3종**(선지 content 를 바꿈, 정답을 위치로 추적, 고정 선지를 움직임)을 만들어 불변 조건 검사 함수가 실제로 실패를 보고하는지 검증하는 메타 테스트를 둬라(검사 함수를 재사용 가능한 `assertShufflerInvariants(shuffler)` 로 분리해 export).

## 3-G. 마무리
- `docs/STAGE3.md` 작성: 모듈 사용법, 알고리즘 요약, **한계/가정/계약 변경 요청 후보**(특히 distinct-by-segment 의 슬롯 범위 verify 한계), 규칙 프리셋의 미확정 항목.
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과(기존 115개 포함).
- AGENTS.md 최종 보고 형식으로 보고. 못 한 것은 솔직히.
