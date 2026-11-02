# 이어서 할 일 (2026-10-29 퇴근 시점 인수인계)

설계는 `docs/ARCHITECTURE.md`, 화면은 `docs/DESIGN.md`, Codex 규칙은 `AGENTS.md`, 확정된 결정은 ARCHITECTURE §11.
단계별 결과/한계는 `docs/STAGE*.md`, Codex 에게 준 지시서는 `docs/prompts/`.

## 현재 상태 (2026-11-02)

| 단계 | 내용 | 상태 |
|---|---|---|
| 1~4B | 가져오기·검증기·규칙·선택·섞기·확정본·PDF/Word/Excel 출력 | 완료·검수 |
| 4C | 해설에 선지 번호가 있으면 선지 고정(실제 33문제), Word/HTML/Excel 레이아웃 | 완료·검수 (실제 Word·Excel 로 열어 확인) |
| 5A | Electron 앱 뼈대·홈·문제은행(보기)·캡처 모드·설치 파일 설정 | 완료·검수 |
| 5A2 | 화면 코드 구조 개편(화면·컴포넌트별 파일, CSS Modules, 화면 간 import 금지), 다크 대비 | 완료·검수 (실제 문제 DB 로 32개 화면 캡처) |
| 5B | 해석 규칙 공용화(layout-parser), 붙여넣기 해석, **가져오기 화면** | 진행 중 → 검수 필요 |
| 5C | 문제 추가·편집 화면(붙여넣기 자동 분리, 해설 따로 붙이기) | 예정 |
| 5D | 시험 만들기 마법사·출제 규칙 편집기·출제 이력·파일 저장(printToPDF) | 예정 |
| 5E | 설정(백업·복원)·자동 업데이트·설치 파일·깨끗한 PC 시험 | 예정 |

## 다음 세션 순서

### 1. 5B 검수
- `npm test`(전체 약 1분 30초), `npm run typecheck`, `npm run lint:deps`, `npm run format:check`, `npm run build`.
- **기존 docx 테스트 기대값이 바뀌지 않았는지**(layout-parser 리팩터링이 동작을 바꾸지 않았다는 증거): `git diff` 로 `src/modules/importers/docx/*.test.ts` 확인.
- 실제 문서로: `.tmp-realcheck/run.ts`(법규 228·해부 86 그대로인지), 그리고 캡처 확장(`QB_CAPTURE_IMPORT_FILES`)으로 가져오기 검수 표 화면 확인.

### 2. 5C → 5D → 5E (지시서는 `docs/prompts/` 에 단계별로 작성)

### 3. 한글(HWPX) 저장 스파이크 (5단계 이후)
- 후보: kordoc(`markdownToHwpx`), airmang/hwpx-plugins. 이미지·밑줄·표 보존과 Windows 한글에서 열림 확인. 통과하면 `exporters/hwpx` 플러그인.
- MCP/플러그인 설치는 자동 권한 검사에 막혔다. 사용자가 직접 실행: `claude mcp add kordoc --scope local -e KORDOC_ROOT="D:\프로그램 문제은행" -e KORDOC_OFFLINE=1 -- cmd /c npx -y kordoc mcp`

## 열린 질문 / 알려진 사항

- **법규 3단원은 매 회 1문제가 빈 번호**(중단원 4개뿐, "반드시 서로 다르게" 규칙). 싫으면 3단원만 '가능하면' 모드(`distinct-by-segment` mode `prefer`)나 4문제로.
- 해부에는 1단원 문제가 없음(슬롯 ①은 2단원에서만 뽑힘).
- 규칙 문서의 "첫째·둘째 번호가 안 겹치도록"을 "슬롯(대단원) 안에서 중단원이 서로 다르게"로 해석함(규칙 편집 화면에서 바꿀 수 있게).
- 은행에 이미 있는 문제와 새로 가져오는 문제의 **지문 중복 판정은 앱 단계**에서 `questionContentKey` 로 구현해야 함(가져오기 모듈은 한 문서 안에서만 판정).
- `PassageGroup`(여러 문항이 공용 지문 공유)의 렌더링은 미지원(현재 데이터에 없음).
- `exceljs` 의 uuid 취약점 경고 2건: 이 프로그램의 사용 방식과 무관, `--force` 로 고치지 말 것(exceljs 가 구버전으로 내려감).
- 정답 위치 최소 10% 보장(3b-7)은 구현·테스트됨. 균등 분포가 아님을 사용자가 허용함.

## 작업 방법 메모 (다음 세션의 나에게)

- **Codex 실행법**: 지시서를 파일로 저장한 뒤 *그 명령 자체를 백그라운드 작업으로* 실행. `codex exec -s workspace-write -C "<프로젝트>" - < 지시서.md > 출력.out`. 쉘에서 `&` 로 띄우고 쉘이 끝나면 Codex 도 죽는다(두 번 겪음). 완료 알림이 오면 검수.
- 지시서는 heredoc 대신 Write 도구로 저장(따옴표 문제로 한 번 실패). Codex 는 `npm.cmd`/`npx.cmd` 사용(PowerShell 의 npm.ps1 차단), 한글 문서는 `Get-Content -Encoding UTF8` 로 읽게 한다.
- **검수 원칙**: Codex 보고를 믿지 않고 직접 typecheck/lint:deps/test + 금지 API grep + 코드 읽기 + **실제 문제 파일로 실행**(`.tmp-realcheck/*.ts`, 로컬 전용·gitignore). 이 방식으로 가져오기 패턴 누락(49문제), 자동번호 선지 누락, 선택기 42초 지연, 시험지 다크 배경·순서 오류를 잡았다.
- 실행: `node node_modules/vite-node/vite-node.mjs .tmp-realcheck/<파일>.ts <출력경로>`. 시험지 화면 확인은 Edge 헤드리스 `--screenshot`(PDF 렌더링 도구 없음).
- 문제 데이터(`문제 디비/`, `규칙.docx`)는 절대 커밋하지 않는다(`.gitignore` 가 `*.docx *.pdf *.xlsx *.hwp *.db` 등을 막음).
- 내가 직접 설치/종료하려던 외부 도구(MCP, 플러그인, 프로세스 kill, GitHub 저장소 생성)는 자동 권한 검사에 막힐 수 있다. 막히면 우회하지 말고 사용자에게 명령을 안내.
- **앱 캡처(화면 검수)**: Codex 샌드박스에서는 Electron 이 안 뜬다(AppContainer ACL). 캡처는 내가 한다: `.tmp-realcheck/seed-real.ts <새 폴더>` 로 실제 문제 DB 를 만들고 `QB_DATA_DIR`·`QB_CAPTURE_DIR` 로 `npm run capture`. 쉘에 `ELECTRON_RUN_AS_NODE=1` 이 있으면 Electron 을 직접 띄울 때 `env -u ELECTRON_RUN_AS_NODE` 필요. PC 화면이 잠겨 있으면 rAF 가 멈춰 캡처가 멈춘다(5B 에서 캡처 모드가 스스로 옵션을 켜게 고침). 이전 Electron 이 남아 있으면 단일 실행 잠금 때문에 새 인스턴스가 바로 종료된다.
- 원격 디버깅으로 화면 상태 보기: `--remote-debugging-port=9230` 으로 띄우고 `.tmp-realcheck/cdp-eval.mjs`·`cdp-pause.mjs`.
- 실제 Word/Excel 검수: `.tmp-realcheck/export.ts` 로 파일 생성 → `office2png.ps1` (Word/Excel COM 으로 PDF → Windows.Data.Pdf 로 PNG).
- Codex 가 코드를 한 줄로 압축하는 경향 → Prettier(`format:check`)와 파일 분리 규칙을 AGENTS.md 에 넣어 막았다. 검수 때 긴 줄·큰 파일을 확인할 것.
