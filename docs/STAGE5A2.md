# 5A2단계 — 화면 격리와 검수 수정

5A의 화면·동작을 유지하면서 renderer를 화면·컴포넌트·훅 단위로 분리했다. 검수에서 요청한 대비·목록 정렬·미리보기 로딩·사이드바·dist 스크립트 수정도 적용했다. `src/contracts/index.ts`는 변경하지 않았다.

## 폴더 구조

```text
src/app/
  shared/
    index.ts                 공개 진입점
    api.ts                   기존 IPC 계약
    routes.ts                단일 라우트 메타데이터 표와 파생 ID 목록
  renderer/
    main.tsx                 루트 렌더·전역 CSS import만
    app/
      App.tsx                초기 IPC·테마 저장·앱 셸
      routes.ts              공통 표에 아이콘·화면 컴포넌트 자동 연결
      router.ts              해시 해석·이동
      Sidebar.tsx            메뉴·접기·버전
      PageHeader.tsx         제목·설명·주 행동
      theme.ts               시스템·수동·검수 테마 적용
      shortcuts.ts           전역 단축키
    screens/
      home/                  HomeScreen
      bank/                  BankScreen·useBankData·ObjectiveTree·TreeNodes
                             QuestionList·QuestionPreview·PreviewFrame·PreviewPlaceholder
      settings/              SettingsScreen
      coming-soon/           ComingSoonScreen
    components/              Button·Input·SearchInput·Badge·Card·EmptyState·ErrorState
                             Spinner·Skeleton·Toast·Dialog·Tabs·Tooltip, index.ts
    hooks/                   useApi·useReadySignal, index.ts
    lib/                     unwrap·afterTwoFrames·navigate·ScreenProps, index.ts
    styles/
      tokens.css             변수 선언만
      base.css               폰트·리셋·입력 기본값·포커스·테마 color-scheme
```

화면·컴포넌트 CSS는 해당 TSX 옆의 동명 `*.module.css`다. 셸·사이드바·페이지 헤더도 각각 CSS Module을 사용한다. 이전의 `styles/app.css`와 `components/index.tsx`는 제거했다. 각 파일은 약 300줄 이내다.

## 새 화면 추가 방법

1. **공통 라우트 표 `src/app/shared/routes.ts`에 항목 한 줄**을 추가한다. `id`는 화면 폴더 이름과 같게 하고, 제목·설명은 한국어로 작성한다. `icon`은 기존 표의 아이콘 이름을 사용할 수 있다.
2. `src/app/renderer/screens/<id>/`에 화면 TSX, 동명 CSS Module, 공개 `index.ts`를 만든다. `index.ts`에서 화면 컴포넌트를 `Screen` 이름으로 내보낸다.

예시:

```ts
// src/app/shared/routes.ts의 routes 배열
{ id: 'sample', title: '예시', icon: 'Library', description: '예시 화면을 확인하세요.' },
```

```tsx
// screens/sample/SampleScreen.tsx
import type { ScreenProps } from '../../lib/index';
import { useReadySignal } from '../../hooks/index';
import styles from './SampleScreen.module.css';

export function SampleScreen({ route }: ScreenProps) {
  useReadySignal(route.id, false);
  return <div className={styles.screen}>예시 화면</div>;
}
```

```ts
// screens/sample/index.ts
export { SampleScreen, SampleScreen as Screen } from './SampleScreen';
```

renderer의 `app/routes.ts`는 `import.meta.glob('../screens/*/index.ts', { eager: true })`로 화면을 자동 연결한다. 사이드바와 App은 이 연결 결과를, 해시 라우터와 main 캡처는 공통 표의 파생 `routeIds`를 읽는다. Electron 시작 전 실패 보고서를 쓰는 `scripts/capture.cjs`도 `scripts/route-ids.cjs`를 통해 같은 표를 읽는다(기존 TypeScript만 사용, 설치 없음). 따라서 새 화면을 추가할 때 사이드바·라우터·캡처 코드를 수정하지 않는다. main이 renderer를 import하지도 않는다. 화면 구현이 없는 기존 후속 단계 항목은 공용 준비 중 화면으로 연결된다.

공통 표를 shared에 두는 이유는 main과 renderer가 같은 목록을 사용하면서 브라우저 코드를 main에 끌어오지 않게 하기 위해서다. 새 아이콘 종류가 필요할 때만 renderer `app/routes.ts`의 아이콘 맵도 확장한다. 화면 준비 신호는 데이터·미리보기 준비가 끝난 뒤 `useReadySignal`로 설정한다.

## 화면 격리 규칙

- `screens/<a>/`는 다른 `screens/<b>/`를 import할 수 없다. 해당 화면 폴더 안의 컴포넌트와 훅만 직접 참조한다.
- 화면끼리 공유할 UI는 `components/`, IPC 훅은 `hooks/`, 작은 유틸·타입은 `lib/`로 옮긴다. 공통 폴더에서 화면으로 돌아가는 의존도 금지한다.
- 폴더 외부에서는 공개 `index.ts`를 사용한다. `app/`은 조립 계층이며 여러 화면을 연결하는 유일한 renderer 계층이다.
- `.dependency-cruiser.cjs`가 화면 폴더마다 격리 규칙을 생성한다. 새 화면 폴더도 자동으로 검사한다.
- 확인을 위해 home→settings와 components→bank의 임시 import를 만들었고, `lint:deps`가 두 위반을 모두 오류로 거부했다. 임시 파일은 삭제했다.

## CSS Modules와 토큰

- `import styles from './이름.module.css'`와 `className={styles.클래스}`를 사용한다. 전역 화면 클래스와 `:global`은 쓰지 않는다.
- 다른 컴포넌트의 내부 클래스 이름에 의존하지 않는다. 빈 상태의 밀도는 `compact`, 상세 패널 안 크기는 `className` 같은 명시적 속성으로 전달한다.
- 색·간격·글꼴·반경·아이콘·모션 등 디자인 값은 `tokens.css` 변수를 사용한다. 공통 리셋·폰트·포커스만 `base.css`에 둔다.
- `styles/modules.test.ts`가 모든 CSS 변수 참조와 정적 클래스의 존재, CSS Module 확장자, 임의 색상·`:global` 사용 여부를 검사한다.
- `--accent-fg`는 라이트 `#FFFFFF`, 다크 `#0F1220`이다. 주 버튼을 비롯해 강조 배경 위 글자는 이 값을 사용한다. 주 버튼은 호버에서도 강조 배경을 유지한다.
- 라이트 `--success`를 `#247C47`, `--warn`을 `#9B5D00`으로 조정했다. 기존 녹색·주황색 계열을 유지하며 글자 대비를 높였다. DESIGN.md 표도 함께 수정했다.

### 대비 자동 검사

`styles/tokens.test.ts`는 실제 `tokens.css`를 읽어 sRGB 선형화와 상대 휘도에 따른 WCAG 대비를 계산한다. 라이트·수동 다크·시스템 다크 각각 아래 조합을 검사한다.

| 전경 / 배경 | 최소 대비 |
|---|---|
| text / surface | 4.5:1 |
| text / bg | 4.5:1 |
| text-muted / surface | 4.5:1 |
| accent-fg / accent | 4.5:1 |
| accent / surface (링크·아이콘) | 3:1 |
| warn, danger, success / surface | 각각 4.5:1 |

필수 색상 토큰이 없거나 대비가 미달하면 테스트가 실패한다. 흰색/검정 21:1과 같은 색 1:1도 확인한다.

## 검수 수정의 동작

- main의 bank 서비스는 조회 결과 전체를 과목 ID → `compareObjectiveCodes`의 구간 숫자 → 생성 시각 → ID로 정렬한 후 페이지를 자른다. 학습목표 누락은 전체의 맨 뒤로 둔다. 누락 필터에서는 과목과 무관하게 생성 시각 → ID 순이다. 공백 목표도 누락으로 처리한다. 목표 접두 필터에서도 동일 정렬을 적용하며 1과 14를 구분한다.
- `useApi`는 로딩·한국어 오류·재시도를 제공하며 요청 조건이 바뀐 직후 이전 응답을 노출하지 않는다. 해제된 요청의 늦은 응답도 무시한다.
- 미리보기는 계속 `render-html`을 사용한다. IPC 로딩부터 iframe 로드·그리기 대기까지 스켈레톤을 표시한다. iframe은 준비 전 숨기고 `load` → `requestAnimationFrame` 두 번 → 표시/준비 신호 순서로 처리한다. 문항 교체·해제 시 이전 대기 프레임을 취소한다.
- 선택된 사이드바 메뉴의 오른쪽 화살표를 제거했다. 메뉴 접기는 하단 버전 위의 작은 아이콘·글자 버튼으로 옮겼고, 접힌 상태에서는 아이콘과 툴팁을 표시한다.
- `package.json`의 `dist`는 `npm run build`로 시작하도록 바꿨다.

## 검증

최종 검사 결과와 파일 목록은 아래에 기록한다. Electron 실행과 실제 화면 캡처는 사용자 지시에 따라 시도하지 않는다. 검수자가 이후 직접 캡처한다. HTML 정적 렌더 테스트는 공통 컴포넌트 접근성 속성과 미리보기 로딩·오류·빈 상태를 확인하는 코드 검사이며 화면 캡처가 아니다.

작업 중 추가 테스트의 필수 children 누락과 상세 조회의 undefined 타입 추론으로 typecheck가 두 차례 실패했으며 명시적 타입/속성을 보완했다. 공통 라우트 스크립트 검증을 추가한 뒤 전체 테스트는 신규 테스트의 require 경로 오류로 1개 실패/532개 통과였고, 절대 경로로 고쳐 단독 검사를 통과했다. 임시 의존 위반 검사는 의도대로 2개 오류를 반환했다. 이후 최종 결과는 아래 표를 따른다.

| 명령 | 최종 결과 |
|---|---|
| `npm.cmd test` | 통과, 61개 파일·533개 테스트, 85.38초, 종료 코드 0 |
| `npm.cmd run typecheck` | 통과, root·web·node 설정, 종료 코드 0 |
| `npm.cmd run lint:deps` | 통과, 214개 모듈·583개 의존, 위반 0, 종료 코드 0 |
| `npm.cmd run format` | 통과, 종료 코드 0 |
| `npm.cmd run format:check` | 통과, 종료 코드 0 |
| `npm.cmd run build` | 통과, main·preload·renderer·로컬 글꼴 생성, 종료 코드 0 |
| `git diff --check` | 통과, 종료 코드 0 |
| `git diff --exit-code -- src/contracts/index.ts` | 통과, 계약 변경 없음, 종료 코드 0 |
| 임시 위반을 넣은 `npm.cmd run lint:deps` | 의도한 실패, 화면 간 import와 components→screens 2개 오류 검출, 종료 코드 1. 임시 파일 삭제 후 위 최종 검사 통과 |

하지 못한 것: 실제 창·키보드·최소 창 크기·라이트/다크의 시각 검수는 실행하지 않았다. 이 환경에서는 캡처를 시도하지 말라는 사용자 지시에 따른 것이며 검수자가 직접 수행한다. 배포 설치 파일 생성도 이번 범위에 포함하지 않았다.

가정: 과목 순서는 과목 ID의 결정적 문자열 순, 생성 시각은 기존 저장 형식인 UTC ISO 문자열 순이다. 새 화면의 단일 메타데이터 표는 main과 renderer의 경계를 지키기 위해 `shared/routes.ts`에 두고 renderer `app/routes.ts`에서 화면을 연결한다.

실제 문제 파일·금지 폴더 접근, 네트워크 설치, git commit/push는 하지 않았다. 기존 사용자 파일 `docs/prompts/stage5a2.md`는 수정하지 않았다. 계약 변경 요청은 없다.

## 만든/수정한 파일 전체 목록

`A` 신규, `M` 수정, `D` 삭제. 빌드 결과 `out/`는 제외한다.

```text
M	.dependency-cruiser.cjs
M	docs/ARCHITECTURE.md
M	docs/DESIGN.md
M	package.json
M	scripts/capture.cjs
M	src/app/main/capture.test.ts
M	src/app/main/capture.ts
M	src/app/main/index.ts
M	src/app/main/ipc.test.ts
M	src/app/main/ipc.ts
M	src/app/main/services/app-info.ts
M	src/app/main/services/bank.test.ts
M	src/app/main/services/bank.ts
M	src/app/main/settings.ts
M	src/app/preload/index.ts
D	src/app/renderer/components/index.tsx
M	src/app/renderer/env.d.ts
M	src/app/renderer/main.tsx
D	src/app/renderer/styles/app.css
M	src/app/renderer/styles/tokens.css
M	vitest.config.ts
A	docs/STAGE5A2.md
A	scripts/route-ids.cjs
A	src/app/renderer/app/App.module.css
A	src/app/renderer/app/App.tsx
A	src/app/renderer/app/PageHeader.module.css
A	src/app/renderer/app/PageHeader.tsx
A	src/app/renderer/app/Sidebar.module.css
A	src/app/renderer/app/Sidebar.tsx
A	src/app/renderer/app/index.ts
A	src/app/renderer/app/router.test.ts
A	src/app/renderer/app/router.ts
A	src/app/renderer/app/routes.test.ts
A	src/app/renderer/app/routes.ts
A	src/app/renderer/app/shortcuts.ts
A	src/app/renderer/app/theme.ts
A	src/app/renderer/components/Badge.module.css
A	src/app/renderer/components/Badge.tsx
A	src/app/renderer/components/Button.module.css
A	src/app/renderer/components/Button.tsx
A	src/app/renderer/components/Card.module.css
A	src/app/renderer/components/Card.tsx
A	src/app/renderer/components/Dialog.module.css
A	src/app/renderer/components/Dialog.tsx
A	src/app/renderer/components/EmptyState.module.css
A	src/app/renderer/components/EmptyState.tsx
A	src/app/renderer/components/ErrorState.module.css
A	src/app/renderer/components/ErrorState.tsx
A	src/app/renderer/components/Input.module.css
A	src/app/renderer/components/Input.tsx
A	src/app/renderer/components/SearchInput.module.css
A	src/app/renderer/components/SearchInput.tsx
A	src/app/renderer/components/Skeleton.module.css
A	src/app/renderer/components/Skeleton.tsx
A	src/app/renderer/components/Spinner.module.css
A	src/app/renderer/components/Spinner.tsx
A	src/app/renderer/components/Tabs.module.css
A	src/app/renderer/components/Tabs.tsx
A	src/app/renderer/components/Toast.module.css
A	src/app/renderer/components/Toast.tsx
A	src/app/renderer/components/Tooltip.module.css
A	src/app/renderer/components/Tooltip.tsx
A	src/app/renderer/components/components.test.ts
A	src/app/renderer/components/index.ts
A	src/app/renderer/hooks/index.ts
A	src/app/renderer/hooks/useApi.ts
A	src/app/renderer/hooks/useReadySignal.test.ts
A	src/app/renderer/hooks/useReadySignal.ts
A	src/app/renderer/lib/afterTwoFrames.test.ts
A	src/app/renderer/lib/afterTwoFrames.ts
A	src/app/renderer/lib/index.ts
A	src/app/renderer/lib/navigation.ts
A	src/app/renderer/lib/screen.ts
A	src/app/renderer/lib/unwrap.test.ts
A	src/app/renderer/lib/unwrap.ts
A	src/app/renderer/screens/bank/BankScreen.module.css
A	src/app/renderer/screens/bank/BankScreen.tsx
A	src/app/renderer/screens/bank/ObjectiveTree.module.css
A	src/app/renderer/screens/bank/ObjectiveTree.tsx
A	src/app/renderer/screens/bank/PreviewFrame.module.css
A	src/app/renderer/screens/bank/PreviewFrame.tsx
A	src/app/renderer/screens/bank/PreviewPlaceholder.module.css
A	src/app/renderer/screens/bank/PreviewPlaceholder.tsx
A	src/app/renderer/screens/bank/QuestionList.module.css
A	src/app/renderer/screens/bank/QuestionList.tsx
A	src/app/renderer/screens/bank/QuestionPreview.module.css
A	src/app/renderer/screens/bank/QuestionPreview.tsx
A	src/app/renderer/screens/bank/TreeNodes.module.css
A	src/app/renderer/screens/bank/TreeNodes.tsx
A	src/app/renderer/screens/bank/index.ts
A	src/app/renderer/screens/bank/preview.test.ts
A	src/app/renderer/screens/bank/useBankData.ts
A	src/app/renderer/screens/coming-soon/ComingSoonScreen.tsx
A	src/app/renderer/screens/coming-soon/index.ts
A	src/app/renderer/screens/home/HomeScreen.module.css
A	src/app/renderer/screens/home/HomeScreen.tsx
A	src/app/renderer/screens/home/index.ts
A	src/app/renderer/screens/settings/SettingsScreen.module.css
A	src/app/renderer/screens/settings/SettingsScreen.tsx
A	src/app/renderer/screens/settings/index.ts
A	src/app/renderer/styles/base.css
A	src/app/renderer/styles/modules.test.ts
A	src/app/renderer/styles/tokens.test.ts
A	src/app/shared/index.ts
A	src/app/shared/routes.test.ts
A	src/app/shared/routes.ts
```
