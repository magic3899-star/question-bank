# 3c단계: 중단원 엄격 구분과 단일 중단원 면제

## 변경점

- `distinct-by-segment`의 `mode`는 `strict`, `prefer`, `strict-unless-single`을 지원하며 기본값은 `strict-unless-single`이다. 명시한 `strict`와 `prefer`의 기존 동작은 유지한다.
- `strict-unless-single`의 `scope: 'slot'`은 `state.slot.pool`의 파싱 가능한 `segmentKey(code, depth)` 종류가 1종 이하이면 입력 후보를 그대로 반환한다. 2종 이상이면 그 슬롯에서 이미 선택한 구간의 후보를 엄격히 제외한다. 4종으로 5문제가 필요하면 4문제와 빈 번호 1개를 반환하며, 중복 구간으로 보충하지 않는다.
- 슬롯 풀은 슬롯 필터와 학습목표 파싱을 통과한 정적 후보 전부다. 선택기는 기존 `entry.pool`을 모든 `filterCandidates` 호출의 `state.slot.pool`로 전달한다. 회차 겹침·지문 중복 등의 동적 제약을 적용하거나 앞 회차에서 구간 하나가 소진되어도 이 풀과 면제 판정은 바뀌지 않는다.
- `scope: 'exam'`(범위 생략 시 기본값 포함)은 `currentChosen`을 기준으로 엄격히 제외하며 단일 구간 면제를 적용하지 않는다.
- 선택기의 정적 충족 상한도 같은 기본 모드와 단일 구간 면제를 반영한다. 면제된 슬롯이 1문제만 선택된 채 조기 종료되는 것을 막고, 여러 구간이 부족한 슬롯은 기존처럼 상한을 채운 뒤 탐색을 끝낸다. 기존 작업량 상한은 유지한다.
- `SLOT_BLANK`의 원인 추정에서 depth 2·slot 제약은 ‘중단원이 서로 달라야 하는 규칙’으로 표시한다. 회차·슬롯·필요/채움/비는 수, 다른 관측 제약과 후보 감소 수, 해결 방법도 유지한다. 원인별 후보 감소 수와 실제 빈 번호 수는 서로 다른 값이다.
- 법규 프리셋의 depth 2·slot 제약을 `mode: 'strict-unless-single'`, `needsConfirmation: false`로 확정하고 단일 중단원 면제·부족 시 빈 번호 안내를 갱신했다. depth 3·exam strict와 회차 겹침·run 지문 중복 금지는 유지한다. 해부 프리셋은 변경하지 않았다.
- `describeRuleSet`은 기본 모드와 명시 모드 모두 엄격 구분·슬롯의 단일 구간 면제·부족 시 빈 번호를 설명한다. exam 범위에는 면제를 안내하지 않는다.

STAGE3.md와 STAGE3B.md에 기록된 기존 기본 strict 및 법규 slot prefer·확인 필요 정책은 이번 단계에서 위 정책으로 대체한다. 사용자가 추가한 `state.slot.pool` 계약만 사용했으며 `src/contracts/index.ts`는 수정하지 않았다.

## 사후 검증의 한계

`verify`는 선택 결과와 슬롯 대응만 받고 정적 슬롯 풀은 받지 않는다. 선택된 결과가 한 구간뿐이라는 이유만으로 원래 풀이 한 구간이었는지, 여러 구간 중 다른 구간이 소진되었는지 구분할 수 없다.

따라서 `strict-unless-single`(생략한 기본값 포함)의 반복 구간은 해당 slot/exam 범위에 맞춰 **info `SEGMENT_REUSED`만** 보고하며 ‘면제 가능 여부는 선택 단계에서 판단했습니다’라고 안내한다. 이 모드의 사후 검사에서는 error `SEGMENT_NOT_DISTINCT`를 내지 않는다. exam 범위도 선택 시에는 면제 없이 엄격히 필터링하지만, 요청한 사후 진단 정책에 따라 반복은 정보로만 기록한다. 임의로 만들어진 선택 결과만으로 이 모드의 위반을 확정할 수 없으므로 선택 단계의 정적 풀 판정이 기준이다.

명시적인 `strict`는 기존처럼 error `SEGMENT_NOT_DISTINCT`, `prefer`는 기존처럼 info `SEGMENT_REUSED`를 보고한다. 잘못된 매개변수는 기존처럼 후보를 유지하고 `CONSTRAINT_PARAMS_INVALID`로 수정 방법을 안내한다.

탐색은 기존의 제한 탐색이며 앞 회차까지 되돌리지는 않는다. 동적 제약이 복잡하면 존재하는 최적 조합을 보장하지 않는다. 단일 중단원 면제는 이 제약만 면제하며 회차 겹침·지문 중복 등 다른 제약은 계속 적용한다.

## 검증

모든 데이터는 `tests/fixtures/builders.ts`에서 코드로 만든 가짜 문제다. 실제 문제 파일·금지 폴더·네트워크를 사용하지 않고 commit/push하지 않았다.

- 기본값과 명시 모드 각각 200개 시드에서 중단원 6종 중 5문제를 모두 다르게 선택한다.
- 단일 중단원으로 5문제를 채우고 정보 진단만 남기는지, 빈 풀·파싱 불가 코드·얼린 입력·잘못된 매개변수와 기존 strict/prefer 동작을 검사한다.
- 법규 프리셋과 800개 후보, 4슬롯×5문제×4회차, no-overlap + no-duplicate-content + distinct-by-segment를 함께 실행한다. 중단원 4종은 매 회차 슬롯별 4문제·빈 번호 1개, 중단원 1종은 매 회차 슬롯별 5문제로 검사한다. ID·지문 중복 없음, 입력 불변, 같은 시드의 전체 결과 결정성, 빈 번호 원인 진단과 precheck 결과도 확인한다.
- 위 800개 후보 시나리오는 CI에서도 select <1000ms, precheck <300ms를 적용한다. 기존 3b의 strict 불가능 구성 성능 검사도 유지한다. 벽시계는 성능 테스트에서만 사용한다.
- 두 중단원 중 한 종이 첫 회차에서 소진되면 뒤 회차에서도 면제로 바꾸지 않고 한 문제만 선택하는지 확인한다. 모든 제약 호출에 슬롯 필터·학습목표 파싱을 통과한 동일한 정적 풀을 전달하는지도 검사한다.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint:deps
```

- `npm.cmd test`: 통과, 29개 파일·251개 테스트, 종료 코드 0.
- `npm.cmd run typecheck`: 통과, 종료 코드 0.
- `npm.cmd run lint:deps`: 통과, 72개 모듈·196개 의존, 위반 0, 종료 코드 0.
- 전체 테스트 실행의 800개 후보 성능: 단일 중단원 select 168ms / precheck 154ms, 4종 중단원 select 87ms / precheck 82ms. 실행 환경 부하에 따라 측정값은 달라진다.

계약 변경 요청 없음.
