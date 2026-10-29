# AGENTS.md — 작업 규칙 (Codex 는 반드시 따를 것)

프로젝트: 출판사 모의고사 문제은행 (Electron + TypeScript). 설계 문서: `docs/ARCHITECTURE.md`. 계약: `src/contracts/index.ts`.
사용자 화면과 메시지는 **한국어**, 코드/식별자는 영어.

## 절대 규칙

1. **`src/contracts/index.ts` 를 수정하지 않는다.** 바꿔야 할 것 같으면 수정하지 말고 최종 보고에 "계약 변경 요청"으로 적는다. (검수자가 결정한다.)
2. **모듈 의존 규칙**(ARCHITECTURE.md §3)을 지킨다. 다른 모듈의 내부 파일을 import 하지 않는다. 공유는 `contracts` 로만.
3. **`exporters/*` 는 storage 를 import 하지 않는다.**
4. 순수 모듈(importers, validators, rules, constraints, selector, shuffler, exam-snapshot, generation, exporters, history)에서
   `Math.random()`, `Date.now()`, `new Date()` 를 직접 쓰지 않는다. 난수는 `Rng`, 시각은 인자로 주입받는다.
5. **문제 데이터 파일(`문제 디비/`, `규칙.docx`, 모든 `*.docx` `*.hwp`)을 읽거나 복사하거나 커밋하지 않는다.**
   테스트는 코드로 만든 가짜 문제(`tests/fixtures`)만 쓴다. 실제 문제 내용을 코드/테스트/로그에 넣지 않는다.
6. 네트워크 접근은 `updater` 모듈에서만.
7. 선지 번호(①~⑤)를 `Choice.content` 에 저장하지 않는다. 출력할 때 위치로 붙인다.
8. git commit/push 는 하지 않는다. 파일만 만든다.

## UI 작업 시

`docs/DESIGN.md` 의 토큰·레이아웃·화면 설계를 따른다. 임의의 색/간격/폰트를 만들지 않고 `tokens.css` 변수만 쓴다.
빈 상태·오류·로딩 상태, 키보드 접근, 다크 모드를 빠뜨리지 않는다. 미리보기는 반드시 `render-html` 모듈을 쓴다.

## 품질 기준

- TypeScript `strict`. `any` 금지(불가피하면 이유 주석).
- 모듈마다 자기 폴더 안에 `*.test.ts` 를 둔다(vitest). 경계 조건과 실패 경로를 포함한다.
- 공개 함수는 `index.ts` 로만 export. 모듈 외부는 `index.ts` 만 import 한다.
- 에러 메시지·진단 메시지는 사용자에게 보일 수 있으므로 한국어로, 무엇이 문제이고 어떻게 고치는지 쓴다.
- 주석은 "왜"만 적는다. 자명한 주석을 달지 않는다.

## 명령

- `npm test` — 전체 테스트
- `npm run lint:deps` — 의존 규칙 검사 (dependency-cruiser)
- `npm run typecheck` — tsc --noEmit
- 작업 완료 전에 위 3개를 모두 통과시킨다.

## 최종 보고 형식 (마지막 메시지)

1. 만든/수정한 파일 목록
2. 실행한 명령과 결과(통과/실패 그대로)
3. 하지 못한 것, 막힌 것, 가정한 것
4. 계약 변경 요청(있으면)
