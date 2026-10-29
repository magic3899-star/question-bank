# 2단계: Word 가져오기와 검수

실제 문제 파일을 열지 않고 `tests/fixtures/docxBuilder.ts`가 메모리에서 만든 가짜 DOCX만 사용했다. 계약 파일은 변경하지 않았다.

## 사용

```typescript
import { docxImporter, standardProfile, validateProfile } from '../src/modules/importers/index';
import { runValidators, standardValidators } from '../src/modules/validators/index';

const profile = { ...standardProfile, stemLookaheadBlocks: 8 };
const profileErrors = validateProfile(profile); // 한국어 오류 문자열 배열
if (profileErrors.length) throw new Error(profileErrors.join('\n'));
const draft = await docxImporter.parse(
  { fileName: '가짜.docx', data: bytes },
  { subject: 'dummy', profile },
);
const diagnostics = [
  ...draft.diagnostics,
  ...runValidators(standardValidators, draft.questions.map((item) => item.question)),
];
```

`bytes`는 호출자가 전달하는 `Uint8Array`다. 가져오기 모듈은 파일 시스템이나 네트워크를 사용하지 않는다. 과목이 비어 있으면 ZIP을 열기 전에 `SUBJECT_REQUIRED`를 반환한다. 잘못된 ZIP, XML 또는 양식 설정은 예외 대신 `DOCX_INVALID`를 반환한다. `validateProfile`로 양식 설정 오류를 먼저 표시할 수 있다.

프로파일은 JSON으로 저장할 수 있다. 정규식 문자열은 `u` 플래그로 컴파일한다. 문제 시작 정규식의 첫 번째 캡처 그룹은 원래 번호다. 학습목표 정규식에는 `subject`, `code`, `text`, `grade` 이름 그룹이 필요하며 문장과 등급 그룹은 빈 값 또는 미일치일 수 있다. 번호의 앞자리 0을 보존하도록 `extra.originalNumber`는 문자열이다.

문제별 검수 플러그인은 가능한 `questionId`를 제공하며 출처 태그를 진단 ref에 채우지 않는다. `runValidators`가 입력 배열의 0부터 시작하는 `draftIndex`를 보충하고 error → warn → info 순으로 안정 정렬한다. 정답 분포 진단은 전체 집합에 대한 것이므로 특정 문제 인덱스가 없다. 중복 지문 검사는 동일 선지 집합이면 `DUPLICATE_EXACT`, 다른 선지 집합이면 `DUPLICATE_STEM_VARIANT`를 반환한다. 두 유형 모두 warn이며 지문이 같으면 한 시험·모든 회차에서 함께 출제되지 않는다는 안내를 포함한다. 한 묶음에 두 유형이 공존하면 두 진단을 함께 낸다.

## 3b에서 확정한 기본 가져오기 정책

기본값은 `includeGrades: ['A']`, `requireObjective: true`, `dedupeByPassage: true`다. 등급이 없거나 A가 아니면 info `SKIPPED_BY_GRADE`로 제외 사유·문단 위치·본문 앞 20자를 남긴다. `includeGrades: null` 또는 `[]`이면 등급 없는 문제도 허용한다. 학습목표 코드가 없으면 info `SKIPPED_NO_OBJECTIVE`로 제외한다. `requireObjective: false`로 허용할 때 등급 필터도 따로 적용되므로 목표 없는 문제의 검수에는 `includeGrades: null`을 함께 사용한다. 포함된 목표 없는 문제는 validator의 `OBJECTIVE_MISSING` 경고 대상이다.

등급·학습목표 필터를 통과한 순서에서 같은 지문의 첫 문제만 남긴다. 나머지는 info `SKIPPED_DUPLICATE_PASSAGE`로 제외 위치와 남긴 문제 위치를 안내한다. `dedupeByPassage: false`이면 모두 포함한다. 최종 포함 문제만 참조하는 이미지 자산을 유지하고 상세 진단의 draftIndex를 다시 연결한다. 제외 처리로 다음 문제의 경계가 달라지지 않는다.

## 구조와 한계

| 항목 | 처리 범위와 가정 | 한계·검수 사항 |
|---|---|---|
| 학습목표 | 줄 앞의 공백 뒤 한글 과목명 1~10자와 숫자 코드를 인식한다. 과목·코드 사이 공백, 코드 뒤 마침표, 목표 문장, 등급은 생략할 수 있다. `(A)`·`(B)`·`A항`·`B항`은 `A`·`B`로 저장한다. | `objectiveCode`는 `과목 코드`로 저장한다. 문장이 없으면 `extra.objectiveText`는 빈 문자열이다. 숫자 코드 없는 일반 문장과 불릿으로 시작한 줄은 목표가 아니다. |
| 원문자 자동 번호 | `numbering.xml`의 numId → abstractNumId → ilvl, `numFmt`·`start`·`lvlText`, `lvlOverride`·`startOverride`를 읽는다. `decimalEnclosedCircle`·`decimalEnclosedCircleChinese`·`decimalEnclosedFcircle` 문단을 선지 후보로 사용한다. | 카운터는 numId·ilvl별로 이어지며 문제별로 재시작하지 않는다. 선지 ID는 각 문제 안의 순서로 매긴다. 번호는 content에 저장하지 않는다. 복원한 문제별로 위치와 원래 번호를 포함한 info `AUTO_NUMBERING_RESTORED`를 낸다. |
| 자동 번호의 제한 | 다른 번호 형식이나 누락된 정의는 warn `AUTO_NUMBERING_IGNORED`로 알린다. 일반 텍스트 번호가 있으면 기존 판정을 따른다. | 문단 스타일에서 상속되는 numPr, 다단계 번호의 상위 수준 변경에 따른 자동 재시작은 지원하지 않는다. 진단용 원문자는 0~50을 지원하고 그 밖의 값은 `(숫자)`로 표시한다. 미리보기에서 선지 순서를 확인해야 한다. |
| 출처 태그 | 날짜 모양 태그는 닫는 `>`가 없어도 이전 레코드를 닫는 문제 경계로만 사용한다. | `sourceTag`는 설정하지 않고 태그 관련 진단도 내지 않는다. 해설에 흡수하지 않는다. |
| 버려진 내용 | 첫 문제 또는 첫 출처 태그 앞의 내용은 info `PREAMBLE_IGNORED`, 그 뒤 문제에 속하지 않은 내용은 warn `UNPARSED_BLOCKS`로 알린다. 연속 구간마다 진단 하나로 묶는다. | 최대 3개 문단의 앞 40자를 미리 보여주고 나머지는 `외 N개 문단`으로 표시한다. 문제 본문·선지·해설로 이미 분류된 문단은 버려진 내용에 포함하지 않는다. |

- 기본 양식은 문제 시작, 각 선지 시작, 정답, 해설 라벨과 학습목표가 각각 Word 문단에 있는 구조를 전제로 한다. 같은 문단 안의 줄바꿈은 내용으로 보존한다. 한 줄 안에 여러 선지를 나열하거나 라벨을 이미지로 넣은 문서는 별도 전처리가 필요하다.
- 번호 줄의 앞보기는 빈 문단·표·이미지·텍스트박스를 제외한 텍스트 문단을 기본 6개까지 센다. 첫 선지 표시가 정답보다 먼저 나와야 문제로 시작한다. 번호가 붙은 보기는 현재 문제의 passage에 남긴다.
- 해설의 단일 번호 목록은 다음 정답/해설 라벨 또는 서로 다른 선지 표시 2개 이상이 확인될 때만 새 문제 후보로 인정한다. 해설 자체가 완전한 문제 양식을 흉내 내면 텍스트만으로 구분할 수 없다. 정답·해설 라벨이 모두 없는 단일 선지 후속 문제도 이 경계에서 구분할 수 없다.
- 직접 지정된 run 서식은 보존한다. `styles.xml`의 문단 스타일·문서 테마에서 상속하는 서식, 원문자 선지 외 자동 번호 복원, 머리말·꼬리말·각주·댓글, OCR은 구현하지 않았다. Word의 일반 OOXML 네임스페이스를 사용하며 Strict OOXML 변형은 지원하지 않는다.
- 텍스트박스는 1×1 표로 보존하지만 음영색·좌표·정확한 배치는 계약의 블록 모델에 없으므로 보존하지 않는다. 부동 이미지도 원본 문단의 순서로 배치한다. 레거시 VML 이미지의 크기는 복원하지 않는다. DrawingML 이미지는 `wp:extent` 크기를 사용한다.
- 내부 `word/media/*` 관계 이미지가 대상이다. 외부 링크 이미지나 누락 자산은 `IMAGE_NOT_FOUND`로 알린다. 수식은 선형 텍스트와 경고로 남긴다. 대체 내용은 Choice만 사용한다.
- 지문 중복은 `content-model.questionContentKey`로 stem+passage의 텍스트와 중첩 이미지 asset id를 비교하며 선지는 포함하지 않는다. 앞 문제 번호·모든 공백·대소문자를 정규화한다. 이미지 픽셀이나 수식 모양을 비교하지 않는다. 긴 중복 묶음은 메시지에 위치 8개와 나머지 개수만 표시하여 출력도 O(n) 크기로 유지한다.

## 검증

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint:deps
```

1000개 가짜 문제의 DOCX 파싱은 빌더 시간을 제외하고 3000ms 미만, 1000개 동일 지문 검사는 1000ms 미만을 테스트에서 강제한다. 실제 실행 결과는 테스트 출력에 표시한다.

집계 파일은 같은 플러그인 계층의 공개 `index.ts`를 참조할 수 있다. 개별 플러그인은 다른 플러그인을 참조할 수 없다. 임시 파일로 `importers/docx → storage`와 `validators/objective-missing → validators/objective-format` 위반을 각각 만들었을 때 `npm.cmd run lint:deps`가 종료 코드 1로 실패함을 확인했다. 임시 파일은 `finally`에서 삭제했다.

초기 타입 검사에서 기존 registry 테스트의 Validator에 새 필수 `label`이 없는 문제와 신규 구현의 타입 오류가 발견됐다. 테스트의 가짜 플러그인과 구현을 수정했으며 계약은 그대로 유지했다.
