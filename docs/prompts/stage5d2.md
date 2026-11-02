## 5D2단계: 파일 저장(PDF·Word·Excel) + 출제 이력 + 홈 최근 시험

5D1 의 시험 만들기 결과(확정본)를 **실제 파일로 저장**하고, 출제 이력으로 남겨 다시 보고·다시 저장할 수 있게 한다.

## 실행 방식
- 계획만 말하고 멈추지 마라. 구현하고 검사를 통과시킨 뒤에만 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md(§4·§7·§8-1), docs/DESIGN.md(§4.4 5단계 저장·§4.6 출제 이력), src/contracts/index.ts(**검수자가 `HistoryRepository.delete`, `SnapshotRepository.delete` 를 추가했다 — 다시 읽어라**), docs/STAGE4B.md·STAGE4C.md·STAGE5D1.md, `src/modules/exporters/**`, `src/modules/storage/**`, `src/app/**` 를 `Get-Content -Encoding UTF8` 로 읽어라. 계약 추가 수정 금지. 실제 문제 파일·`.tmp-realcheck/` 접근 금지. 네트워크 설치 금지. Electron 실행·캡처 금지(검수자가 함).
- 마무리 전 `npm.cmd test`(전체), `typecheck`, `lint:deps`, `format`→`format:check`, `build` 모두 통과.

## 5D2-1. storage: 이력·확정본 삭제
계약에 추가된 `history.delete(examIds)`, `snapshots.delete(examIds)` 구현(history_questions 도 함께, 트랜잭션). 테스트(삭제 후 recentQuestionIds 반영).

## 5D2-2. PDF 인쇄기 (main, `src/app/main/pdf-renderer.ts`)
`createPdfExporter` 에 주입할 `PdfRenderer` 구현:
- 숨은 BrowserWindow(show: false, sandbox, contextIsolation, nodeIntegration false, 외부 탐색 차단). HTML 은 앱 임시 폴더(`app.getPath('temp')/QuestionBank/print-<uuid>.html`)에 써서 `loadFile`(큰 이미지 data URI 때문에 data URL 대신 파일), `did-finish-load` 후 `document.fonts.ready` 대기.
- `webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: page.pageNumbers, headerTemplate: '<div></div>', footerTemplate: 쪽 번호 "n / 전체" 가운데 작은 글씨 })`. 
- 끝나면 창 닫고 임시 파일 삭제(실패해도 다음 인쇄에 지장 없게). 여러 요청은 **순서대로**(동시에 창 여러 개 금지). 시간 제한(30초) 초과 시 한국어 오류.
- 단위 테스트는 Electron 없이 가능한 부분(큐 순서·임시 파일 이름·오류 감싸기)을 의존성 주입으로.

## 5D2-3. 저장 서비스·IPC (`services/export.ts`)
- `exam.export({ source: { sessionId } | { historyExamIds: string[] }, examIndexes?, formats: ('pdf'|'docx'|'xlsx')[], parts: ExportPart[], combineParts, folder? })`:
  폴더가 없으면 폴더 선택 대화상자(기본값: 설정의 `defaultSaveDir`, 없으면 문서 폴더) → `createExporters({ renderPdf })` 로 형식별 출력 → 파일 쓰기(같은 이름이 있으면 `-2`, `-3`… **덮어쓰지 않음**) → 진행 이벤트(`exam.exportProgress`: 현재 파일·완료 수/전체) → `{ folder, files: [{ path, format, part, examTitle }] }`. 마지막으로 쓴 폴더를 `defaultSaveDir` 로 기억.
- **출제 이력 기록**: 세션에서 처음 저장할 때 저장한 회차들의 확정본을 `snapshots.save`, `history.record`(회차별: 제목·시드·규칙·문제 ID — 빈 번호 제외)로 기록. 같은 세션을 다시 저장해도 중복 기록하지 않음(이미 기록된 회차는 건너뜀). 저장 후 그 회차의 문제를 바꾸면 새 확정본이므로 다음 저장 때 새 이력으로 기록(이전 이력은 그대로) — 이 규칙을 문서화.
- `app.openPath(path)`(파일·폴더 열기, 저장 결과 목록의 경로만 허용 — 임의 경로 실행 금지), `history.list({ limit, offset })`(이력 + 확정본 요약: 제목·일시·과목·규칙 이름·시드·문항 수·빈 번호 수), `history.get(examId)`(확정본), `history.delete(examIds)`.
- 서비스 테스트(가짜 PdfRenderer, 임시 폴더): 형식·파트·합치기 조합별 파일 수와 이름, 덮어쓰지 않음, 이력 1회 기록·재저장 시 중복 없음·교체 후 새 이력, 이력에서 다시 저장(`historyExamIds`), 삭제, 열기 허용 범위, 잘못된 입력 한국어 오류.

## 5D2-4. 화면
 a. **시험 만들기 5단계 "저장"**(마법사 마지막 단계 활성화): 형식 체크(PDF·Word·Excel), 파트 체크(문제지·정답지·해설지), "파트를 한 파일로 합치기", 회차 선택(전체/일부 체크), 저장 폴더(현재 경로 + "바꾸기"), 만들어질 **파일 이름 미리보기 목록**, 빈 번호가 있으면 경고 문구, [저장] → 진행 막대(현재 파일 이름) → 결과 목록(파일마다 "열기") + "폴더 열기" + "출제 이력에서 보기".
 b. **출제 이력 화면** `screens/history/`(DESIGN.md §4.6): 표(제목, 만든 날짜, 과목, 규칙, 다시 만들기 번호(시드), 문항 수, 빈 번호) + 검색/과목 필터 + 페이지. 행 선택 → 오른쪽 상세: 확정본 미리보기(A4 종이, 문제지/정답지/해설지 탭 — 5D1 미리보기 컴포넌트 재사용), [다시 저장](같은 저장 옵션 대화상자), [같은 번호로 다시 만들기](시험 만들기로 이동, 규칙·시드 채움 — "문제은행이 바뀌었다면 결과가 달라질 수 있습니다" 안내), [이력에서 삭제](확인 대화상자: "최근 N회 제외 규칙에 영향이 있습니다"). 빈 상태("아직 만든 시험이 없습니다" + 시험 만들기 버튼).
 c. **홈 "최근 시험"**: 최근 5개(제목·날짜·문항 수) → 누르면 출제 이력 상세로.

## 5D2-5. 검수용 캡처 (실제 PDF 인쇄 검증 포함)
캡처 모드에서 `QB_CAPTURE_GENERATE_RULE` 과 함께 `QB_CAPTURE_EXPORT_DIR` 가 있으면: 생성 결과를 **실제로 저장**(PDF·Word·Excel, 문제지·정답지·해설지 나누기, 1회차만, 지정 폴더 — 진짜 `printToPDF` 사용) → 저장 결과 화면을 `generate-saved-{theme}-{size}.png` 로 캡처 → 'history' 와 'home' 라우트는 이 이력이 있는 상태로 캡처. 저장한 파일 목록을 `capture-report.json` 에 함께 기록.

## 5D2-6. 문서
`docs/STAGE5D2.md`: PDF 인쇄 방식, 저장·이력 규칙(언제 기록되는지), IPC, 화면 흐름, 한계. AGENTS.md 최종 보고 형식(계약 변경 요청 포함).
