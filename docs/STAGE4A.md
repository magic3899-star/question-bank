# 4A단계: 시험지 확정본·생성 파이프라인·HTML 렌더러

계약은 변경하지 않았다. 모든 운영 함수는 파일·네트워크·현재 시각·전역 난수를 사용하지 않는다. 문제와 자산, 시드, 시각, 시험 ID를 호출자가 전달한다. 공개 진입점은 각 모듈의 `index.ts`다.

## 모듈 사용법

아래는 앱 조립 코드 예시다. `rules`, `candidates`, `assets`, `history`, `seed`, `createdAt`, `examIdPrefix`는 호출자가 공급한다.

```typescript
import { createSelector } from '../src/modules/selector/index';
import { standardConstraints } from '../src/modules/constraints/index';
import { shufflers } from '../src/modules/shuffler/index';
import { generateExams } from '../src/modules/generation/index';
import { renderExamHtml, resolveTemplate } from '../src/modules/render-html/index';

const result = generateExams({
  rules, candidates, assets, history, seed, createdAt, examIdPrefix,
  shuffle: {
    shuffleQuestionOrder: true, shuffleChoices: true,
    balanceAnswerPositions: true,
  },
  titleTemplate: '모의고사 {회차}회',
}, { selector: createSelector(standardConstraints), shufflers });

if (result.ok) {
  const documents = renderExamHtml(result.snapshots, {
    parts: ['questions', 'answers', 'explanations'],
    combineParts: true, templateId: 'standard',
    // fontFaceCss: 앱이 번들 폰트를 data URI로 인코딩한 @font-face CSS
  });
  // 앱이 documents의 html을 미리보기와 PDF 출력에 동일하게 전달한다.
}
const template = resolveTemplate('standard');
```

`generateExams`의 선택기와 섞기 플러그인은 주입한다. 구현 모듈을 직접 import하지 않는다. `rng` 의존은 이번 단계의 요구에 따라 아키텍처 §3과 의존 검사 허용 목록에 반영했다. 선택 난수는 `select`, 회차별 섞기 난수는 `shuffle/exam0`부터 fork한다. precheck와 select는 독립된 난수 객체를 받는다.

사전 점검 진단을 수집하고 실제 선택 결과에 error가 있으면 확정본·이력 생성 전에 중단한다. 섞기 ID를 찾지 못하면 `SHUFFLER_NOT_FOUND`와 사용 가능한 ID 목록을 반환한다. 선택 결과의 회차 수가 다르면 `EXAM_COUNT_MISMATCH`로 중단한다. 후보 부족 warn은 정상 진행한다. `ok`는 모든 수집 진단에 error가 없을 때만 true다. 생성·검증 오류가 있는 확정본도 검수용으로 반환하므로 저장·출력 전에 `ok`를 확인해야 한다. 이력은 메모리 반환값이며 저장은 앱이 맡는다. 빈 번호는 이력의 questionIds에서 제외한다.

## 확정본과 번호

`buildSnapshot({ exam, rules, examIndex, seed, title, examId, createdAt, assets, blankPlacement? })`는 `{ snapshot, diagnostics }`를 반환한다. `examIndex`는 호출 회차 정보이며 번호·제목·ID는 명시한 인자를 따른다. 제목의 `{회차}` 치환과 `${examIdPrefix}-${i+1}` ID 생성은 generation이 맡는다.

- 번호는 최종 배치 이후 `rules.startNumber + index`로 붙인다.
- 선지 라벨은 현재 위치에서 ①~⑩으로 만든다. 정답 ID를 현재 선지와 대응시켜 오름차순 정답 라벨을 만든다. 10개 초과는 `LABEL_OVERFLOW`, 원본에 없는 정답 ID는 `ANSWER_CHOICE_MISSING` 오류다.
- 기본 `blankPlacement: 'slot'`은 규칙의 슬롯 순서대로 각 슬롯의 마지막 문제 뒤에 빈 번호를 넣는다. 선택 문제가 없는 슬롯은 해당 슬롯 위치에 빈 번호만 넣는다. blanks 배열의 기재 순서와 무관하게 규칙 슬롯 순서를 따른다.
- 문제들의 slotOfQuestion이 규칙 슬롯 순서대로 이어지지 않으면 자동으로 `end`를 적용한다. 명시한 `end`는 항상 모든 문제 뒤에 넣는다. 해당 경우 빈 번호는 blanks 배열 순서를 따른다. 슬롯 대응이 없거나 알 수 없는 빈 슬롯도 end로 처리해 문항을 유실하지 않는다.
- 각 blanks 항목의 count만큼 비어 있는 SnapshotItem을 만든다. 문제지에는 안내문과 점선 상자, 정답지에는 대시를 표시한다.

모든 블록을 정규화 없이 깊이 복사하고 최종 확정본 전체를 깊이 동결한다. 입력을 동결하거나 변경하지 않는다. passage가 원본에 없으면 확정본에서도 생략한다. 지문·본문·선지·해설과 중첩 표를 순회해 필요한 자산만 복사한다. 누락 자산은 `ASSET_MISSING`으로 문제 ID·assetId·다시 가져오기 안내를 반환한다. 잘못된 base64 또는 디코딩한 바이트의 SHA-256 불일치는 `ASSET_HASH_MISMATCH`다.

`content-model.canonicalJson`은 키 정렬·undefined 제외를 공개한다. 배열 순서는 유지하며 undefined 원소는 제외한다. JSON으로 직렬화 가능한 블록·값을 전제로 한다. 확정본 해시는 `sha256Hex(canonicalJson({ items, assets }))`이고 assets에는 키별 `{ id, mime, sha256 }`만 포함한다. base64 문자열 대신 디코딩한 바이트를 별도로 검증한다. 내용 공백·서식·선지 위치도 items 해시에 포함되며 제목·시험 ID·시각은 내용 해시에 포함하지 않는다.

`verifySnapshot(snapshot)`은 내용 해시, 번호 연속, 위치 라벨, 정답 라벨의 존재·중복·오름차순, 이미지 존재·데이터 해시, 빈 번호의 비어 있는 필드를 검사한다. 규칙 시작 번호는 확정본 계약에 별도 필드가 없으므로 첫 문항을 기준으로 연속성을 검사한다. 원본 정답과의 의미 대응은 원본 문제를 받는 종단 대조 헬퍼가 검사한다.

## HTML과 폰트

`renderBlocks(blocks, { assets })`는 문단·run 서식·이미지·재귀 표를 출력한다. 밑줄은 `<u>`로 보존한다. 줄바꿈은 `<br>`, 탭은 `&emsp;`, 연속 공백은 pre-wrap으로 보존한다. 텍스트와 속성을 이스케이프한다. 이미지는 png/jpeg/gif/webp/bmp data URI만 사용하고 누락·지원하지 않는 형식은 한국어 경고 자리표시로 대체한다. 1×1 표는 `qb-table qb-box`다.

`renderExamHtml`은 항상 회차별 문서를 만든다. `combineParts: true`는 회차당 한 파일에 요청된 문제→정답→해설을 넣으며, false는 회차·파트마다 파일 하나다. 파트 중복은 제거하고 빈 parts 또는 빈 snapshots는 빈 배열을 반환한다. 각 결과는 `{ part, examId, title, html }`이다. 파일명 구성과 실제 저장은 앱/출력기가 맡는다.

standard는 A4·18mm 여백·10pt Noto Serif KR 본문·Noto Sans KR 제목을 사용한다. 문제지는 2단·문항 분할 방지·지문 들여쓰기·성명/점수 칸, 정답지는 한 행 5쌍의 번호/정답 격자, 해설지는 정답·해설 블록·학습목표다. 화면의 색 변수는 DESIGN의 surface/text/border/warn 값을 따르며 다크 모드를 지원한다. 인쇄는 밝은 표면으로 고정한다. 외부 CSS·이미지·폰트를 요청하지 않는다.

앱은 `fontFaceCss`에 번들 폰트의 **CSS 문자열**(`@font-face { ... src: url(data:font/woff2;base64,...); }`)을 주입한다. 렌더러가 기본 스타일 앞에 별도 style 요소를 만든다. 외부 URL·@import·style 탈출·CSS escape를 포함한 주입은 버린다. fontFaceCss가 없으면 지정된 시스템 폰트로 대체한다. 알 수 없는 templateId는 standard로 대체하며 `resolveTemplate(id)`의 usedFallback을 앱에서 안내에 사용할 수 있다.

## 검증과 한계

`tests/e2e/assertSnapshotMatchesSource.ts`는 이후 출력기 테스트에서도 재사용할 수 있다. 정규화 없이 deepStrictEqual로 원본 지문·본문·해설·ID별 선지 내용을 비교하고 정답 ID/내용·고정 위치·번호·verifySnapshot을 검사한다. 해시를 다시 계산한 훼손본도 원본과 다르면 실패한다.

가짜 은행은 2과목 총 300문제로 지문 이미지·중첩 표·1×1 보기 상자·밑줄·고정 선지·lock-all·복수 정답·선지가 다른 동일 지문 후보를 포함한다. 각 과목에 100개 시드, 회차 4개씩 실제 selector/standardConstraints/shufflers 조합을 실행하고 같은 시드로 두 번 생성한 전체 JSON을 비교한다. 회차 전체에서 ID·지문 중복이 없음을 확인한다. 후보 부족·입력 동결·다른 시드 다양성·고의 훼손 메타 테스트도 포함한다. HTML 텍스트 순서는 `tests/fixtures/htmlText.ts`의 태그 제거·엔티티 복원 헬퍼로 확인한다.

- PassageGroup 공용 지문 렌더링은 아직 미지원이다. 이 단계의 데이터에는 없으며 문항 자체 passage만 보존·렌더링한다.
- 폰트 파일 번들·앱 미리보기 연결·실제 PDF/Word/Excel 출력은 이후 단계다. 실제 인쇄 페이지 나눔은 브라우저와 주입 폰트에 따라 달라질 수 있다.
- Question/Choice ID 유일성, 유효한 규칙, 직렬화 가능한 계약 데이터를 전제로 한다. 선택기의 기존 제한 탐색 특성은 유지한다.
- 실제 문제 파일·금지 폴더·네트워크를 사용하지 않았고 commit/push하지 않았다. 계약 변경 요청은 없다.

최종 검사 결과:

- `npm.cmd test`: 통과, 34개 파일·301개 테스트, 종료 코드 0. 종단 테스트는 약 38.7초, 전체 실행은 약 39.7초였다. 시간은 환경에 따라 달라진다.
- `npm.cmd run typecheck`: 통과, 종료 코드 0.
- `npm.cmd run lint:deps`: 통과, 83개 모듈·240개 의존·위반 0, 종료 코드 0.
- 임시 운영 파일에 exam-snapshot→rng, generation→selector, generation→shuffler, render-html→storage, exporters→storage 위반을 넣었을 때 `npm.cmd run lint:deps`가 실패했다. 모듈 경계 5개와 exporters-no-storage 1개, 총 6개 오류·종료 코드 6이었다. finally에서 임시 파일과 검사 플러그인 폴더를 제거하고 정상 검사 통과를 확인했다.
- 신규 운영 모듈의 any·전역 난수·직접 시각·파일/네트워크/crypto 접근 검색 결과는 없었다. 별도 설치는 하지 않았다.

변경 파일:

- `.dependency-cruiser.cjs`
- `docs/ARCHITECTURE.md`
- `docs/STAGE4A.md`
- `src/modules/content-model/index.ts`
- `src/modules/content-model/content-model.test.ts`
- `src/modules/exam-snapshot/index.ts`
- `src/modules/exam-snapshot/exam-snapshot.test.ts`
- `src/modules/generation/index.ts`
- `src/modules/generation/generation.test.ts`
- `src/modules/render-html/index.ts`
- `src/modules/render-html/render-html.test.ts`
- `tests/fixtures/examBank.ts`
- `tests/fixtures/htmlText.ts`
- `tests/fixtures/htmlText.test.ts`
- `tests/e2e/assertSnapshotMatchesSource.ts`
- `tests/e2e/exam-integrity.test.ts`
