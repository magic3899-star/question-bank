## 5A2단계: 화면 코드 구조 개편(파일 분리·화면 격리) + 검수에서 나온 수정

검수자가 5A 앱을 실제로 실행해 캡처 32장을 확인했다. 화면은 좋지만 **renderer 코드가 `main.tsx` 한 파일에 몰려 있고(포맷 전 한 줄 최대 1,196자)**, 이대로 화면을 더 쌓으면 한 화면을 고칠 때 다른 화면이 깨지기 쉽다. 사용자의 핵심 요구는 "프로그램을 바꾸거나 기능을 추가할 때 서로 간섭이 없도록 모듈을 쪼갠다"이다. **동작과 화면 모양은 바꾸지 않고**(아래 명시한 수정 제외) 구조만 개편한다.

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 구현하고 검사를 통과시킨 뒤에만 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md(**코드 형식·파일 분리 규칙이 추가됨**), docs/ARCHITECTURE.md §3·§8-1, docs/DESIGN.md, docs/STAGE5A.md, `src/app/**` 전체를 `Get-Content -Encoding UTF8` 로 읽어라. `npm.cmd`/`npx.cmd`. 계약 수정 금지. 실제 문제 파일·`.tmp-realcheck/` 접근 금지. 네트워크 설치 금지.
- 이 환경에서는 Electron 창을 띄울 수 없다(샌드박스 ACL — 5A 에서 확인됨). **캡처는 시도하지 말고**, 대신 검수자가 끝난 뒤 직접 캡처한다. renderer 는 `npm.cmd run build` 와 typecheck 로 검증하라.
- 마무리 전 `npm.cmd test`(전체), `npm.cmd run typecheck`, `npm.cmd run lint:deps`, `npm.cmd run format`→`npm.cmd run format:check`, `npm.cmd run build` 모두 통과.

## 5A2-1. renderer 구조 (화면 격리)
```
src/app/renderer/
  main.tsx                  부트스트랩만(루트 렌더, 전역 스타일 import)
  app/                      App.tsx, routes.ts(라우트 표: id·제목·설명·아이콘·화면 컴포넌트), router.ts(해시 라우터), Sidebar.tsx, PageHeader.tsx, theme.ts, shortcuts.ts
  screens/home/             HomeScreen.tsx + 하위 컴포넌트 파일들 + *.module.css
  screens/bank/             BankScreen.tsx, ObjectiveTree.tsx, QuestionList.tsx, QuestionPreview.tsx, 각 *.module.css
  screens/settings/         SettingsScreen.tsx (+ css)
  screens/coming-soon/      ComingSoonScreen.tsx (준비 중 화면 공용)
  components/               컴포넌트 하나당 파일 하나(Button.tsx, Badge.tsx, Card.tsx, EmptyState.tsx, ErrorState.tsx, Spinner.tsx, Skeleton.tsx, Toast.tsx, Dialog.tsx, Tabs.tsx, Tooltip.tsx, SearchInput.tsx …) + 각 *.module.css + index.ts(재수출)
  hooks/                    useApi.ts(로딩·오류·재시도가 있는 IPC 호출), useReadySignal.ts, …
  lib/                      작은 순수 유틸(형식화 등)
  styles/                   tokens.css(토큰만, 한 줄에 선언 하나), base.css(리셋·글꼴·포커스 링 등 전역)
```
- 화면·컴포넌트 스타일은 **CSS Modules(`*.module.css`)** 로 각 파일 옆에 둔다(클래스 이름 충돌 = 화면 간 간섭을 막기 위해). 전역 CSS 는 tokens.css·base.css 만. 모든 값은 토큰 변수 사용(DESIGN.md §2).
- **의존 규칙 추가(.dependency-cruiser.cjs)**: `screens/<a>` 는 다른 `screens/<b>` 를 import 할 수 없다. 화면끼리 공유할 것은 `components/`, `hooks/`, `lib/` 로. `components/` 는 `screens/` 를 import 할 수 없다. 임시 위반으로 작동 확인 후 삭제.
- 새 화면을 추가할 때 `routes.ts` 에 한 줄 + `screens/<new>/` 폴더만 추가하면 되게(사이드바·라우터·캡처 모드가 routes.ts 를 읽는다). 캡처 모드의 라우트 목록도 routes.ts 에서 가져오도록 정리(main 은 renderer 코드를 import 할 수 없으므로, 라우트 id 목록을 `src/app/shared/` 에 두고 양쪽이 쓰게 하라).
- 파일 하나가 약 300줄을 넘지 않게. Prettier 형식.

## 5A2-2. 검수에서 나온 수정
 a. **다크 모드 대비 부족**: 다크 테마의 주 버튼(배경 `--accent` #7C93F5)에 흰 글자 → 대비 약 2.9:1(기준 4.5:1 미달). `--accent-fg` 토큰을 추가(라이트 `#FFFFFF`, 다크는 어두운 색 예: `#0F1220`)하고 강조 배경 위 글자는 모두 이 토큰을 쓴다. **토큰 대비 자동 검사 테스트**를 추가: tokens.css 를 읽어 라이트·다크 각각 (text/surface), (text/bg), (text-muted/surface), (accent-fg/accent), (accent/surface — 링크·아이콘용, 3:1 이상), (warn·danger·success 를 글자로 쓰는 경우 surface 대비 4.5:1) 의 WCAG 대비를 계산해 기준 이상인지 확인. 미달 토큰은 DESIGN.md 의 색 계열 안에서 조정하고 DESIGN.md 표도 같이 고쳐라.
 b. **문제 목록 정렬**: 지금은 ID 문자열 순(fake-0, fake-1, fake-10, fake-100…). main 의 bank 서비스에서 **과목 → 학습목표 코드(구간 숫자 순, `compareObjectiveCodes`) → 생성 시각 → ID** 순으로 정렬 후 페이지를 자른다(학습목표 없는 문제는 맨 뒤, "학습목표 없음" 필터일 때는 생성 순). 테스트.
 c. **미리보기 빈 화면 순간**: 문항을 바꾸면 iframe 이 잠깐 비거나, 준비 신호가 실제 그려지기 전에 설정되는 시간차가 있다(검수 캡처 1장에서 빈 미리보기). 새 문항 HTML 이 로드되어 그려질 때까지 이전 미리보기를 유지하거나 스켈레톤을 보이고, `ready` 신호는 iframe `load` 후 두 번의 `requestAnimationFrame` 뒤에 설정.
 d. 사이드바: 선택된 메뉴의 오른쪽 `>` 화살표 제거(강조 배경으로 충분), "메뉴 접기" 버튼은 사이드바 아래쪽(버전 위)의 작은 아이콘+글자 버튼으로 이동. 접힌 상태에서는 아이콘만 + 툴팁.
 e. package.json `dist` 스크립트의 `npm.cmd run build` → `npm run build`(CI 이식성).

## 5A2-3. 문서
`docs/STAGE5A2.md`: 새 폴더 구조, "새 화면 추가 방법"(routes.ts 한 줄 + screens 폴더), 화면 격리 규칙, CSS Modules 사용 규칙, 대비 검사 테스트 설명. ARCHITECTURE.md §8-1 에 renderer 구조 요약 몇 줄 추가.
AGENTS.md 최종 보고 형식으로 보고(계약 변경 요청 포함).
