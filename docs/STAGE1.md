# 1단계 구현 안내

`src/contracts/index.ts`는 수정하지 않는다. 공개 함수와 타입은 각 모듈의 `index.ts`에서 가져온다.

## 실행 환경과 검사

CommonJS를 유지한다. Electron 메인 프로세스와 `better-sqlite3`의 CommonJS 연동이 간단하며, TypeScript 소스의 import/export와 Vitest 테스트도 사용할 수 있다. `package.json`에 `type: module`을 추가하지 않는다. TypeScript는 strict 모드이며 경로 별칭을 사용하지 않는다.

온라인 `npm install`은 레지스트리 접근 시 `EACCES`로 실패했고, 로컬 npm 캐시를 사용한 오프라인 설치는 성공했다. 의존성 버전은 `package-lock.json`으로 고정한다. PowerShell에서는 실행 정책에 막히는 `npm.ps1` 대신 아래 명령을 사용한다.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint:deps
```

현재 Windows / Node 22.20.0 환경에서는 dependency-cruiser 16.10.4가 CJS 내부 `#...` import를 해석하지 못한다. `.dependency-cruiser-runner.cjs`가 해당 패키지의 `imports` 매핑만 Node의 동기 resolve hook으로 보완한 뒤 원래 CLI를 실행한다. `node_modules`는 수정하지 않는다. 이 실행기는 `registerHooks`를 제공하는 Node 22.15 이상 환경을 전제로 한다.

의존 규칙은 아키텍처 §3의 모듈별 허용 목록과 공개 `index.ts` 경계를 검사한다. 플러그인 폴더를 자동 탐색하므로 같은 계층 플러그인 간 참조도 차단한다. `render-html`과 출력기의 해당 모듈 참조는 설정에만 반영했으며 모듈은 아직 만들지 않았다. 임시 출력기에서 저장소를 import했을 때 `exporters-no-storage` 및 폴더 경계 규칙으로 오류 2개와 종료 코드 1을 확인했다. 임시 파일을 삭제한 후에는 종료 코드 0으로 통과했다.

## SQLite 저장소

```typescript
import { openStorage } from '../src/modules/storage/index';
import type { Migration } from '../src/modules/storage/index';

const nextMigration: Migration = {
  version: 2,
  up(db) {
    db.exec('CREATE TABLE example_extension (id TEXT PRIMARY KEY)');
  },
};

const storage = openStorage(':memory:', { migrations: [nextMigration] });
storage.close();
```

`Migration`은 `version: number`, 동기 함수 `up(db): void`로 구성한다. 사용자 지정 `migrations`는 기본 목록에 추가된다. 버전은 기본 마이그레이션 이후부터 누락 없이 지정한다. 목록 순서는 버전으로 정렬된다. 버전 누락·중복 및 프로그램보다 높은 DB 버전은 거부한다. 대기 중인 모든 마이그레이션과 `user_version` 갱신을 하나의 트랜잭션으로 실행한다.

기존 사용자 테이블에 데이터가 있고 적용할 마이그레이션이 있을 때만, 변경 직전에 `beforeMigrate({ fromVersion, toVersion })`를 한 번 호출한다. 앱은 이 콜백에 백업을 연결한다. 콜백이 실패하면 마이그레이션을 진행하지 않는다. 초기 DB 생성과 변경 없는 재오픈에는 콜백을 호출하지 않는다.

파일 DB는 WAL 모드를 사용한다. SQLite의 메모리 DB는 WAL을 지원하지 않으므로 `:memory:`는 SQLite 기본 메모리 저널을 사용한다. 모든 연결에서 외래 키 검사를 활성화한다. 과거 이력은 문제 삭제 후에도 유지한다.

문제 원본 전체는 JSON으로 보존하고 검색용 컬럼만 별도로 관리한다. 검색 텍스트에는 지문·본문·선지·해설·학습목표·출처·태그가 포함된다. `text`는 부분 문자열, `objectivePrefix`는 접두어이며 `%`, `_`, `\`도 리터럴로 검색한다. `hasObjective`는 누락·빈 문자열·공백뿐인 코드를 목표 없음으로 처리한다. 문제 조회는 ID 순으로 정렬한다. `count`는 필터에 맞는 전체 개수이며 `limit`/`offset`을 적용하지 않는다.

이력은 `createdAt` 내림차순, 같은 시각이면 시험 ID 오름차순이다. 최근 N개 시험을 먼저 고른 후 과목을 문제 테이블과 조인해 필터링한다. 과목을 지정한 조회에서는 삭제된 문제의 과목을 판별할 수 없으므로 제외한다.

내용 블록의 이미지는 일반 텍스트 변환 시 `[이미지]`로 표현한다. 자산 ID는 중첩 표까지 순회해 처음 등장한 순서로 중복 없이 반환한다. 정규화는 빈 문단의 개수를 보존하고, 문단 끝 공백만 정리하며 밑줄 등의 서식은 유지한다.
