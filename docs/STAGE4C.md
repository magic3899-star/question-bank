# 4C단계: 선지 번호 참조 안전장치와 출력 레이아웃

## 선지 번호 참조

`content-model.referencesChoiceLabels(blocks)`는 문단 run과 표 안 중첩 블록의 텍스트에서 ①~⑩을 검사한다. 선지 내용이나 이미지 대체 텍스트를 문제 참조로 판정하지 않는다.

Word 가져오기는 해설·본문·예문 중 하나라도 참조가 있으면 `shufflePolicy: 'lock-all'`로 설정한다. `lockChoicesOnReference?: boolean` 옵션의 기본값은 true이며 false로 끌 수 있다. 최종 포함된 문제만 info `CHOICES_LOCKED_BY_REFERENCE`를 받고 원본 위치·본문 앞 20자·문제 편집에서 고정 해제하는 방법을 제공한다. 기존 선지 본문의 `fixedPosition` 판정은 옵션과 독립적으로 유지한다.

`standardValidators`의 `choice-label-reference` 플러그인은 같은 참조가 있는데 `shufflePolicy: 'free'`이면 warn `CHOICE_LABEL_REFERENCE_UNLOCKED`를 반환한다. 직접 추가한 문제와 사용자가 고정을 해제한 문제도 검수할 수 있다. 실제 문제 편집 UI는 이후 앱 단계에서 연결한다.

해설의 번호를 자동 변환하지 않는다. 원문자가 법 조항·목록 번호일 수 있어 번호의 의미를 자동으로 판단하면 내용 자체를 잘못 바꿀 수 있다. 보수적으로 선지 전체를 고정하고 사람이 검토하도록 한다. 선지 고정이 많으면 정답 위치 균형 조정의 자유도가 줄어들 수 있으며, 기존 섞기의 고정 우선 정책을 따른다.

가짜 300문제 은행에 해설·본문·예문 참조를 가진 잠금 문제를 포함했다. 종단 검사와 원본 대조 헬퍼는 참조 문제의 확정본 `sourceChoiceId` 순서가 원본 순서와 같은지 검사한다. 메타 테스트는 가짜 문제의 잠금을 일부러 풀고 실제 생성 파이프라인을 실행해 순서 오류가 검출되는지 확인한다.

## Word와 HTML

- 첫 본문 블록이 문단이면 `N. 문제 줄`을 한 문단에 출력하고 두 번째 줄부터 번호 폭만큼 들여쓴다. 첫 블록이 표·이미지이거나 본문이 없으면 번호 문단을 따로 둔다. 원본 run 서식·공백·줄바꿈은 유지한다.
- 문항과 해설 문항 앞 간격은 Word 160 twip(8pt), HTML 8pt다. 해설의 `N. 정답: ④` 제목은 굵게 유지한다.
- Word는 문항 안 모든 문단에 `keepLines`, 마지막 문단을 제외한 문단에 `keepNext`를 적용한다. 중첩 표의 셀과 Word 형식상 필요한 끝 빈 문단도 포함하며 모든 표 행은 `cantSplit`이다. 마지막 문단은 다음 문항에 연결하지 않는다. HTML은 기존 `break-inside: avoid`를 유지한다.
- 정답표는 `번호 | 정답` 머리글을 5쌍 반복하고 굵은 글씨·연한 음영·가운데 정렬을 사용한다. Word 머리글은 페이지마다 반복하도록 표시한다. HTML도 `thead`와 열 머리글을 사용한다.
- 출력 검증 헬퍼는 번호와 첫 본문이 합쳐진 문단을 정확히 대조한다. 번호별 본문·예문·선지·정답·해설·학습목표, 밑줄·이미지·표 검사는 유지한다. 공백 정규화로 차이를 숨기지 않는다.

문항 전체가 한 단보다 길면 Word의 문단 유지 설정만으로 한 단에 담을 수 없다. Word가 배치를 조정하거나 단·쪽을 나눌 수 있으며 글꼴·버전에 따라 실제 페이지 배치는 달라진다. HTML도 한 단보다 큰 문항은 인쇄 엔진의 분할 한계를 따른다.

## Excel

모든 시트는 A4·가로·너비 1쪽 맞춤(`fitToPage: true`, `fitToWidth: 1`, `fitToHeight: 0`)이다. 첫 행을 반복 인쇄하고 가로 가운데 배치한다. 여백은 인치 기준 좌우 0.25, 위아래 0.5, 머리말·꼬리말 0.25다. ExcelJS 설정의 속성 이름은 `printTitlesRow: '1:1'`이다.

셀의 richText를 합친 텍스트와 열 너비로 줄 수를 추정한다. 한글 등 비ASCII 문자는 두 문자 폭으로 계산하고 명시적 줄바꿈도 센다. 줄당 15pt, 최소 18pt이며 이미지가 있으면 해당 셀의 텍스트 아래 이미지 높이와 간격을 더한다. 행 높이는 최대 409pt다. 서식 run 수가 늘어도 높이는 늘지 않는다. 번호 열은 가운데 정렬한다.

빈 번호의 학습목표는 문제·해설 시트 모두 비우며 문제 셀에는 `(출제 가능한 문제가 없어 비워 둔 번호입니다)`를 출력한다. 정답표·해설 시트의 기존 빈 번호 표시는 유지한다.

매우 긴 텍스트나 이미지 여러 개가 409pt를 넘으면 일부 내용·이미지가 다음 행에 걸치거나 잘릴 수 있으므로 사용자가 배치를 조정하거나 Word/PDF 출력을 사용할 필요가 있다. 너비 1쪽 맞춤은 열이 옆 인쇄 쪽으로 분리되는 것을 방지하며, 열이 많으면 글자가 작아질 수 있다. 실제 글꼴 폭을 측정하는 자동 맞춤은 아니다.

## 검증 범위

검증은 코드로 만든 가짜 문제와 메모리의 출력만 사용했다. Word ZIP/XML의 번호와 본문·내어쓰기·간격·keepNext·keepLines·cantSplit·정답 머리글을 검사하고 ExcelJS로 재개방해 페이지 설정·행 높이·이미지·빈 번호를 확인한다. HTML은 같은 요소에 번호와 본문이 있는지와 표 머리글을 검사한다.

실제 Word·Excel 앱에서의 시각적 재검수는 수행하지 않았다. 실제 문제 데이터·금지 폴더에 접근하지 않았고 네트워크 설치·git commit/push도 하지 않았다. 계약 변경 요청은 없다.

## 실행 결과

- `npm.cmd run test:fast`: 최종 통과, 41개 파일·330개 테스트, 종료 코드 0.
- 작업 중 빠른 검사 1회는 신규 Word 테스트가 중첩 행의 `cantSplit`까지 함께 집계해 실패했다(329개 통과·1개 실패, 종료 코드 1). 각 행 자체의 `trPr`를 검사하도록 수정한 뒤 통과했다.
- `npm.cmd test`: 통과, 44개 파일·380개 테스트, 약 46.24초, 종료 코드 0. 종단 무결성·출력 대조·고의 잠금 해제 메타 테스트를 포함한다.
- `npm.cmd run typecheck`: 통과, 종료 코드 0.
- `npm.cmd run lint:deps`: 통과, 104개 모듈·318개 의존·위반 0, 종료 코드 0.
- `git diff --check`: 통과, 종료 코드 0. 운영 변경 파일의 `any`·직접 난수·직접 시각 사용은 검색 결과가 없다. `src/contracts/index.ts`의 diff는 없다.

## 만든/수정한 파일

- `docs/STAGE4C.md`
- `src/modules/content-model/index.ts`
- `src/modules/content-model/choice-labels.test.ts`
- `src/modules/importers/docx/index.ts`
- `src/modules/importers/docx/choice-label-reference.test.ts`
- `src/modules/validators/index.ts`
- `src/modules/validators/validators.test.ts`
- `src/modules/validators/choice-label-reference/index.ts`
- `src/modules/validators/choice-label-reference/choice-label-reference.test.ts`
- `src/modules/exporters/docx/index.ts`
- `src/modules/exporters/docx/docx.test.ts`
- `src/modules/exporters/xlsx/index.ts`
- `src/modules/exporters/xlsx/xlsx.test.ts`
- `src/modules/render-html/index.ts`
- `src/modules/render-html/render-html.test.ts`
- `tests/fixtures/examBank.ts`
- `tests/fixtures/extractText.ts`
- `tests/fixtures/extractText.test.ts`
- `tests/fixtures/htmlText.ts`
- `tests/fixtures/htmlText.test.ts`
- `tests/e2e/assertSnapshotMatchesSource.ts`
- `tests/e2e/exam-integrity.test.ts`
- `tests/e2e/assertExportMatchesSnapshot.ts`

별도로 작업 중 변경된 `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/NEXT.md`와 기존/추가 프롬프트 파일은 이 작업에서 수정하지 않았다.
