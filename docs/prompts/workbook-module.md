# 작업: 문제집 PDF + 정답집 PDF 합쳐 읽기 (순수 모듈)

먼저 `AGENTS.md` 를 읽고 따른다(형식: Prettier, 파일 단위 분리 ≤ 약 300줄, 테스트 필수). git commit/push 는 하지 않는다.
**`src/contracts/index.ts` 는 수정하지 않는다**(필요하면 보고서에 "계약 변경 요청").
PowerShell 에서 파일은 `Get-Content -Encoding UTF8`, npm 은 `npm.cmd`. **실제 문제 파일(`문제 디비/` 등 *.pdf *.docx)은 읽지 않는다.** 테스트는 코드로 만든 가짜 문서만 쓴다(아래 형식 설명 참고).

## 배경
출판사의 시판 문제집(문제집 PDF)과 정답·해설집(정답집 PDF)을 합쳐서 문제은행에 넣으려 한다.
- 문제집 PDF: 문제(번호·문제·선지 ①~⑤)만 있고 정답·해설·학습목표가 없다.
- 정답집 PDF: 번호별 정답·해설·학습목표 코드가 있다.
- 둘은 **(과목, 번호)** 로 짝이 맞는다. 이 모듈은 PDF 를 읽지 않는다. **PDF 에서 이미 뽑아낸 줄 배열(`string[]`)을 받아** 해석·병합해서 `ImportDraft` 를 만든다(PDF 읽기는 다음 단계에서 앱이 한다).
- **가장 중요한 규칙: 한 문제의 문제·선지·정답·해설·학습목표가 다른 문제의 것과 섞이면 안 된다.** 짝이 확실하지 않으면 합치지 말고(정답 없음 오류로) 보고한다.

## 새로 만들 것
### 1) `src/modules/subject-catalog/index.ts` (순수 데이터 모듈)
치과위생사 국가시험 21과목 목록(아래 순서 고정). `id` 는 기존 데이터와 호환되도록 `law`, `anatomy` 는 그대로 쓴다.

| 순서 | id | 이름(PART 제목) | 학습목표 접두 | 문항수 | 시작 번호 | 교시 |
|---|---|---|---|---|---|---|
| 1 | law | 의료관계법규 | 법규 | 20 | 1 | 1 |
| 2 | anatomy | 구강해부학 | 해부 | 7 | 21 | 1 |
| 3 | morphology | 치아형태학 | 형태 | 7 | 28 | 1 |
| 4 | histology | 구강조직학 | 조직 | 7 | 35 | 1 |
| 5 | pathology | 구강병리학 | 병리 | 7 | 42 | 1 |
| 6 | physiology | 구강생리학 | 생리 | 7 | 49 | 1 |
| 7 | microbiology | 구강미생물학 | 미생물 | 5 | 56 | 1 |
| 8 | community | 지역사회구강보건학 | 지역 | 12 | 61 | 1 |
| 9 | administration | 구강보건행정학 | 행정 | 10 | 73 | 1 |
| 10 | statistics | 구강보건통계학 | 통계 | 8 | 83 | 1 |
| 11 | education | 구강보건교육학 | 교육 | 10 | 91 | 1 |
| 12 | preventive | 예방치과학 | 예치 | 18 | 101 | 2 |
| 13 | scaling | 치면세마론 | 치세 | 20 | 119 | 2 |
| 14 | radiology | 치과방사선학 | 방사선 | 20 | 139 | 2 |
| 15 | surgery | 구강악안면외과학 | 외과 | 6 | 159 | 2 |
| 16 | prosthodontics | 치과보철학 | 보철 | 6 | 165 | 2 |
| 17 | conservative | 치과보존학 | 보존 | 6 | 171 | 2 |
| 18 | pediatric | 소아치과학 | 소치 | 6 | 177 | 2 |
| 19 | periodontics | 치주학 | 치주 | 6 | 183 | 2 |
| 20 | orthodontics | 치과교정학 | 교정 | 6 | 189 | 2 |
| 21 | materials | 치과재료학 | 재료 | 6 | 195 | 2 |

export: `subjectCatalog: readonly CatalogSubject[]`, `findSubjectByName(name)`, `findSubjectByPrefix(prefix)`, `findSubjectById(id)`. 테스트 포함(21개, 순서, 중복 id/접두 없음, 문항수 합 = 1교시 100 / 2교시 100).
의존 규칙: 이 모듈은 아무것도 import 하지 않는다. `.dependency-cruiser.cjs` 와 `docs/ARCHITECTURE.md §3` 에 새 모듈(`subject-catalog`, `workbook`)의 허용 의존을 추가한다(`workbook` 은 `contracts`, `content-model`, `subject-catalog`, `objective-code` 만 import 가능, 다른 모듈의 내부 파일 import 금지).

### 2) `src/modules/workbook/` — 파일을 나누어 만든다
공개 API(`index.ts`로만 export):

```ts
export type BookKind = 'questions' | 'answers' | 'unknown';
export function detectBook(lines: readonly string[]): BookKind;

export interface WorkbookBook { name: string; lines: readonly string[] }
export interface WorkbookOptions {
  requireObjective?: boolean;   // 기본 true: 학습목표 없는 문제는 SKIPPED_NO_OBJECTIVE 로 제외(다른 importer 와 같은 방식. docx importer 가 쓰는 SKIPPED_* 진단 형식을 먼저 읽고 그대로 따른다)
  lockChoicesOnReference?: boolean; // 기본 true: 해설·문제에 선지 번호(①~⑤)가 있으면 shufflePolicy 'lock-all' (docx importer 와 같은 판정 함수를 재사용, 없으면 content-model 에 이미 있는 함수 확인)
}
export function buildWorkbookDraft(
  input: { questionBooks: WorkbookBook[]; answerBooks: WorkbookBook[] },
  options?: WorkbookOptions,
): ImportDraft;   // question.subject 는 문제마다 카탈로그의 id
```

#### 2-1) 줄 잡음 제거 (`noise.ts`)
PDF 에서 쪽마다 반복되는 머리글·꼬리말·표지 줄은 본문이 아니다. 두 책 공통으로 아래 줄을 버린다(정규식은 보수적으로, 본문 줄을 잘못 버리지 않게):
- `2027 가짜 시리즈 치과위생사 국가시험 - 1교시54` (연도 4자리 + 짧은 시리즈 이름 + `치과위생사 국가시험 - N교시` + 쪽번호가 붙은 줄), `치과위생사 국가시험 - 1교시2`, `치과위생사 국가시험 1교시`, `2027 가짜 SERIES`
- `PART 02 구강해부학 55` (PART + 2자리 + 과목명 + 쪽번호), 정답집 쪽 머리글 `H · Y · G · I · E · N · I · S · TPART01 의료관계법규`
- `D · E · N · T · A · L H · Y · G · I · E · N · I · S · T`, `DENTAL HYGIENIST`, `D E N TA L H Y G I E N I S T …` 류의 글자 사이에 공백/가운뎃점이 낀 영문 대문자 장식 줄
- 2자리 숫자만 있는 줄(`02`, `11` — 장 탭 번호), 1~3자리 쪽번호만 있는 줄이 문제 번호가 아닌 위치에 있는 경우는 아래 파서가 문맥으로 판단
- `Memo`
이 목록은 `noise.ts` 한 곳에 상수로 두고, 버린 줄 수를 진단(info)으로 합산해 보고한다.

#### 2-2) 줄 이음 (`join.ts`, `vocabulary.ts`) — 매우 중요
이 PDF 는 **글자 단위로 줄바꿈**된다. 한 낱말이 줄 끝/다음 줄 첫머리로 쪼개지는 경우가 많다.
예) `...가나다에 대한 설명으로 옳` / `은 것은?` → 올바른 결과 `설명으로 옳은 것은?` (붙여야 함)
예) `...사과나무를 심은 곳으로` / `나누는 방법은?` → `심은 곳으로 나누는 방법은?` (띄워야 함)
줄 폭으로는 둘을 구분할 수 없다. 그래서 **책 전체(문제집+정답집)에서 줄 안쪽에 온전히 있는 낱말·인접 낱말 쌍의 빈도**로 판단한다.

- `buildVocabulary(allLines)`: 모든 줄을 공백으로 나눈 토큰을 정규화(앞뒤 문장부호 `, . : ; ? ! ( ) [ ] 「 」 ' " • · ・ ‘ ’ “ ” …` 제거; 정규화 후 비면 버림)해서 **각 줄의 첫 토큰과 마지막 토큰은 제외**(줄바꿈으로 쪼개진 조각일 수 있음)한 나머지로 `token → 횟수` 와 `인접 토큰 쌍 "A B" → 횟수`(같은 줄 안에서 붙어 있는 쌍) 를 센다.
- `joinWrapped(prev: string, next: string, vocab): { text: string; joined: boolean; estimated: boolean }`: `prev` 줄과 `next` 줄을 이을 때 사이에 공백을 넣을지 판단한다.
  1. `A` = prev 의 마지막 토큰, `B` = next 의 첫 토큰(정규화: 앞뒤 문장부호 제거 후 비교용 core. 원문 문자열은 그대로 보존).
  2. A 의 마지막 글자와 B 의 첫 글자가 **둘 다 한글 음절이 아니면 공백으로 잇는다**(영문·숫자·기호 경계). 예외: 둘 다 영문 소문자/숫자로 이어지는 경우도 공백(불확실하므로 띄움).
  3. 둘 다 한글이면: `joinCount = vocab.token[A+Bcore]`, `sepCount = vocab.pair["A Bcore"]`. `joinCount > sepCount` → 붙인다. `sepCount > joinCount` → 띄운다.
  4. 둘 다 0(처음 보는 조합)이면 휴리스틱: `Bcore` 가 흔한 조사·어미 목록(`은 는 이 가 을 를 의 에 로 와 과 도 만 며 고 서 면 나 다 요 한 인 된 하 되 해 할 함 임 음 에서 으로 에게 까지 부터 보다 라고 이며 이다 한다 하는 하고 하며 되는 있는 없는 하여 하기 되어` 등)이고 prev 가 문장부호로 끝나지 않으면 붙인다. 아니면 띄운다. 이 경우 `estimated: true`.
  5. prev 가 `. ? ! :` 같은 문장 끝 부호로 끝나면 항상 띄운다.
- 정답집 해설·문제집 문제·선지에서 줄을 이을 때 모두 이 함수를 쓴다. 추정(estimated)으로 이은 횟수는 문제 단위 진단에 쌓지 말고 **전체 진단 1개**로 합산: `WORKBOOK_JOIN_ESTIMATED` (info) `줄 끝 낱말이 쪼개졌는지 처음 보는 조합 N곳은 짐작으로 이었습니다. 문제 미리보기에서 띄어쓰기를 확인하세요.`
- 테스트(`join.test.ts`): 가짜 문장 말뭉치를 만들어(예: `가나다 마바사` 같은 가짜 낱말을 줄 안쪽에 여러 번 넣어 빈도를 만든다) 붙임/띄움/동수/미등록 조사 휴리스틱/문장 끝 부호/영문·숫자 경계를 각각 확인. 실제 한국어 문제 내용 대신 가짜 낱말(예: `사과나무`, `바나나`)을 쓴다.

#### 2-3) 문제집 해석 (`question-book.ts`)
문제집 줄 배열(잡음 제거 후)에서 과목별 문제를 뽑는다.
형식(가짜 예시):
```
PART
03
D · E · N · T · A · L H · Y · G · I · E · N · I · S · T
치아형태학
Dental Morphology
제 1 장 총론
Memo
KILLER POINT 2019년~2025년도 국시 기출 정리      ← 이 줄부터 다음 문제 시작까지는 요약쪽(문제 아님)
출제 연도 기출 내용
2025
형태 1-1-3. 치아의 종류를 열거할 수 있다. (A)
...
001
사과나무에 대한 설명으로 옳은 것은?
① 첫째 ② 둘째
③ 셋째 ④ 넷째
⑤ 다섯째
002
다음 설명에 해당하는 구조물은?
•가나다라 마바사 아자차카
타파하
① 하나 ② 둘
③ 셋 ④ 넷
⑤ 다섯
003
긴 선지가 있는 문제의 줄 이음 확인 문제입니다.
① 선지의 첫 줄이 길어서 줄바꿈이
되어 있는 경우
② 짧은 선지
...
```
- **과목 구분**: 줄이 정확히 `PART` 이고 뒤 6줄 안에 카탈로그의 과목 이름과 정확히 같은 줄이 있으면 그 과목의 시작이다. 그 이후 문제는 해당 과목. (과목 이름을 찾지 못하면 오류 진단 `WORKBOOK_PART_UNKNOWN` 을 내고 그 구간의 문제는 버린다.)
- **문제 번호**: 한 과목 안에서 `001`, `002`, … 1씩 증가한다. **정확히 `^\d{3}$` 인 줄이 "기대하는 다음 번호"와 같고, 그 뒤 12줄 안에 `①` 로 시작하는 줄이 있을 때만** 문제 시작이다(요약쪽의 숫자·쪽번호를 문제 번호로 오인하지 않기 위해).
- **본문**: 번호 줄 다음부터 첫 `①` 줄 전까지가 문제 본문(stem). 줄을 문단으로 나누는 규칙: 줄이 `•`, `ㆍ`, `-`, `※`, `㉠㉡㉢㉣㉤`, `(가)`·`(나)`·`(다)`, `<` 로 시작하면 새 문단, 아니면 앞 문단에 이어 붙인다(2-2 의 `joinWrapped`).
- **선지**: `①`~`⑤` 마커로 시작/중간에 나온다. **한 줄에 선지가 둘 이상**(`① 사과 ② 배`)이면 마커로 나눈다. 마커로 시작하지 않는 줄은 직전 선지에 이어 붙인다(joinWrapped). 선지는 2개 이상 5개 이하. 마커 번호는 `①②③④⑤` 순서를 지켜야 한다(순서가 어긋나면 그 문제는 `WORKBOOK_CHOICES_BROKEN` 오류로 보고하고 버린다).
- **문제 끝**: 다음 문제 시작, 또는 다음 줄 중 하나가 나오면 문제를 끝낸다(마지막 선지에 요약쪽 글이 붙지 않게): `KILLER POINT` 로 시작하는 줄, `출제 연도 기출 내용`, `제 N 장 …`(`^제 \d+ 장`), `PART`, 노이즈 줄. 마지막 선지에 이어 붙는 줄은 **최대 4줄**.
- 결과: `{ subjectId, number, stem: string[](문단 문자열들), choices: string[] (마커 제외 내용), sourceLine }[]` 와 진단. 과목별 문제 개수와 번호 연속성(빠진 번호)을 진단(warn)으로 알린다.
- **그림·표 경고**: 본문에 `그림` 또는 `표를`·`아래 표`·`다음 표`·`도표` 가 있으면 그 문제에 `WORKBOOK_FIGURE_MISSING` (warn) `그림·표가 있는 문제로 보입니다. 이 가져오기는 그림을 읽지 못하므로, 저장한 뒤 문제 편집에서 그림을 넣어 주세요.`

#### 2-4) 정답집 해석 (`answer-book.ts`)
형식(가짜 예시):
```
001 〉〉〉 정답 ③
사과나무의 종류                      ← 제목(첫 줄들)
• 가나다라: 마바사 아자차카타파하        ← 불릿 줄(길면 다음 줄로 이어짐)
하거나 말거나
• 둘째 항목
① → 첫째 선지에 대한 설명               ← 선지 해설 줄
◆ 형태 1-1-3                           ← 학습목표 코드(없는 해설도 있다)
002 〉〉> 정답 ⑤                         ← 구분 글자가 〉〉〉 또는 〉〉> 로 섞여 있다
...
```
- **항목 시작**: `^(\d{3})\s*[〉>]{2,3}\s*정답\s*([①②③④⑤])` (구분 글자가 `〉〉〉` 또는 `〉〉>`; 공백이 없을 수도 있음). 정답은 원문자 1개. **정답이 여럿이거나 형식이 다르면(`정답` 뒤 원문자가 없음) `WORKBOOK_ANSWER_FORMAT` 오류 진단**을 내고 그 항목은 정답 없음으로 둔다.
- **과목 구분**: 번호가 앞 항목보다 작거나 같아지면(`001` 로 돌아가면) 다음 과목으로 넘어간다. 첫 과목은 카탈로그 1번(의료관계법규)이고 이후 카탈로그 순서대로 21개. 각 구간의 `◆ 접두` 가 가장 많은 값이 카탈로그의 접두와 다르면 `WORKBOOK_PART_MISMATCH` (warn) 으로 알리고 **접두가 가리키는 과목을 우선**한다(접두 코드가 하나도 없는 구간만 순서를 따른다).
- **해설**: 항목 줄 다음부터 다음 항목 전까지(잡음 제거 후). 마지막의 `◆ <접두> <숫자>-<숫자>-<숫자>`(예 `◆ 형태 1-1-3`) 줄은 학습목표 코드로 따로 뽑고 해설 본문에서는 뺀다(코드 문자열 정규화: 접두와 숫자 사이 공백 1개). `◆` 줄이 항목 중간에 있거나 둘 이상이면 마지막 것을 쓴다. 코드가 없으면 `objectiveCode` 없음.
- **해설 문단 나누기**: 본문 첫 줄(들)은 **제목**(첫 불릿/마커 전까지, 줄 이음 적용) → 굵게. 그 뒤 줄이 `•`, `ㆍ`, `-`, `※`, `cf)`, `①~⑤`, `숫자)` 로 시작하면 새 문단, 아니면 앞 문단에 이어 붙인다(joinWrapped). 불릿 문자는 글자 그대로 보존(`• ...`).
- 결과: `{ subjectId, number, answerLabel, titleParagraph, paragraphs: string[], objectiveCode?, sourceLine }[]`.
- 같은 (과목, 번호)가 두 번 나오면 뒤의 것은 `WORKBOOK_DUPLICATE_ANSWER` (warn) 으로 알리고 **앞의 것을 쓴다**.

#### 2-5) 합치기 (`build.ts`)
- 문제집 여러 권·정답집 여러 권을 받아 `(subjectId, number)` 로 짝짓는다(문제집 1·2권이 서로 다른 과목이므로 충돌하지 않는다. 같은 과목이 두 권에 있으면 `WORKBOOK_DUPLICATE_QUESTION` warn 후 앞 것).
- 짝이 맞으면 `DraftQuestion` 을 만든다: `type: 'mcq'`, `schemaVersion` 은 다른 importer 가 쓰는 값과 같게(docx/layout-parser 에서 확인), `subject: 카탈로그 id`, `stem`: 문단들 → `ParagraphBlock`(runs 의 text), 선지 → `Choice { id: 'c1'…'c5'(문제 안에서 유일), content: [paragraph] }`, `answerChoiceIds: [정답 위치의 id]`, `explanation`: 제목 문단(`bold: true`) + 나머지 문단, `objectiveCode`, `grade: 'A'`(문제집이 A항 기준이므로. `options.includeGrades` 처리는 docx importer 와 같게), `tags: []`, `extra: { workbook: { questionBook, answerBook, number } }`, `sourceLocation: "<문제집 파일명> <과목명> <번호>번"`, `shufflePolicy`(위 옵션).
- 정답집에 있는데 문제집에 없는 항목: 전체 진단 `WORKBOOK_ANSWER_ONLY` (info, 과목별 개수 요약). 문제집에 있는데 정답집에 없는 문제: **그 문제를 초안에 넣되 정답 없이 둘 수 없으므로** `SKIPPED_NO_ANSWER`(warn, 문제 번호 포함) 로 제외하고 `draft.diagnostics` 에 `ref` 없이 남긴다. (다른 importer 의 `SKIPPED_*` 형식과 같은 모양)
- 정답 라벨이 그 문제의 선지 개수를 넘으면(`⑤` 인데 선지가 4개) `SKIPPED_ANSWER_OUT_OF_RANGE` 로 제외.
- `requireObjective` 기본 true: 학습목표 없는 문제는 `SKIPPED_NO_OBJECTIVE`. 이때 문제 번호를 메시지에 포함하고, 개수 요약 info 도 하나 낸다.
- 과목별 요약 진단 1개씩(info): `의료관계법규: 문제집 228문제 · 정답집 228건 → 가져올 수 있음 210문제 (학습목표 없음 18)` 형식.
- 순서: 카탈로그 순서 → 번호 순.
- `draft.assets = []`, `draft.passageGroups = []`.
- **합친 뒤 자체 검증**: 모든 초안에서 `choices.length ≥ 2`, `answerChoiceIds` 가 `choices` 안의 id, id 중복 없음, `stem` 비어 있지 않음. 위반이면 그 문제를 `SKIPPED_INVALID`(warn) 로 제외.

#### 2-6) 판별 (`detect.ts`)
`detectBook(lines)`:
- 정답집: 항목 시작 정규식에 맞는 줄이 20개 이상이면 `'answers'`.
- 문제집: 위 조건이 아니고, `^\d{3}$` 줄 바로 뒤 12줄 안에 `①` 줄이 있는 곳이 20곳 이상이면 `'questions'`.
- 그 외 `'unknown'`.

## 테스트 (가짜 문서만)
`tests/fixtures/workbook.ts` 에 **가짜 책 줄 배열을 만드는 도우미**를 둔다(과목 2~3개, 과목당 5~30문제, 일부 선지가 한 줄에 둘, 일부 줄 쪼개짐, 요약쪽(KILLER POINT) 끼워 넣기, 정답집의 `〉〉〉`/`〉〉>` 혼용, 학습목표 누락, 그림 문제, 번호 누락/중복). 아래를 모두 검증:
1. 짝이 정확: 가짜 책에서 문제 i 의 선지 내용·정답·해설·학습목표가 **문제 i 의 것**임을 모든 문제에서 대조(무작위 시드 여러 개). 한 문제라도 다른 문제 것과 섞이면 실패.
2. 요약쪽이 선지에 붙지 않음, 장 제목·`PART` 줄이 선지에 붙지 않음.
3. 선지 한 줄에 둘 → 분리, 이어진 긴 선지 → 이음, 선지 순서가 어긋나면 오류.
4. 해설 제목/불릿 문단 나누기, `◆` 코드 뽑기·본문에서 제거.
5. 정답 없음/정답집만 있음/정답 범위 초과/중복 항목의 진단과 `SKIPPED_*`.
6. 학습목표 없음 → 기본 제외, `requireObjective: false` 면 포함(objectiveCode 없이).
7. `lockChoicesOnReference`: 해설에 `①` 이 있으면 lock-all.
8. `detectBook` 판별 3종.
9. 결정적: 같은 입력이면 같은 출력(JSON 동일).
10. 줄 이음 단위 시험은 2-2 참고.
11. 성능: 가짜 책 2,000문제 정도를 2초 안에 처리(느리면 vocabulary 를 한 번만 만들고 Map 을 쓰도록 한다).

## 마무리
`npm.cmd run format`, `format:check`, `typecheck`, `lint:deps`, 관련 테스트, 전체 `npm.cmd test`, `npm.cmd run build` 통과. 모듈 외부에서는 `src/modules/workbook/index.ts`, `src/modules/subject-catalog/index.ts` 만 import 한다.

## 최종 보고 형식
1. 만든/수정한 파일 목록
2. 실행한 명령과 결과(통과/실패 그대로)
3. 하지 못한 것, 막힌 것, 가정한 것
4. 계약 변경 요청(있으면)
