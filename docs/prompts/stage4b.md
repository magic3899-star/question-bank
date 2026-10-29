## 4B단계: 출력기 (PDF · Word · Excel) + 렌더러 수정 + 출력 무결성 테스트

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 구현하고 테스트를 돌려 통과한 뒤에만 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md(§3~§5), src/contracts/index.ts, docs/STAGE4A.md 를 `Get-Content -Encoding UTF8` 로 읽어라. `npm.cmd`/`npx.cmd`. 계약 수정 금지. 실제 문제 파일(문제 디비/, 규칙.docx), `.tmp-realcheck/` 접근 금지.
- **`docx`(9.15.0), `exceljs`(4.4.0) 는 이미 설치됨. 네트워크 설치 금지.** `exceljs` 의 uuid 취약점 경고는 알려진 사항이니 무시하라.
- 의존 규칙: `exporters/<id>` 는 `contracts, content-model, render-html` 과 위 서드파티만 import. **storage 금지, 형제 exporter 끼리 import 금지**, 집계 `exporters/index.ts` 만 하위 import 허용. `.dependency-cruiser.cjs` 확인·갱신 + 임시 위반으로 작동 확인 후 삭제.
- 모든 모듈 순수(Math.random/Date/파일/네트워크 금지). 출력기는 `ExamSnapshot` 만 입력으로 받는다(DB 접근 금지).

## 4B-1. render-html 수정 (검수자가 실제 문제로 확인한 결함 2개)
 1. **시험지는 항상 흰 종이**: `@media (prefers-color-scheme: dark)` 규칙을 제거하라. 화면 미리보기와 PDF 가 항상 같아야 한다(앱 화면의 다크 모드와 무관). `@media print` 의 색 재정의는 불필요하면 정리.
 2. **문항 내부 순서를 원본과 같게**: 현재 `passage → stem → choices` 로 출력한다. 원본 문서의 순서는 **`stem(문제 줄) → passage(보기·이미지·표·박스) → choices`** 이다. 문제지의 문항 HTML 을 이 순서로 바꾸고, 해설지 등 다른 파트에 영향이 없는지 확인하라. 테스트: 한 문항에서 stem 텍스트 < passage 텍스트 < 선지 텍스트 순으로 HTML 안에 나타남을 검사. 기존 테스트 중 순서에 의존하는 것은 수정.
 3. 이미지가 단 너비(2단 기준)를 넘지 않도록 `max-width: 100%; height: auto` 유지 확인.

## 4B-2. content-model: `sanitizeFileName(name: string): string`
Windows 에서 안전한 파일 이름: 금지 문자(`\ / : * ? " < > |` 와 제어문자)를 `_` 로, 앞뒤 공백·끝의 점 제거, 예약어(CON, PRN, AUX, NUL, COM1~9, LPT1~9)는 앞에 `_`, 길이 100자 이내(코드 포인트 기준으로 자름), 빈 결과는 '문서'. 한글/공백 보존. 테스트.
파일명 규칙(모든 출력기 공통): `{제목}_{파트명}.{확장자}` — 파트명은 문제지/정답지/해설지(합칠 때는 `전체`). 같은 이름 충돌은 호출자가 아니라 출력기가 `-2`, `-3` 으로 해결(한 번의 export 호출 결과 안에서 유일).

## 4B-3. src/modules/exporters/pdf
`createPdfExporter(renderPdf: PdfRenderer, opts?: { fontFaceCss?: string }): Exporter` — `Exporter`(contracts) id `'pdf'`, label 'PDF', extension 'pdf'.
- `PdfRenderer = (html: string, page: { paper: 'A4'; marginMm: number; printBackground: true; pageNumbers: boolean }) => Promise<Uint8Array>` (이 타입은 이 모듈에서 정의·export). 실제 구현(Electron `printToPDF`)은 앱 단계에서 주입한다. 이 모듈은 Electron/브라우저를 import 하지 않는다.
- `renderExamHtml`(render-html)로 문서(회차 × 파트)를 만들고 각각 `renderPdf` 호출 → `ExportedFile[]`(mime `application/pdf`, part 구분). `combineParts` 옵션을 존중.
- 테스트: 가짜 renderer 로 호출 횟수·html 내용(파트별)·page 옵션·파일명·`fontFaceCss` 전달 검증, renderer 가 던진 오류는 한국어 메시지로 감싸 전달("PDF 변환에 실패했습니다…").

## 4B-4. src/modules/exporters/docx (라이브러리 `docx`)
`docxExporter: Exporter` id `'docx'`, extension 'docx'. 회차 × 파트마다 파일(또는 combineParts 면 회차별 한 파일에 문제→정답→해설을 구역(section)으로).
레이아웃:
- A4, 여백 18mm. 본문 글꼴 `바탕`(Batang) 10pt, 제목 `맑은 고딕` — **글꼴을 파일에 내장하지 않고 이름만 지정**(Windows 기본 글꼴).
- 문제지: 제목(가운데), 성명/점수 줄, **2단 구성**(구역의 column: count 2, 구분선 separate). 문항 = 번호(굵게) + 문제 줄(stem 블록) → 예문(passage 블록) → 선지(라벨 + 내용, 걸친 들여쓰기). 순서는 반드시 stem → passage → choices.
- 정답지: 번호-정답 표(5쌍/행). 해설지: 번호, 정답, 해설 블록, 학습목표.
- 빈 번호 항목: "(출제 가능한 문제가 없어 비워 둔 번호입니다)" 점선 테두리 문단.
블록 변환(필수):
- 문단 run 서식: 밑줄(`underline`)·굵게·기울임·위첨자·아래첨자 **모두 보존**(밑줄은 법령 문제에서 중요). `\n` → 줄바꿈, `\t` → 탭.
- 이미지 → `ImageRun`(mime 에 따라 png/jpg/gif/bmp, 허용 외는 `[지원하지 않는 이미지]` 텍스트), 크기는 `widthPx/heightPx`(없으면 기본 200×150), **단 너비를 넘으면 비율을 유지하며 축소**(2단 기준 약 300px 상한). asset 없으면 `[이미지 없음]`.
- 표 → 테두리 있는 표(중첩 지원), 1×1 표(보기 상자)는 박스 모양 유지(테두리 + 안쪽 여백).
- 라벨(①~)은 확정본의 `label` 을 그대로 사용(내용에 번호를 섞지 않음).
테스트 + **출력 검증**:
- 생성한 docx 를 `jszip` 으로 열어 `word/document.xml` 을 파싱: (a) XML 이 well-formed, (b) 문단 텍스트를 순서대로 이어 붙이면 확정본의 번호·stem·passage·선지(라벨 포함)·정답·해설 텍스트와 일치(테스트용 `docxPlainText(bytes)` 헬퍼를 `tests/fixtures/extractText.ts` 에 만들어라), (c) 밑줄 run 수 = 확정본의 underline run 수, (d) 이미지 참조 수 = 확정본의 이미지 블록 수와 media 파일 존재, (e) 표 수 일치, (f) 문제지 구역에 2단 설정 존재.
- 파일명·충돌 처리, 빈 번호 항목, 다회차, combineParts 구조.

## 4B-5. src/modules/exporters/xlsx (라이브러리 `exceljs`)
`xlsxExporter: Exporter` id `'xlsx'`, extension 'xlsx'. 회차별 통합 문서의 시트 구성: `문제`(번호, 학습목표, 예문, 문제, 선지 ①…(최대 선지 수만큼 열), 정답), `정답표`(번호, 정답), `해설`(번호, 정답, 해설, 학습목표). `parts` 옵션에 따라 해당 시트만 포함, `combineParts: false` 면 파트별 파일.
- 글꼴 `맑은 고딕`, 머리글 행 굵게·배경색·고정(freeze), 열 너비·줄바꿈(wrap), 세로 위쪽 정렬, 빈 번호 행은 연한 회색 + "(비워 둔 번호)".
- 서식 보존: 셀 안 밑줄·굵게는 `richText` 로 유지. 표/박스는 텍스트로 평탄화(행은 줄바꿈, 열은 ` | `)하고 한계를 STAGE4B.md 에 기록. **이미지는 `workbook.addImage` 로 해당 문항의 예문 셀 근처에 삽입**하고 행 높이를 맞춘다(여러 이미지는 세로로 배치).
- 선지 라벨은 열 머리글이 아니라 **셀 값에 `①` 같은 라벨 + 내용**으로 넣을지 열 이름으로 할지 선택하되, 한 가지로 통일하고 이유를 문서화(권장: 열 머리글은 `①`~, 셀에는 내용만).
- 테스트 + **출력 검증**: 생성한 xlsx 를 `exceljs` 로 다시 읽어 (a) 시트 이름, (b) 각 행의 셀 텍스트가 확정본과 일치(`xlsxPlainText` 헬퍼를 `tests/fixtures/extractText.ts` 에), (c) richText 밑줄 보존, (d) 이미지 개수 일치, (e) 정답표의 정답이 확정본의 `answerLabels` 와 일치, (f) 빈 번호 행.

## 4B-6. 집계 `src/modules/exporters/index.ts`
`createExporters(deps?: { renderPdf?: PdfRenderer; fontFaceCss?: string }): Exporter[]` — docx, xlsx 는 항상, pdf 는 `renderPdf` 가 주어질 때만 포함. 테스트.

## 4B-7. 종단 출력 무결성 (가장 중요) — tests/e2e/export-integrity.test.ts
`tests/fixtures/examBank.ts`(4A 에서 만든 가짜 문제은행)로 `generateExams` 를 실제 조합해(시드 30개 이상) 스냅샷을 만들고, 각 스냅샷을 docx/xlsx/pdf(가짜 renderer 로 받은 html) 로 내보낸 뒤:
 1. 출력물에서 추출한 텍스트가 스냅샷 텍스트와 **번호별로 일치**(stem/passage/선지/정답/해설, 빈 번호 포함). 형식 간(docx ↔ xlsx ↔ pdf html)에서도 같은 문항의 같은 정답 라벨.
 2. 밑줄·이미지·표 개수 보존.
 3. 같은 스냅샷을 두 번 내보내면 텍스트 추출 결과가 같음(결정성). (zip 바이트 자체는 타임스탬프 때문에 다를 수 있으므로 비교 대상이 아님 — 가능하면 고정 날짜를 쓰도록 라이브러리 옵션을 사용하되, 안 되면 문서화.)
 4. **훼손 탐지 메타 테스트**: 스냅샷을 몰래 바꿔 내보낸 결과(지문 한 글자 변경, 정답 라벨 이동)를 원본 스냅샷과 비교하는 검사 함수(`assertExportMatchesSnapshot`)가 실패를 보고함.

## 마무리
- `docs/STAGE4B.md`: 사용법, 레이아웃, 한계(xlsx 표 평탄화 등), 한글 폰트 주의(PDF 는 앱이 번들 글꼴을 `fontFaceCss` 로 주입, docx 는 시스템 글꼴 이름만 지정), 앱 단계에서 해야 할 일(Electron printToPDF 연결).
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과. AGENTS.md 최종 보고 형식으로 보고(계약 변경 요청, 못 한 것 포함).
