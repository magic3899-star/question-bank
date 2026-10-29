# 3단계: 출제 규칙·선택·섞기 (3b 결정 반영)

계약은 수정하지 않았다. 사용자가 추가한 `SelectedExam.blanks`, `SnapshotItem.blank`, `ShuffleOptions.minAnswerPositionShare`를 기준으로 구현했다. 외부 패키지 설치·네트워크 접근·실제 문제 파일 접근 없이 가짜 문제와 메모리 DOCX로 검증한다. 3b 변경·한계 요약은 [STAGE3B.md](STAGE3B.md)에 있다.

## 사용법

```typescript
import { docxImporter } from '../src/modules/importers/index';
import { presetRuleSets, validateRuleSet, describeRuleSet } from '../src/modules/rules/index';
import { standardConstraints } from '../src/modules/constraints/index';
import { createSelector } from '../src/modules/selector/index';
import { shufflers } from '../src/modules/shuffler/index';
import { createRng } from '../src/modules/rng/index';

const draft = await docxImporter.parse(input, { subject: 'anatomy' });
// 기본 A만, 학습목표 필수, 같은 지문의 첫 문제만 포함한다.
// 제외 목록은 draft.diagnostics에 남는다.
const rules = presetRuleSets()[0];
const validation = validateRuleSet(rules, standardConstraints.map((plugin) => plugin.id));
const summary = describeRuleSet(rules);
const selector = createSelector(standardConstraints);
const ctx = { rng: createRng('사용자 시드'), history: [] };
const precheck = selector.precheck(rules, candidates, ctx);
const selection = selector.select(rules, candidates, ctx);
const shuffled = selection.exams.map((exam, index) => shufflers[0].apply(exam, {
  shuffleQuestionOrder: true, shuffleChoices: true, balanceAnswerPositions: true,
  minAnswerPositionShare: 0.1,
}, ctx.rng.fork(`shuffle/exam${index}`)));
```

앱 조립 예시이며 `input`, `candidates`는 호출자가 공급한다. 후보 부족은 정상적인 부분 결과다. 각 시험의 `blanks`에 슬롯별 비는 개수가 있고 완성된 시험은 `[]`이다. 경고와 빈 번호를 검수 화면에 표시해야 한다. `startNumber`와 빈 번호의 실제 확정본·출력 반영은 이후 exam-snapshot/출력기 단계의 역할이다.

## 가져오기

`includeGrades` 기본값은 `['A']`이다. B와 등급 없음은 info `SKIPPED_BY_GRADE`로 사유를 구분해 제외한다. `null` 또는 `[]`이면 등급 필터를 해제한다. `requireObjective` 기본 true로 목표 코드 없는 문제는 info `SKIPPED_NO_OBJECTIVE`로 제외한다. false여도 등급 필터는 별도로 적용된다.

`dedupeByPassage` 기본 true로 두 필터를 통과한 문제 중 문서 순서상 같은 지문의 첫 문제만 사용한다. 나머지는 info `SKIPPED_DUPLICATE_PASSAGE`에 제외 위치·본문 앞 20자·남긴 문제의 문단 위치를 남긴다. false이면 모두 포함한다. 출처 태그는 닫는 `>` 유무에 관계없이 경계로만 쓰고 저장·진단에 사용하지 않는다. 상세 형식은 [STAGE2.md](STAGE2.md)를 참고한다.

남은 문제의 본문·지문·선지·해설과 중첩 표를 순회해 참조된 자산만 유지한다. 제외된 문제 전용 자산과 상세 진단을 제거하고 포함된 진단의 `draftIndex`를 다시 연결한다. 필터는 레코드 파싱 뒤 적용하므로 다음 문제의 경계를 바꾸지 않는다.

## 내용 키와 학습목표

`content-model.questionContentKey({ stem, passage })`는 텍스트를 합쳐 줄 앞 문제 번호(`1.`, `01.`), 모든 공백(전각 포함)을 제거하고 소문자화한다. stem과 passage의 중첩 표를 포함한 이미지 asset id를 순서대로 키에 추가한다. 선지는 포함하지 않는다. 가져오기, duplicate-stem validator, no-duplicate-content constraint가 이 함수를 공유한다.

중복 지문 validator는 선지까지 같은 경우 `DUPLICATE_EXACT`, 선지가 다른 경우 `DUPLICATE_STEM_VARIANT`를 모두 warn으로 보고한다. 긴 묶음은 위치 8개와 나머지 수를 표시한다. 지문이 같으면 한 시험·모든 회차에서 함께 출제되지 않는다고 안내한다. objective-missing과 answer-distribution 등 나머지 검사는 유지한다.

`objective-code`의 `parseObjectiveCode`, `matchesObjectivePrefix`, `segmentKey`, `compareObjectiveCodes`는 전각·연속 공백과 하이픈 주변 공백을 정리한다. 숫자는 음수가 아닌 안전한 정수이며 과목과 숫자 사이 공백이 필요하다. `해부 1`은 `해부 14-1-3`과 일치하지 않는다. 깊이는 양의 정수이며 코드보다 깊으면 존재하는 구간까지만 쓴다.

## 제약

| kind | 매개변수와 기본값 | 동작 |
|---|---|---|
| no-overlap-across-exams | scope?: all | 앞선 회차의 문제 ID를 제외한다. 위반은 `OVERLAP_ACROSS_EXAMS` |
| no-duplicate-content | scope?: exam 또는 run, 기본 run | 선지와 관계없이 같은 지문을 제외한다. 위반은 `DUPLICATE_CONTENT_SELECTED` |
| distinct-by-segment | depth: 양의 정수, scope?: slot 또는 exam(기본), mode?: strict(기본) 또는 prefer | strict는 구간 재사용 금지. prefer는 새 구간 후보가 있으면 우선하고 없으면 입력 후보를 그대로 허용 |
| exclude-recent | lastNExams: 0 이상의 정수 | 실제 createdAt 내림차순 최근 N개 시험의 ID를 제외한다. 동률은 examId 순 |

`distinct-by-segment.verify`는 `slotOfQuestion`을 사용해 슬롯 또는 회차 범위를 검사한다. strict 위반은 error `SEGMENT_NOT_DISTINCT`, prefer 재사용은 info `SEGMENT_REUSED`이며 재사용 횟수를 표시한다. 누락·파싱 불가 목표는 이 제약 자체에서 제한하지 않지만 선택기의 후보 풀에서는 제외한다. 잘못된 제약 매개변수는 후보를 그대로 두고 verify에서 `CONSTRAINT_PARAMS_INVALID`를 보고한다.

## 선택과 탐색 상한

1. 모르는 제약은 error `UNKNOWN_CONSTRAINT`로 중단한다. 목표 코드 누락·파싱 불가 문제는 제외하고 info `NO_OBJECTIVE_EXCLUDED` 한 건으로 요약한다.
2. 슬롯의 정적 후보 수를 계산하고 적은 슬롯부터 채운다. 동률은 원래 슬롯 순서다. strict 구간 종류 수와 후보 ID 수로 최대 충족 가능 수의 상한도 계산한다. 그 상한을 채우면 더 탐색하지 않는다.
3. 문항마다 현재 회차 ID 중복을 제거하고 제약을 순서대로 적용한다. 이전 회차·현재 회차·현재 슬롯 선택분을 전달한다. 부분 슬롯도 뒤 슬롯까지 탐색하며 이전 슬롯을 되돌리는 탐색을 유지한다.
4. 한 회차의 각 재시도에서 슬롯당 최대 200회 시도하며, 최근 연속 10회에 최대 채움 수가 늘지 않으면 해당 슬롯 탐색을 멈춘다. 회차는 최대 50회 재시도하되 연속 3회에 최선 전체 수가 늘지 않으면 멈춘다. filterCandidates 호출은 회차당 20,000회, precheck의 시험 실행은 2,000회로 제한한다. 상수는 selector/index.ts로 공개한다. 운영 로직은 벽시계를 읽지 않는다.
5. 가장 많이 채운 결과를 원래 슬롯 순서로 반환한다. 부족한 모든 슬롯에 warn `SLOT_BLANK`로 회차·라벨·필요/채움/비는 수·관측한 원인 제약을 안내하고 `blanks`에 개수를 적는다. 탐색 상한으로 중단한 부분 결과는 warn `SELECTION_SEARCH_LIMIT`도 함께 낸다. 정적 충족 상한을 채워 끝낸 경우는 탐색 한도 경고 대상이 아니다.
6. 제약 verify를 실행하고 미확정 제약은 note를 포함한 warn `UNCONFIRMED_RULE_APPLIED`로 알린다.

`precheck`는 정적 후보 필요/가능 수를 먼저 계산한다. 회차 중복 금지면 필요 수에 회차 수를 곱한다. 부족은 warn `SLOT_SHORTAGE`이며 비는 수와 빈 번호 발생을 안내한다. 1.2배 미만 여유는 warn `SLOT_TIGHT`다. 이어 `createRng('precheck')`로 작은 탐색 상한의 선택을 실행해 동적 부족도 `SLOT_SHORTAGE`로 보고한다. 목표 누락 info를 유지하며 호출자의 난수 상태를 사용하지 않는다.

## 섞기와 정답 위치

시험을 깊이 복사하고 `blanks`를 그대로 보존한다. 같은 passageGroupId는 한 단위로 섞고 내부 상대 순서를 유지한다. free 문제는 고정 선지 위치를 제외한 자리만 섞는다. 정답 ID·본문·지문·해설·슬롯 대응은 유지한다.

단일 정답·free·정답이 이동 가능한 문항 수를 n, 이들의 최대 선지 수(없으면 5)를 P라 한다. `m = ceil(minAnswerPositionShare × n)`이며 기본 비율은 0.1이다. `P × m > n`이면 `floor(n / P)`로 낮춘다. 가능한 위치의 이분 매칭으로 각 위치의 m개부터 배정하고 나머지 문항은 일반 무작위 섞기를 적용한다. **최소만 보장하므로 편중이 남을 수 있고 최대−최소 ≤ 1은 요구하지 않는다.** 고정 선지 때문에 불가능한 위치의 할당은 가능한 범위만 충족한다. n < P이면 보장 수 대신 가능한 한 서로 다른 위치를 사용한다. 비율 0은 균형 옵션을 끈 결과와 같다.

`order`, `choices/{questionId}`, `balance` fork를 분리한다. 문제 순서 옵션 변경은 선지 결과에 영향을 주지 않는다. shuffleChoices=false이면 균형 옵션도 선지를 바꾸지 않는다.

`assertShufflerInvariants`는 입력 불변·내용/선지/정답 ID·고정 위치·지문 묶음·결정성·다른 시드 다양성·슬롯 대응·빈 번호 보존을 검사한다. 500개 시드의 동일 선지 수 2~6개 시험에서 문항 수 1/7/20/21/100의 최소 보장을 검사한다. 기존의 고의 내용 변조·정답 재지정·고정 선지 이동 메타 테스트를 유지한다.

## 프리셋

- 구강해부학: 4회차, 시작 21번, 기존 6개 슬롯·회차당 7문제. 회차 겹침 금지와 run 지문 중복 금지 모두 확정이며 needsConfirmation 제약이 없다.
- 법규: 4회차, 시작 1번, 대단원 1·2·3·4 각 5문제(합계 20). 회차 겹침 금지, run 지문 중복 금지, exam depth 3 strict는 확정이다. slot depth 2 prefer에만 needsConfirmation과 요청한 중단원 해석 안내를 둔다. 미완성 안내는 제거했다.

`describeRuleSet`에 후보가 모자라면 빈 번호로 남는다는 문장을 포함한다. 프리셋은 호출마다 독립된 객체다.

## 한계와 검증

탐색은 완전한 제약 충족 해법이 아니다. 정적 상한이 느슨하거나 상한 도달 전에 중단하면 존재하는 해도 빈 번호로 반환할 수 있다. 이미 확정한 앞 회차까지 되돌리지는 않는다. 원인 제약 수는 관측한 후보 감소의 최댓값이다. 지문 키는 이미지 asset id를 사용하며 픽셀 비교·OCR·유사문장 판정은 하지 않는다. Question ID·Choice ID의 유일성과 직렬화 가능한 데이터를 가정한다.

selector는 아키텍처 §3에 맞게 rng 공개 index를 사용한다. 사전 점검 난수 복제 구현은 제거했다. 테스트는 공개 index로 실제 플러그인을 조립할 수 있지만 운영 코드의 테스트 import와 다른 모듈 내부 참조는 계속 금지한다.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint:deps
```

800개 후보·4슬롯×5문제·4회차에서 슬롯당 중단원이 1개뿐인 strict 불가능 구성을 가짜 문제로 재현한다. select <1000ms, precheck <300ms를 CI에서도 동일하게 적용하며 같은 시드 두 번의 결과·슬롯당 1문제와 blank 4개를 검사한다. 벽시계는 성능 테스트에서만 사용한다. 정상 800개 후보 성능 검사와 이전 슬롯 되돌림 사례도 유지한다.
