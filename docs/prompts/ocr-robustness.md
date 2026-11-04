# 작업: OCR 엔진이 실패해도 앱이 멈추지 않게 하기

먼저 `AGENTS.md` 를 읽고 따른다(형식: Prettier, 파일 단위 분리, 테스트 필수). git commit/push 는 하지 않는다. `src/contracts/index.ts` 는 수정하지 않는다.
PowerShell 에서 파일은 `Get-Content -Encoding UTF8`, npm 은 `npm.cmd`. 문제 데이터 파일은 읽지 않는다.

## 배경(실제로 겪은 장애)
`src/modules/ocr/index.ts` 의 `createOcrEngine` 은 tesseract.js(v7) 작업자를 만든다. 패키징 앱에서 코어 파일이 없자 작업자 로드가 실패했고, tesseract.js 가 `errorHandler` 옵션이 없을 때 오류를 `throw Error(data)` 로 던져(`node_modules/tesseract.js/src/createWorker.js` 의 `status === 'reject'` 분기) **메인 프로세스의 처리되지 않은 예외**가 되어 앱 전체가 응답 없음이 되었다. 인식이 영원히 끝나지 않는 경우도 막아야 한다.

## 요구사항 (`src/modules/ocr/index.ts` 만 수정 + 테스트 추가)
1. `createWorker(...)` 옵션에 `errorHandler: () => undefined` 를 넣는다. 왜 필요한지 한 줄 주석("작업이 이미 reject 되어 호출자에게 전달되므로, 라이브러리가 던지는 예외로 앱이 죽지 않게 삼킨다")을 단다.
2. `recognize()` 한 번에 **시간 제한**을 둔다. `OcrEngineOptions` 에 `timeoutMs?: number`(기본 120000)를 추가한다. 제한을 넘으면 `Error('글자 인식 시간이 초과되었습니다.')` 로 reject 한다.
3. 인식 작업이 실패하거나(시간 초과 포함) 작업자 생성이 실패하면, 현재 스케줄러를 `terminate()` 하고(실패해도 무시) 내부 참조를 비워서 **다음 `recognize()` 호출이 새로 시작**하게 한다. 동시에 진행 중이던 다른 호출이 있어도 안전해야 한다(이미 끝난 스케줄러를 두 번 종료해도 예외가 나지 않게).
4. 기존 동작(2단 조판 좌우 분리 인식, `close()`)은 그대로 유지한다. 공개 인터페이스(`OcrEngine`)는 바꾸지 않는다.
5. 테스트 `src/modules/ocr/engine.test.ts` 를 새로 만든다. `vi.mock('tesseract.js', ...)` 로 `createWorker`/`createScheduler` 를 가짜로 대체해서(실제 인식은 하지 않는다):
   - 정상: 한 줄 결과를 돌려주면 `recognize` 가 줄 문자열을 반환한다.
   - 작업자 생성에 `errorHandler` 함수가 전달된다.
   - `addJob` 이 reject 하면 `recognize` 가 reject 하고 `terminate` 가 호출되며, **다음 호출은 `createWorker` 를 다시 부른다**.
   - `addJob` 이 끝나지 않으면(never resolve) 가짜 타이머로 `timeoutMs` 가 지난 뒤 reject 한다.
   - `close()` 는 스케줄러를 종료하고, 이후 `recognize` 는 새로 시작한다.
   (2단 분리 경로는 `@napi-rs/canvas` 가 필요하므로 이 테스트에서는 줄 하나짜리 결과로 1단 경로만 다룬다.)
6. 마무리: `npm.cmd run format`, `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run lint:deps`, `npx.cmd vitest run src/modules/ocr`, 그리고 전체 `npm.cmd test` 를 통과시킨다.

## 최종 보고 형식
1. 수정/추가한 파일
2. 실행한 명령과 결과(통과/실패 그대로)
3. 하지 못한 것·가정한 것
