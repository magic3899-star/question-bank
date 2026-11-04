# 작업: 홀수형·짝수형 동시 저장

먼저 `AGENTS.md` 를 읽고 따른다(형식: Prettier, 파일 단위 분리, 테스트 필수). git commit/push 는 하지 않는다. `src/contracts/index.ts` 는 수정하지 않는다(필요하면 보고서에 "계약 변경 요청").
PowerShell 에서 파일은 `Get-Content -Encoding UTF8`, npm 은 `npm.cmd`. 문제 데이터 파일은 읽지 않는다(테스트는 가짜 문제만).

## 목적
국시원 필기시험처럼 같은 문제를 번호 순서·선지 순서만 다르게 섞은 두 가지 시험지(홀수형·짝수형)를 한 번에 저장한다.
**가장 중요한 규칙: 어떤 문제의 지문·문제·선지 내용·해설·정답이 다른 문제의 것과 섞이거나 바뀌면 안 된다.** 짝수형은 홀수형과 문제 집합이 똑같고, 같은 문제의 내용·정답(선지 내용 기준)이 똑같아야 한다.

## 동작
- 시험 저장 요청에 `examTypes: 'single' | 'both'`(기본 `single`)를 추가한다. `single` 이면 지금과 완전히 같다(회귀 금지).
- `both` 이면 선택한 회차마다 파일을 두 벌 만든다: 제목 `"{제목} 홀수형"`(원본 확정본 그대로, 제목만 붙임), `"{제목} 짝수형"`(아래에서 파생). 문제지·정답지·해설지는 형별로 각자 만든다. 파일명은 제목에서 나오므로 서로 달라진다.
- 출제 이력에는 지금처럼 **원본 확정본만** 기록한다(이력 목록이 두 배가 되면 안 된다).

## 1. 순수 함수 (`src/modules/generation/`)
`mutations.ts` 가 이미 약 280줄이므로 **새 파일 `variant.ts`** 에 만들고 `index.ts` 로 export 한다.
`mutations.ts` 의 `toSelected`·`rebuild` 가 필요하면 **`variant.ts` 에 복사하지 말고** 둘을 별도 파일(`selected.ts`)로 옮겨 두 파일이 같이 쓰게 한다(동작 변경 없이 이동만; 기존 테스트가 그대로 통과해야 한다).

```ts
export function deriveVariant(
  input: {
    rules: RuleSet;
    sources: readonly Question[];            // 이 확정본의 원본 문제들
    assets: Readonly<Record<string, AssetData>>;
    snapshot: ExamSnapshot;                  // 홀수형
    seed: string;
    shuffle: ShuffleOptions;
  },
  deps: { shufflers: readonly Shuffler[] },
): MutationResult                            // snapshot?: 짝수형, diagnostics
```
- `toSelected(snapshot, sources, rules)` 로 홀수형 상태를 선택 결과로 만든 뒤, `standard` 셔플러로 **문제 순서와 선지를 다시 섞는다**: `{ shuffleQuestionOrder: true, shuffleChoices: true, balanceAnswerPositions: input.shuffle.balanceAnswerPositions, minAnswerPositionShare: input.shuffle.minAnswerPositionShare, sortByObjective: false }`. 두 형을 확실히 다르게 하려는 것이므로 학습목표 정렬은 적용하지 않는다. rng 는 `createRng(input.seed).fork('variant/even')` 를 쓴다(같은 입력이면 같은 결과).
- 선지 고정(`shufflePolicy: 'lock-all'`, `fixedPosition`)·같은 지문 묶음의 연속 배치는 셔플러가 이미 처리한다. 그대로 쓴다.
- `rebuild` 와 같은 방식으로 새 확정본을 만든다(번호·ID·제목·createdAt 은 원본 확정본 것을 유지, `examId` 는 호출자가 바꾼다).
- **섞임 방지 검증(필수)**: 만든 뒤 홀수형과 대조해서 하나라도 어긋나면 `snapshot` 없이 한국어 오류 진단을 돌려준다.
  1. 두 확정본의 `sourceQuestionId` 집합이 같고 개수도 같다(빈 번호 개수도 같다).
  2. 같은 `sourceQuestionId` 끼리 `passage`·`stem`·`explanation`·`objectiveCode`·`grade` 가 깊은 비교로 같다.
  3. 같은 문제의 선지 `{sourceChoiceId → content}` 대응이 같다.
  4. 같은 문제의 정답이 같은 `sourceChoiceId` 를 가리킨다(`answerLabels` 의 라벨 위치로 `sourceChoiceId` 를 찾아 비교).
  불일치 시 메시지 예: `원본 문제가 시험을 만든 뒤 수정되어 짝수형을 만들 수 없습니다. 시험을 다시 만들어 주세요.` (이 경우는 `sources` 가 홀수형 확정본과 다른 내용일 때 생긴다 — 테스트로 만들어 확인.)
- 테스트(`variant.test.ts`, 가짜 문제만): 같은 입력이면 같은 결과, 문제 집합·내용·정답 보존, 번호 순서가 실제로 달라짐(충분히 많은 문제로), 선지가 안 섞여야 하는 문제(lock-all, fixedPosition)는 순서 유지, 빈 번호 보존, 원본 문제가 바뀐 경우(`sources` 의 문제 stem 을 바꿈) 오류, 학습목표 정렬 옵션이 켜져 있어도 짝수형은 정렬하지 않음, 확정본 내용 해시 검증(`verifySnapshot`)이 통과함.
  성질 테스트: 무작위 시드 20개로 반복해서 위 1~4 불변조건이 항상 성립.

## 2. 앱 연결
- `src/app/shared/exam.ts`: `ExportRequest` 에 `examTypes?: 'single' | 'both'`.
- `src/app/main/services/generate.ts`(300줄 넘지 않게, 넘으면 파일 분리): 세션 서비스에 `deriveEvenType(snapshot)` 같은 함수 — 세션의 `candidates`(생성 당시 후보)에서 해당 확정본의 `sourceQuestionId` 들을 찾아 `deriveVariant` 를 호출한다. seed 는 `` `${snapshot.seed}/${snapshot.examId}` ``. 세션 후보에 없으면 한국어 오류.
- `src/app/main/services/export.ts`:
  - `parseRequest` 에서 `examTypes` 검증(`single`/`both` 외 오류).
  - 짝수형 확정본은 이렇게 얻는다: ① 저장소에 `` `${examId}-even` `` 확정본이 있으면 그것을 쓴다(이전에 저장한 짝수형을 그대로 다시 저장하려고) ② 없으면 파생한다: 세션 출처면 세션의 `deriveEvenType`, 이력 출처(`historyExamIds`)면 은행의 문제(`storage.questions.get`)를 불러서 `deriveVariant` 를 호출(출제 규칙은 `deps.getRules`; 규칙이 삭제되어 못 찾으면 한국어 오류로 알린다). 파생한 짝수형은 `examId` 를 `` `${examId}-even` `` 로, 제목은 그대로 두고 **`storage.snapshots.save` 로만 저장**한다(출제 이력 `history.record` 는 하지 않는다).
  - 저장 실패·파생 실패 시 이미 만든 파일이 있어도 오류를 그대로 알린다(조용히 건너뛰지 않는다). 진행률 표시는 두 형을 각각 한 작업으로 센다.
  - 출력 파일의 `snapshot` 제목만 `홀수형`/`짝수형` 을 붙인 얕은 복사본으로 출력기에 넘긴다(`{ ...snapshot, title: `${snapshot.title} 홀수형` }`). 저장소에 쓰는 확정본의 제목은 바꾸지 않는다.
  - `historyDelete` 는 지울 ID 마다 `` `${id}-even` `` 확정본도 함께 지운다(없어도 오류 없이).
  - 이력 기록은 지금처럼 원본 확정본만.
  - `export.ts` 가 300줄을 넘으면 의미 단위로 나눈다(예: `export-variants.ts`).
- 화면: `src/app/renderer/components/ExportOptions.tsx` 에 `시험지 종류` 영역 추가: 체크박스 `홀수형·짝수형 두 가지로 저장`(기본 꺼짐) + 보조 설명 `같은 문제를 번호 순서와 선지 순서만 다르게 섞은 짝수형을 함께 저장합니다. 정답지·해설지도 형별로 따로 만들어집니다.` 상태는 기존 `useExamHeader` 와 같은 방식(별도 작은 훅 또는 기존 훅 확장 — 파일이 커지지 않게)으로 `StepSave.tsx`·`SaveDialog.tsx` 에서 함께 쓰고, 저장 요청에 `examTypes` 를 싣는다. 저장 결과 목록에서 파일 이름으로 구분되므로 별도 표시는 필요 없다. `docs/DESIGN.md` 토큰만, 다크 모드·`label` 연결·키보드 접근 지킴.
- 테스트:
  - export 서비스: `single` 은 지금과 동일한 파일 수, `both` 는 회차 수 × 2 × 형식 수 × 문서 수(합치기 여부에 맞게), 파일명에 `홀수형`/`짝수형`, 저장소에 `-even` 확정본이 저장되고 `history.record` 는 원본만 호출됨, 두 번째 저장 때는 저장된 `-even` 을 재사용(파생 함수가 다시 호출되지 않음), 잘못된 `examTypes` 오류, 이력 삭제 때 `-even` 도 삭제.
  - **두 형의 문제지에서 같은 문제의 지문·문제·선지 내용이 서로 같은지 확인하는 종단 테스트 한 개**(생성 → 두 형 모두 파생 → 문제별 대조).
  - 화면 훅의 순수 함수 테스트.
- 마무리: `npm.cmd run format`, `format:check`, `typecheck`, `lint:deps`, 관련 테스트, 전체 `npm.cmd test` 와 `npm.cmd run build` 통과.

## 최종 보고 형식
1. 만든/수정한 파일 목록
2. 실행한 명령과 결과(통과/실패 그대로)
3. 하지 못한 것, 막힌 것, 가정한 것
4. 계약 변경 요청(있으면)
