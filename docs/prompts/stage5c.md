## 5C단계: 문제 추가·편집 화면 (직접 입력 + PDF 붙여넣기 자동 분리 + 해설 따로 붙이기)

배경(ARCHITECTURE §11-1): 문제집의 문항도 문제은행에 넣고 싶다. 원본은 **PDF 이고 문제와 해설이 따로** 있다. 직원은 PDF 에서 글자를 복사해 붙여 넣거나 직접 입력한다. 문제집 문항에는 학습목표 코드가 없을 수 있으므로, 코드를 직접 입력하거나 은행의 학습목표 목록에서 고를 수 있어야 한다.

## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 구현하고 검사를 통과시킨 뒤에만 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md(§3·§8-1·§11·§11-1), docs/DESIGN.md(§4.2 문제은행·편집기), src/contracts/index.ts, docs/STAGE5A2.md·STAGE5B.md, `src/app/**`, `src/modules/importers/text/**`, `src/modules/layout-parser/**`, `src/modules/validators/**` 를 `Get-Content -Encoding UTF8` 로 읽어라. `npm.cmd`/`npx.cmd`. 계약 수정 금지. 실제 문제 파일·`.tmp-realcheck/` 접근 금지. 네트워크 설치 금지.
- Electron 창은 이 환경에서 띄울 수 없다. 캡처는 검수자가 한다. renderer 는 build·typecheck·순수 로직 단위 테스트로 검증.
- 마무리 전 `npm.cmd test`(전체), `typecheck`, `lint:deps`, `format`→`format:check`, `build` 모두 통과.

## 5C-0. 캡처 도구 보강 (검수에서 발견)
미리보기 iframe(sandbox, 별도 프로세스)이 화면에 합성되기 전에 캡처되어 빈 흰 상자로 찍히는 경우가 있다(실제 앱에서는 정상 표시 확인). 캡처 모드에서 준비 신호와 두 프레임 대기 후 **추가로 약 400ms 기다린 뒤** `capturePage` 하라(상수로 두고 STAGE 문서에 이유 기록).

## 5C-1. 서식 있는 글 편집 — 순수 변환 + 얇은 편집기
- `src/app/renderer/lib/rich-text/`(순수, DOM 없이 테스트 가능): 편집기 내용 모델 ↔ `Block[]`(문단과 run 서식: 밑줄·굵게·기울임·위첨자·아래첨자, 줄바꿈 `\n`) 변환. DOM → 간단한 트리(`{ text } | { tag, children }`) 변환은 renderer 컴포넌트에서 하고, 트리 → runs 변환·정규화(같은 서식 run 병합, 빈 run 제거)는 순수 함수로. **허용 태그 외(스크립트·스타일·링크·이미지 등)는 글자만 남기고 버린다.** 테스트: 서식 조합, 중첩 태그, 허용 외 태그 제거, 줄바꿈, 왕복(Block → 편집기 → Block 동일).
- `components/RichTextField.tsx`: contentEditable 기반의 작은 편집기. 도구 막대(밑줄 U·굵게 B·기울임 I·위첨자·아래첨자) + 단축키(Ctrl+U/B/I), **붙여넣기는 서식 없는 글자로**(PDF 복사 때 잡다한 서식 방지 — 단 Shift+붙여넣기가 아니라 기본이 서식 없음), 접근성(`role="textbox"`, `aria-multiline`, 라벨).
- `components/BlockListEditor.tsx`: 예문(passage)·해설처럼 여러 블록을 갖는 영역: 문단 / 보기 상자(1×1 표) / 표(행·열 추가·삭제, 셀은 RichTextField) / 이미지(파일 선택 또는 **클립보드 이미지 붙여넣기**, png·jpg·gif·webp·bmp, 10MB 이하) 블록 추가·삭제·위아래 이동.

## 5C-2. 편집기 화면 `screens/editor/` (라우트: `add` = 새 문제, `edit?id=...` = 기존 문제 편집)
레이아웃(DESIGN.md 토큰): 왼쪽 편집 폼, 오른쪽 **실시간 미리보기**(공용 PreviewFrame — 출력과 같은 렌더러) + 검사 결과 패널.
- 기본 정보: 과목(설정의 과목), **학습목표 코드**(직접 입력 + 자동 완성: 같은 과목의 은행 코드 목록. 옆의 "목록에서 고르기" 버튼 → 은행 화면과 같은 학습목표 트리 대화상자에서 선택). 형식 검사는 objective-code 모듈. 비어 있으면 "학습목표가 없으면 출제 대상에서 빠집니다" 경고(저장은 가능). 등급(A/B/없음).
- 문제 줄(stem): RichTextField. 예문(passage): BlockListEditor(선택).
- 선지: 2~10개, 각 RichTextField, 정답 표시(체크 — 복수 정답 허용), "위치 고정" 토글, 위/아래 이동 버튼(키보드 가능), 추가/삭제. 선지 번호(①~)는 화면에 위치로만 표시하고 내용에 넣지 않는다.
- 해설: BlockListEditor. **비어 있어도 저장 가능**(나중에 붙이기) — 비어 있으면 info 표시.
- 선지 섞기: 자동 판정 표시 — 본문·예문·해설에 원문자가 있으면 "해설·본문이 선지 번호를 참조해 선지 순서를 고정합니다" 배지와 함께 `lock-all` 로 저장(사용자가 해제 가능, 해제하면 경고). 선지 본문에 "모두"·"해당 없음" 등이 있으면 해당 선지 위치 고정을 제안(한 번 클릭으로 적용).
- 검사 패널: 입력이 바뀔 때마다(디바운스 300ms) main 의 `bank.validate` 로 검증기 실행 → 오류/경고/정보 목록(클릭하면 해당 입력으로 포커스).
- 저장: 오류가 있으면 저장 버튼 비활성(이유 툴팁). 경고만 있으면 확인 대화상자. 저장 시 main 이 **같은 지문 중복**(`questionContentKey`, 자기 자신 제외)을 검사해 있으면 대화상자("같은 지문의 문제가 이미 있습니다 — 출제에서는 첫 문제만 쓰입니다", 기존 문제 미리보기, [그래도 저장]/[취소]). 저장 후 토스트(실행 취소 — 새 문제는 삭제, 편집은 이전 내용 복원) + "계속 추가"(폼 비우되 과목·학습목표·등급 유지) / "문제은행에서 보기".
- 저장하지 않은 변경이 있을 때 다른 화면으로 이동하면 확인 대화상자(앱 안 Dialog). 창 닫기도 main 에서 확인.
- 문제은행 화면 연결: 상세 패널에 "편집" 버튼(→ `edit?id=`), "삭제"(확인 대화상자 + 실행 취소 토스트), 머리글 "문제 추가" 버튼 활성화.

## 5C-3. PDF 붙여넣기 자동 분리 (편집기 안의 "붙여넣기" 패널)
- 큰 입력란("PDF 에서 복사한 문제를 붙여넣으세요") → main `editor.parseText({ text, subject })` → `parseQuestionText`(5B) 사용 → 결과:
  - 1문제: 편집기의 해당 칸(문제 줄·예문·선지·정답·해설·학습목표·등급)을 채운다(덮어쓰기 전 확인).
  - 여러 문제: "N개 문제로 나누었습니다" → **연속 추가 모드**: 문제 목록(번호·앞부분·상태)과 현재 편집 중인 문제, [저장하고 다음]/[건너뛰기]. 진단(정답 없음, 선지 수 이상, PDF 흔적 의심 등)은 각 문제에 표시.
  - 해석 결과에 정답이 없으면(문제집은 정답이 해설 PDF 에 있을 수 있음) 정답 칸을 비워 두고 "정답을 선택하세요" 표시(저장 시 오류로 막힘 — validators 의 ANSWER_MISSING).
- **해설 따로 붙이기**: 연속 추가 모드(이번 작업 묶음 — `extra.addBatchId`)에서 "해설 붙여넣기" → `editor.parseExplanations({ text })`(5B `parseExplanationText`) → 번호별 해설을 **묶음 안 문제의 원래 번호(`extra.originalNumber`, 없으면 추가 순서)** 와 짝지은 표를 보여 주고(짝이 없는 번호·문제는 표시) 사용자가 확인하면 일괄 적용(main `bank.applyExplanations({ pairs })` → 각 문제 해설 갱신 + updatedAt). 해설에 정답이 함께 있는 형식(`정답 ③` 등)이면 정답도 채울지 묻는다.
- 문제은행 화면에 "해설 없는 문제" 필터를 추가(나중에 해설을 붙일 문제 찾기).

## 5C-4. main 서비스·IPC (`src/app/main/services/editor.ts` 등)
`bank.validate(question)`, `bank.save({ question, assets })`(새 문제: ID·생성 시각 부여, 편집: updatedAt, 자산 저장, 중복 검사 결과 반환 → 확인 후 `force: true` 로 재호출), `bank.delete(ids)`/`bank.restore(questions)`(실행 취소), `bank.objectiveCodes(subject)`(자동 완성), `assets.add({ bytes, mime })`(이미지 검증 후 sha256 기반 ID — content-model `sha256Hex`), `editor.parseText`, `editor.parseExplanations`, `bank.applyExplanations`, bank 목록 필터 `withoutExplanation`.
입력 검증·한국어 오류. 서비스 테스트(`:memory:` storage, 가짜 데이터): 저장/편집/삭제/복원, 중복 검사(자기 자신 제외), 자산 크기·형식 거부, 텍스트 해석 1개·여러 개, 해설 짝짓기(번호 일치·불일치·누락), withoutExplanation 필터.

## 5C-5. 검수용 캡처 확장
캡처 모드 라우트에 `add`(빈 폼)와 `edit`(은행의 첫 문제) 편집기 상태를 포함하고, 환경변수 `QB_CAPTURE_PASTE_FILE`(텍스트 파일 경로)이 있으면 그 글자를 붙여넣기 패널에 넣고 해석한 **연속 추가 모드** 상태를 `add-paste-{theme}-{size}.png` 로 추가 저장.

## 5C-6. 문서
`docs/STAGE5C.md`: 편집기 구조, 서식 모델 변환 규칙, 붙여넣기·해설 짝짓기 흐름, IPC, 한계. AGENTS.md 최종 보고 형식(계약 변경 요청 포함).
