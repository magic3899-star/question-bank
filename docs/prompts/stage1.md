## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 파일을 실제로 만들고, 테스트를 실제로 돌리고, 통과할 때까지 고친 뒤에만 최종 보고하라. 중간에 사용자에게 묻지 마라.
- 의존성은 이미 설치됨(node_modules, package.json 존재: better-sqlite3, typescript, vitest, dependency-cruiser, @types/*). 네트워크가 필요한 설치는 하지 마라. 필요한 패키지가 더 있으면 보고서에 적어라.
- 이 PC 의 PowerShell 에서는 `npm.ps1` 실행이 차단돼 있다. **`npm.cmd`, `npx.cmd`** 를 써라 (또는 node 로 직접 실행: `node node_modules/vitest/vitest.mjs run`).
- package.json 은 이미 있다. scripts(test/typecheck/lint:deps)와 설정 파일만 추가·수정하라.
- ARCHITECTURE.md §3 에 `render-html` 모듈이 추가됐다. 의존 규칙 설정(.dependency-cruiser.cjs)에 render-html 과 `exporters/* → render-html 허용`도 반영하라. (모듈 자체는 이번 단계에서 만들지 않는다.)

- 이 프로젝트의 문서와 소스는 UTF-8 이다. PowerShell 로 읽을 때 반드시 `Get-Content -Encoding UTF8 <파일>` 을 써라(안 쓰면 한글이 깨져 보인다). 파일을 쓸 때도 UTF-8(BOM 없음)로 저장하라.

먼저 AGENTS.md, docs/ARCHITECTURE.md, src/contracts/index.ts 를 읽고 규칙을 따라라. 이것은 1단계 작업이다.

## 1-A. 프로젝트 뼈대
- package.json (name: question-bank, private, "type": "module" 은 쓰지 말고 CommonJS/ESM 중 vitest·Electron 모두에 무난한 쪽 선택 후 이유를 보고).
- tsconfig (strict, paths 로 `@contracts/*` 같은 별칭은 쓰지 말고 상대 경로 사용), vitest 설정.
- 의존성: better-sqlite3, typescript, vitest, dependency-cruiser, @types/node, @types/better-sqlite3. (npm install 이 네트워크로 막히면 시도 결과를 보고하고 가능한 데까지 진행)
- `.dependency-cruiser.cjs`: ARCHITECTURE.md §3 의 의존 규칙을 그대로 구현. 폴더 기준 forbidden 규칙.
  특히 exporters/* → storage 금지, 같은 계층 플러그인끼리 import 금지, contracts 는 아무것도 import 금지, updater 는 아무것도 import 금지.
- scripts: test, typecheck, lint:deps (src 와 tests 대상).
- 위반 import 를 임시로 하나 만들어 lint:deps 가 실제로 실패하는지 확인한 뒤 그 파일을 지워라. 확인 결과를 보고에 적어라.

## 1-B. tests/fixtures/builders.ts
테스트용 가짜 데이터 빌더(다른 모듈 테스트가 재사용): `makeQuestion(overrides)`, `makeChoice`, `para(text, style?)`, `makeRuleSet(overrides)`, `makeHistoryEntry`. 내용은 "가짜 문제 1" 같은 더미 한국어 문장. 실제 문제 내용 금지.

## 1-C. src/modules/rng
`createRng(seed: string): Rng` (contracts 의 Rng 구현). 문자열 시드 해시(xmur3 류) + sfc32 또는 mulberry32. fork(label)은 `seed + '/' + label` 로 독립 열. 
테스트: 같은 시드 같은 열, 다른 시드 다른 열, int(n) 범위, fork 독립성, 1만 번 int(5) 분포가 대략 균등(각 구간 허용오차 명시).
섞기 유틸 `shuffleInPlace<T>(arr: T[], rng: Rng): T[]` (Fisher-Yates, 복사본 반환하는 `shuffled` 도) 도 여기 export.

## 1-D. src/modules/content-model
- `blocksToPlainText(blocks: Block[]): string` (표는 셀을 탭/줄바꿈으로, 이미지는 빈 문자열 또는 [이미지])
- `normalizeBlocks(blocks): Block[]` (같은 서식의 인접 run 병합, 빈 run 제거, 문단 끝 공백 정리. 의미가 같으면 같은 결과가 되도록)
- `hashBlocks(blocks): string` (정규화 후 canonical JSON(키 정렬)의 sha256 hex)
- `collectAssetIds(blocks): string[]` (표 안 중첩 포함)
- `blocksEqual(a,b): boolean` (정규화 후 비교)
- `isEmptyBlocks`
테스트 포함: 중첩 표, 서식 보존(밑줄 유지), 정규화 멱등성(normalize(normalize(x)) == normalize(x)).

## 1-E. src/core/registry
`createRegistry(): PluginRegistry`. 같은 kind+id 중복 등록은 한국어 메시지로 throw. all/get 구현. 테스트 포함.

## 1-F. src/modules/storage
`openStorage(dbPath: string, opts?: { migrations?: Migration[]; beforeMigrate?: (info:{fromVersion:number;toVersion:number}) => void }): Storage`
Storage = { questions: QuestionRepository; assets: AssetRepository; passageGroups: PassageGroupRepository; ruleSets: RuleSetRepository; history: HistoryRepository; snapshots: SnapshotRepository; close(): void; schemaVersion(): number }
(Migration, Storage 타입은 storage 모듈 안에서 정의/export. contracts 는 수정 금지.)
- better-sqlite3, `:memory:` 지원, WAL 모드, foreign_keys on.
- 마이그레이션: `src/modules/storage/migrations/001-init.ts` 등 번호 파일. PRAGMA user_version 으로 버전 관리. 
  이미 데이터가 있는 DB 에 새 마이그레이션을 적용하기 직전 `beforeMigrate` 콜백 호출(앱이 백업을 꽂는 자리). 마이그레이션은 트랜잭션, 실패 시 롤백하고 한국어 에러.
- 테이블: questions(id PK, subject, type, objective_code, passage_group_id, source_tag, search_text, body_json, created_at, updated_at, 인덱스), assets, passage_groups, rule_sets, history_entries, history_questions, snapshots.
  Question 전체는 body_json 에 JSON 으로 저장하고 검색용 컬럼만 따로 둔다 → 필드가 늘어도 마이그레이션 없이 확장 가능하게.
- QuestionQuery 의 모든 필드 지원(text 는 search_text LIKE, hasObjective 포함, limit/offset). 
- HistoryRepository.recentQuestionIds(lastNExams, subject?): 최근 N개 시험에 쓰인 문제 ID 집합, subject 는 questions 테이블 조인으로 필터.
- 테스트: CRUD 왕복(블록·밑줄 서식·표 보존), 쿼리 필터, 마이그레이션 적용/재오픈 시 데이터 보존, 가짜 v2 마이그레이션 추가 시 beforeMigrate 호출 및 데이터 보존, 마이그레이션 실패 시 롤백.
- 파일 DB 는 os.tmpdir() 아래 임시 경로를 쓰고 테스트 후 정리.

끝나면 AGENTS.md 의 최종 보고 형식으로 보고하라.
