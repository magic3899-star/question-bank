# 4B단계: PDF · Word · Excel 출력과 무결성 검증

출력기는 `ExamSnapshot[]`과 `ExportOptions`만 받는다. 저장소·파일·네트워크·Electron·브라우저에 접근하지 않으며 계약은 변경하지 않았다. 결과의 `Uint8Array`를 저장하는 일은 앱이 맡는다. 설치된 `docx` 9.15.0과 `exceljs` 4.4.0을 사용하며 추가 설치는 하지 않는다.

## 사용법

```typescript
import { createExporters } from '../src/modules/exporters/index';
import type { PdfRenderer } from '../src/modules/exporters/pdf/index';

// 앱이 구현해 주입하는 함수다. 출력기에는 Electron 의존성이 없다.
const renderPdf: PdfRenderer = async (html, page) => {
  return appPrintToPdf(html, page);
};
const exporters = createExporters({ renderPdf, fontFaceCss: bundledFontCss });
const files = await exporters[0].export(snapshots, {
  parts: ['questions', 'answers', 'explanations'],
  templateId: 'standard', combineParts: true,
});
```

`appPrintToPdf`, `bundledFontCss`, `snapshots`는 앱이 공급한다. `createExporters()`는 Word·Excel만 반환하며, `renderPdf`를 주입하면 PDF를 추가한다. 개별 진입점은 `exporters/docx/index.ts`의 `docxExporter`, `exporters/xlsx/index.ts`의 `xlsxExporter`, `exporters/pdf/index.ts`의 `createPdfExporter`와 `PdfRenderer`다.

파트 순서는 요청 배열의 순서와 무관하게 문제→정답→해설로 고정하고 중복을 제거한다. `combineParts: false`는 회차×파트마다 파일을 만들고, true는 회차마다 한 파일을 만든다. 요청 파트 또는 확정본 배열이 비면 결과도 빈 배열이다. 지원 템플릿은 standard이며 HTML의 알 수 없는 templateId는 기존 렌더러 규칙대로 standard로 대체한다. Word·Excel도 현재는 standard 레이아웃만 제공한다.

파일명은 `{제목}_{문제지|정답지|해설지}.{확장자}`, 결합본은 `{제목}_전체.{확장자}`다. `content-model.sanitizeFileName`은 Windows 금지 문자·제어문자를 `_`로 바꾸고, 앞뒤 공백·끝 점을 제거하며 예약어를 보호한다. 한글·중간 공백을 보존하고 100 코드 포인트까지만 사용한다. 출력 파일명에서는 파트명이 잘리지 않도록 제목에 최대 95 코드 포인트를 사용한다. 한 번의 호출 안에서 정리·절단 이후 같은 이름이나 대소문자 차이만 있는 이름은 `-2`, `-3`으로 해결한다. 서로 다른 호출 사이의 디스크 파일 충돌 처리는 앱의 저장 정책이다.

## PDF와 HTML

시험지는 앱의 다크 모드와 무관하게 항상 흰 종이다. `prefers-color-scheme: dark`와 중복 인쇄 색 재정의를 제거했다. 문제지는 **문제 줄(stem)→예문(passage)→선지** 순서이며 정답·해설 파트의 내용은 유지한다. 이미지는 `max-width: 100%; height: auto`로 단 너비를 넘지 않는다. 4A 문서의 시험지 다크 모드 설명은 이 변경으로 대체된다.

PDF는 `renderExamHtml`이 만든 문서마다 주입된 렌더러를 호출한다. 페이지 인자는 `{ paper: 'A4', marginMm: 18, printBackground: true, pageNumbers: true }`다. 반환 MIME은 `application/pdf`다. 변환 오류는 원인을 `cause`로 유지하면서 한국어 재시도 안내로 감싼다.

한글 폰트는 앱이 번들 글꼴을 data URI 기반 `@font-face` CSS로 만들어 `fontFaceCss`에 주입한다. 기존 렌더러는 외부 URL·style 탈출을 차단한다. 앱은 실제 PDF 출력 전에 글꼴 로딩과 이미지 디코딩 완료를 기다려야 한다.

## Word

- A4·18mm 여백, 바탕/Batang 10pt 본문, 맑은 고딕 제목. 글꼴 이름만 지정하며 글꼴 파일은 내장하지 않는다. Windows 기본 글꼴이 없는 환경에서는 대체 글꼴에 따라 배치가 달라질 수 있다.
- 문제지 제목·성명/점수는 전체 너비에 두고, 이어지는 연속 구역에 구분선 있는 2단을 지정한다. 문제 번호·문제 줄→예문→확정본 라벨과 선지 순서다. 선지 문단에는 걸친 들여쓰기를 적용한다.
- 정답지는 한 행 5쌍의 번호·정답 표다. 해설지는 번호·정답·해설·학습목표를 출력한다. 빈 번호는 문제지에 점선 테두리 안내문, 정답지에 대시, 해설지에 안내문을 둔다.
- 결합본은 회차마다 문제·정답·해설 구역을 만들고 정답·해설은 1단의 새 페이지로 시작한다.
- 문단의 밑줄·굵게·기울임·위첨자·아래첨자를 보존한다. 원본 run 하나 안에서 줄바꿈·탭을 기록하므로 밑줄 run 수가 늘어나지 않는다.
- 이미지 MIME png/jpeg/gif/bmp를 ImageRun으로 출력한다. 크기는 원본 값 또는 기본 200×150px이며 너비 300px를 넘으면 비율을 유지해 축소한다. 표 안에서는 셀 수에 따라 더 좁게 제한한다. 누락 자산은 `[이미지 없음]`, 그 외 MIME은 `[지원하지 않는 이미지]`로 표시한다.
- 표는 중첩 구조·테두리·안쪽 여백을 보존한다. 1×1 표도 표 형태의 보기 상자로 유지한다. 셀의 마지막에는 Word 형식에 필요한 빈 문단을 보충할 수 있다.

## Excel

- 문제 시트: 번호, 학습목표, 예문, 문제, 선지 열들, 정답. 선지 열은 해당 회차 최대 선지 수만큼 만든다. 정답표 시트: 번호·정답. 해설 시트: 번호·정답·해설·학습목표. 요청한 파트의 시트만 포함한다.
- **선지 열 머리글에 ①~⑩을 두고 셀에는 내용만 둔다.** 위치 라벨이 중복 저장되지 않고 같은 위치의 선지를 행별로 비교하기 쉽다. 확정본 라벨이 실제 위치와 다르면 오류로 중단한다.
- 맑은 고딕, 굵은 배경색 머리글, 첫 행 고정, 열 너비, 자동 줄바꿈, 세로 위쪽 정렬을 지정한다. 빈 번호 행은 연한 회색과 `(비워 둔 번호)` 안내를 사용하며 정답은 문제·해설 시트에서 대시로 표시한다.
- 밑줄·굵게를 포함한 run 서식은 richText로 보존한다. 기울임·위첨자·아래첨자도 변환한다.
- 표/보기 상자는 **텍스트로 평탄화**한다. 행은 줄바꿈, 열은 ` | `로 구분한다. 중첩 표도 같은 규칙으로 펼친다. 셀 병합·표 테두리·상자 모양은 보존하지 않는다. 종단 검사는 표 텍스트를 정확히 비교하고 표 개수는 Word/HTML에서 검증한다.
- 이미지는 png/jpeg/gif만 ExcelJS가 지원한다. `[이미지]` 표식과 함께 `workbook.addImage`로 원래 블록이 속한 셀 근처에 삽입한다. 예문뿐 아니라 문제·선지·해설·중첩 표의 이미지도 보존한다. 여러 이미지는 셀 텍스트 아래에 세로 배치하고 행 높이를 늘린다. 너비는 300px 이하다. 원시 EMU 오프셋을 사용해 ExcelJS 소수 좌표 환산으로 이미지가 겹치는 문제를 피한다. 누락·지원 외 자산은 한국어 자리표시로 표시한다.
- 행 높이는 텍스트 길이와 이미지 크기를 바탕으로 추정한다. 극단적으로 긴 텍스트·많은 이미지가 있는 행은 Excel의 행 높이 제한과 글꼴 렌더링 차이 때문에 사용자가 높이를 조절하거나 Word/PDF를 사용할 필요가 있다. Excel은 인쇄용 시험지와 동일한 2단 편집 레이아웃을 제공하지 않는다.

## 검증

모든 검증은 코드로 만든 가짜 문제은행과 메모리상의 결과만 사용한다. 실제 문제 파일·금지 폴더는 읽거나 복사하지 않는다.

`tests/fixtures/extractText.ts`는 JSZip과 XML 파서로 Word 본문을 검증·추출하고 ExcelJS로 Excel을 재개방한다. Word의 줄바꿈·탭·문단 공백, Excel의 셀 richText를 복원한다. 출력 파일의 숨겨진 원본 데이터나 해시를 정답 대신 사용하지 않는다.

`tests/e2e/export-integrity.test.ts`는 실제 selector·constraints·shufflers·generateExams를 조립한다. 가짜 300문제 은행을 30개 시드·2과목으로 번갈아 사용하고, 매 시드 2회차·회차당 실제 문항 6개와 빈 번호 1개를 만든다. 60개 확정본 각각을 Word/Excel/PDF HTML로 두 번 출력한다.

`assertExportMatchesSnapshot`은 번호별 문제 줄·예문·확정본 라벨과 선지·정답·해설·학습목표·빈 번호를 비교한다. Word 문단과 Excel 셀은 공백을 정규화하지 않고 정확히 대조한다. HTML도 파트·번호별 텍스트를 추출해 비교한다. 밑줄 run·이미지 참조·미디어 파일·중첩 표·2단 구역을 검증한다. 고의로 지문 한 글자 또는 정답 라벨을 바꾼 출력을 원본과 비교하면 **각 형식마다 독립적으로** 실패해야 한다.

동일 입력의 추출 텍스트·HTML과 입력 불변성을 검사한다. ZIP 바이트는 비교하지 않는다. 두 라이브러리의 ZIP 항목과 문서 메타데이터에는 내부에서 생성하는 시각 등이 포함될 수 있다. 사용 중인 docx 공개 문서 옵션에는 생성일을 전달하는 옵션이 없으며, 출력 코드에서 직접 시각을 만들거나 라이브러리 내부를 수정하지 않는다. 결정성의 보장은 추출 텍스트·문항 내용에 적용된다.

의존 검사에는 출력기의 외부 의존을 docx/exceljs로 제한하는 규칙을 추가했다. 임시 파일로 storage·형제 출력기·node:fs·jszip import를 넣었을 때 5개 의존 오류로 실패했고 임시 파일을 삭제했다. 운영 출력기에는 contracts/content-model/render-html와 지정한 라이브러리 이외의 import가 없다.

## 앱 단계에 남은 일

Electron `webContents.printToPDF`를 `PdfRenderer`로 연결하고 A4·여백·배경·페이지 번호를 대응시킨다. 앱의 페이지 번호 header/footer와 여백 정책을 함께 확인해야 한다. 흰 종이 HTML을 미리보기와 PDF에 동일하게 사용하고 번들 한글 글꼴 로딩 후 변환한다. 파일 저장 대화상자·권한·실제 저장·실패 안내는 앱이 담당한다.

실제 Electron PDF 생성과 Word/Excel 앱에서의 시각적 인쇄 검수는 이 단계에 포함하지 않는다. PDF 검사는 주입된 가짜 렌더러가 받은 HTML을 검증한다. 계약 변경 요청은 없다.

## 최종 실행 결과

- `npm.cmd test`: 통과, 41개 파일·328개 테스트, 종료 코드 0. 전체 약 58.7초, 신규 출력 종단 검사 약 25.8초.
- `npm.cmd run typecheck`: 통과, 종료 코드 0.
- `npm.cmd run lint:deps`: 통과, 100개 모듈·303개 의존·위반 0, 종료 코드 0.
- 임시 위반 검사: 의도대로 실패, storage 경계/금지 2개·형제 출력기 경계 1개·허용하지 않은 외부 의존 2개, 총 5개 오류, 종료 코드 1. 임시 파일 삭제 후 정상 검사를 통과했다.
- 구현 중 타입 검사와 단위 검사에서 발견한 오류는 수정했다. 최종 전체 검사에는 실패가 없다. 직접 시각·전역 난수·any·파일/네트워크 접근을 신규 운영 코드에서 검색한 결과는 없었다.
- 실제 문제 파일·금지 폴더·네트워크 설치·commit/push를 사용하지 않았다.

## 만든/수정한 파일

- `.dependency-cruiser.cjs`
- `src/modules/content-model/index.ts`
- `src/modules/content-model/file-name.test.ts`
- `src/modules/render-html/index.ts`
- `src/modules/render-html/render-html.test.ts`
- `src/modules/exporters/index.ts`
- `src/modules/exporters/exporters.test.ts`
- `src/modules/exporters/pdf/index.ts`
- `src/modules/exporters/pdf/pdf.test.ts`
- `src/modules/exporters/docx/index.ts`
- `src/modules/exporters/docx/docx.test.ts`
- `src/modules/exporters/xlsx/index.ts`
- `src/modules/exporters/xlsx/xlsx.test.ts`
- `tests/fixtures/exportSnapshot.ts`
- `tests/fixtures/extractText.ts`
- `tests/fixtures/extractText.test.ts`
- `tests/e2e/assertExportMatchesSnapshot.ts`
- `tests/e2e/export-integrity.test.ts`
- `docs/STAGE4B.md`
