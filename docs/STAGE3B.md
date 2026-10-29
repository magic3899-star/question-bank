# 3b단계: 확정 규칙 반영

## 구현 결과

- A 등급·학습목표 필수, 같은 지문은 통과한 문제 중 문서의 첫 문제만 가져온다. 제외마다 info 진단에 문단 위치·앞 20자·사유를 남기고 중복은 남긴 문제 위치도 안내한다. 등급/목표/중복 필터는 각각 해제할 수 있다. 사용하지 않는 이미지 자산을 정리한다.
- 출처 태그는 닫는 기호가 없어도 레코드 경계로만 사용한다. sourceTag를 설정하거나 진단 ref에 채우지 않는다. 태그 관련 진단도 내지 않는다.
- questionContentKey를 가져오기·중복 검수·선택 제약에서 공유한다. stem+passage의 공백·앞 번호·대소문자를 정규화하고 이미지 asset id를 포함한다. 선지가 달라도 같은 지문이면 run 전체에서 함께 뽑지 않는다. 중복 검수의 두 코드 모두 warn이다.
- 후보가 모자라면 부분 결과와 슬롯별 blanks를 반환한다. 모든 부족 슬롯에 warn SLOT_BLANK, precheck에는 warn SLOT_SHORTAGE를 낸다. shuffler가 blanks를 그대로 보존한다.
- distinct-by-segment의 prefer 모드는 새 구간을 우선하고 없으면 재사용한다. 재사용은 info SEGMENT_REUSED다. 사후 검사도 slotOfQuestion으로 정확한 슬롯 범위를 사용한다.
- 법규는 4회×20문제, 대단원 1~4에서 각각 5문제다. 회차 겹침·run 지문 중복·같은 학습목표는 금지한다. depth 2 slot prefer 해석에만 확인 필요를 남긴다. 해부 기존 슬롯은 유지하고 회차 겹침 금지를 확정했다.
- 정답 위치는 기본 10% 최소 개수만 먼저 매칭하고 나머지는 무작위다. 완전한 균등 분포는 요구하지 않는다. 고정 위치를 유지하고 비율 0은 균형 옵션을 끈 결과와 같다.

## 성능과 결정성

슬롯당 최대 200회·회차 최대 50회는 유지한다. 슬롯별 최근 연속 10회에 최대 채움 수가 늘지 않거나, 회차 재시도 연속 3회에 전체 최선 수가 늘지 않으면 중단한다. filterCandidates 호출 수를 회차당 select 20,000회, precheck 2,000회로 제한하며 상수는 selector 공개 index에서 제공한다. 한도 도달 시 SLOT_BLANK와 SELECTION_SEARCH_LIMIT를 함께 낸다.

정적 후보 ID 수와 strict 학습목표 구간 종류 수로 충족 가능한 수의 상한을 먼저 계산한다. 그 상한을 채우면 더 탐색하지 않으므로 중단원이 한 종류뿐인 큰 후보 풀도 반복 탐색하지 않는다. 이 경우는 한도 초과가 아닌 상한 충족이다. 빈 슬롯이 있어도 뒤 슬롯을 계속 채운다. selector에 복제한 precheckRng를 삭제하고 rng의 createRng를 사용한다.

800개 가짜 후보(`법규 {1+i%4}-1-{i}`), 4슬롯×5문제, 4회차, strict depth 2 slot + 회차 겹침 금지 + 지문 중복 금지의 불가능 구성을 테스트에 추가했다. 각 슬롯 1문제·빈 번호 4개, 총 16개 선택, 같은 시드 결과 일치를 확인한다. CI에서도 select <1000ms / precheck <300ms를 동일하게 강제한다. 전체 테스트 실행에서 각각 약 44ms / 47ms였다. 정상 800개 후보는 약 48ms였다. 시간은 환경 부하에 따라 달라지며 **운영 코드의 중단 판단은 작업량만 사용**한다.

## 테스트 변경 이유와 검증

기존 테스트는 사용자가 추가한 필수 blanks 계약을 적용했다. 기존의 등급 없음 포함·출처 태그 저장·선지가 다른 지문 허용·최대−최소 ≤ 1 기대값은 확정 결정과 충돌하므로 새 정책에 맞게 변경했다. OOXML 파서 구조 테스트는 필터를 명시적으로 해제해 경계·서식·번호·이미지 검증을 유지한다. 1000문제 파싱 테스트는 지문을 각각 다르게 만들어 기본 중복 제외가 적용되는 상황에서도 1000개 파싱을 검증한다. 상세 진단의 인덱스 재연결·자산 정리·이전 슬롯 되돌림 테스트를 유지했다.

추가 검증은 목표 누락/필터 해제, 중복 3개 그룹, 제외된 앞 문제, 이미지 차이, 중복 제외 선지 이미지 정리, 두 종류 중단원에서 strict/prefer 차이, 선지 변형 run 중복, 호출 상한 및 탐색 정체, 비율 0/사용자 비율/고정 위치를 포함한다. shuffler 불변 조건은 500개 시드로 문항 수 1/7/20/21/100·선지 수 2~6에서 최소 위치 개수를 확인하고 blanks 보존도 검사한다.

- npm.cmd test: 28개 파일, 236개 테스트 통과.
- npm.cmd run typecheck: 통과, 종료 코드 0.
- npm.cmd run lint:deps: 통과, 71개 모듈·186개 의존, 위반 0.
- 임시 selector → storage import로 lint:deps가 종료 코드 1(의도한 실패) 및 boundary-src-modules-selector 위반을 내는 것을 확인했다. 임시 파일은 finally에서 삭제했다. 정상 selector → rng는 통과한다.

## 변경 파일 목록

신규:

- src/modules/importers/docx/confirmed-rules.test.ts
- docs/STAGE3B.md

수정:

- .dependency-cruiser.cjs
- src/modules/content-model/index.ts
- src/modules/content-model/content-model.test.ts
- src/modules/importers/docx/index.ts
- src/modules/importers/docx/docx.test.ts
- src/modules/importers/docx/grade-filter.test.ts
- src/modules/validators/index.ts
- src/modules/validators/validators.test.ts
- src/modules/validators/objective-missing/index.ts
- src/modules/validators/objective-format/index.ts
- src/modules/validators/answer-valid/index.ts
- src/modules/validators/choice-count/index.ts
- src/modules/validators/empty-content/index.ts
- src/modules/validators/choice-reference/index.ts
- src/modules/validators/duplicate-choices/index.ts
- src/modules/validators/duplicate-stem/index.ts
- src/modules/validators/duplicate-stem/duplicate-stem.test.ts
- src/modules/constraints/no-duplicate-content/index.ts
- src/modules/constraints/no-duplicate-content/no-duplicate-content.test.ts
- src/modules/constraints/distinct-by-segment/index.ts
- src/modules/constraints/distinct-by-segment/distinct-by-segment.test.ts
- src/modules/constraints/no-overlap-across-exams/no-overlap-across-exams.test.ts
- src/modules/constraints/exclude-recent/exclude-recent.test.ts
- src/modules/selector/index.ts
- src/modules/selector/selector.test.ts
- src/modules/shuffler/standard/index.ts
- src/modules/shuffler/standard/standard.test.ts
- src/modules/rules/index.ts
- src/modules/rules/rules.test.ts
- tests/fixtures/builders.ts
- tests/invariants/assertShufflerInvariants.ts
- docs/STAGE2.md
- docs/STAGE3.md

## 한계·가정·계약 변경 요청

- 제한 탐색이므로 최적 해를 항상 찾는 것은 아니다. 앞 회차까지 되돌리지는 않는다. 상한 중단 시 빈 번호와 경고로 결과를 검수할 수 있다.
- 최소 정답 분포는 배치 가능한 위치 안에서 충족한다. 모든 문제의 특정 위치가 고정돼 있다면 그 위치의 최소 개수는 보장할 수 없다. 나머지 무작위 문항 때문에 편중이 남을 수 있다.
- 중복 키는 이미지 asset id 기준이며 픽셀·OCR·유사문장 판정은 하지 않는다. 저장 은행과의 가져오기 중복 비교는 이후 앱 단계에서 같은 키를 사용할 예정이다.
- SnapshotItem.blank 계약은 읽었으나 이 저장소에는 아직 exam-snapshot/출력기 구현이 없다. 이번 단계는 selector의 빈 자리 기록과 shuffler의 보존까지 구현한다.
- Question/Choice ID 유일성과 유효한 규칙을 입력받는 기존 가정을 유지한다. 실제 문제 파일·금지 폴더·네트워크를 사용하지 않았고 commit/push하지 않았다.
- 계약 변경 요청 없음. src/contracts/index.ts는 수정하지 않았다.
