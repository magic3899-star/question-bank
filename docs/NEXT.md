# 이어서 할 일 (2026-10-29 퇴근 시점 인수인계)

설계는 `docs/ARCHITECTURE.md`, 화면은 `docs/DESIGN.md`, Codex 규칙은 `AGENTS.md`, 확정된 결정은 ARCHITECTURE §11.
단계별 결과/한계는 `docs/STAGE*.md`, Codex 에게 준 지시서는 `docs/prompts/`.

## 현재 상태

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 뼈대, rng, content-model, registry, storage(SQLite) | 완료·검수 |
| 2 / 2b | Word 가져오기, 검증기 9종, 자동번호·학습목표 줄 보완 | 완료·검수 (실제 문서 343문제 확인) |
| 3 / 3b / 3c | 규칙 엔진, 선택기, 섞기, 불변조건 테스트, 확정 규칙 반영, 중단원 엄격 | 완료·검수 (테스트 251) |
| 4A | exam-snapshot, generation, render-html, 종단 무결성 테스트 | 완료·검수 (테스트 301) |
| 4B | PDF·Word·Excel 출력기 + render-html 수정 2건 + 출력 무결성 테스트 | 완료·검수 (테스트 328, 흰 종이·문항 순서는 실제 문제로 확인) |
| 5 | Electron 앱·화면·백업·업데이트·설치 파일 | 미착수 |

## 다음 세션 순서

### 1. 실제 문제로 Word·Excel 파일 열어 보기 (먼저, 짧게)
- 4B 는 자동 검사(출력 텍스트 = 확정본, 밑줄·이미지·표 개수, 훼손 탐지)까지 통과했고, 흰 종이·문항 순서는 실제 문제 화면으로 확인했다.
- 남은 확인: `.tmp-realcheck/render.ts` 를 본떠 실제 문제로 **docx/xlsx 파일을 만들어 Word·Excel 에서 직접 열기** — 2단 구성, 밑줄, 해부 이미지 크기, 보기 박스, 정답표, 엑셀 행 높이·이미지 위치. 한계는 `docs/STAGE4B.md`.
- 시작 전 `npm test`, `npm run typecheck`, `npm run lint:deps` 로 상태 확인.

### 2. 5단계 — 앱과 화면 (`docs/DESIGN.md` 기준)
- Electron + React(Vite) 뼈대, IPC, 모듈 조립(composition root = `src/app`). 문제 DB 위치 `%APPDATA%/<앱>/data/bank.sqlite`.
- 화면: 홈 / 문제은행 / 가져오기(검수 표) / **문제 추가** / 시험 만들기(마법사) / 출제 규칙 편집기 / 출제 이력 / 설정.
- PDF: Electron `printToPDF` 를 `createPdfExporter` 의 `PdfRenderer` 로 주입. 폰트 번들(Pretendard, Noto Serif KR/Sans KR)을 `fontFaceCss`(data URI)로 전달.
- **백업 모듈**: DB 가 WAL 모드이므로 체크포인트 후 복사. `openStorage` 의 `beforeMigrate` 에 연결.
- **updater + 배포**: electron-updater + GitHub Releases, electron-builder(NSIS) 설치 파일, GitHub Actions 빌드(**Node ≥ 22.15** — `.dependency-cruiser-runner.cjs` 요구). 서명 없이 시작(SmartScreen 경고 안내문 필요).
- 깨끗한 PC 에서 설치→문제 추가→시험 만들기→PDF/Word/Excel 저장→업데이트 확인 전체 흐름 검증.
- UI 검수: 만든 쪽과 분리된 독립 비평 방식(참고 자료 폴더의 `skills/design-ui/ai-design-director/agents/design-critic.md` — 경로는 로컬 메모에 있음), 화면 스크린샷을 DESIGN.md 와 대조.

### 3. 문제 추가 기능 (담당 이사 요청, ARCHITECTURE §11-1)
- 한 문제씩 입력하는 편집기 + **PDF 에서 복사한 글자 붙여넣기 → 번호·선지 자동 분리**(작은 순수 모듈 `paste-parser` 로 분리해 테스트) + 이미지 추가 + 해설 따로 붙이기.
- 저장 전 검증기 실행, 같은 지문(`questionContentKey`)이 이미 있으면 경고.
- **사용자에게 확인할 것**: 문제집 문제에 학습목표 코드가 있는가? 없으면 추가 시 단원만 골라 지정하는 방식.

### 4. 한글(HWPX) 저장 스파이크 (4B·5단계 이후)
- 후보: kordoc(`markdownToHwpx`), airmang/hwpx-plugins. 이미지·밑줄·표 보존과 **Windows 한글에서 열림**을 확인. 통과하면 `exporters/hwpx` 플러그인으로 추가.
- MCP/플러그인 설치는 자동 권한 검사에 막혔다. 사용자가 직접 실행: `claude mcp add kordoc --scope local -e KORDOC_ROOT="D:\프로그램\1 문제은행" -e KORDOC_OFFLINE=1 -- cmd /c npx -y kordoc mcp`

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
- 내가 직접 설치/종료하려던 외부 도구(MCP, 플러그인, 프로세스 kill)는 자동 권한 검사에 막힐 수 있다. 막히면 우회하지 말고 사용자에게 명령을 안내.
