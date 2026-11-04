# 작업(정정판): 설치 파일에서 OCR 에 필요 없는 파일만 빼기

먼저 `AGENTS.md` 를 읽고 따른다. 이 작업은 **빌드 설정(`electron-builder.yml`)만** 건드린다. `src/` 는 수정하지 않는다. git commit/push 는 하지 않는다.
PowerShell 에서 파일은 `Get-Content -Encoding UTF8`, npm 은 `npm.cmd`. 문제 데이터 파일은 읽지 않는다.

## 이전 시도가 실패한 이유 (중요)
이전 지시에서 "tesseract.js 가 LSTM 코어(`*-lstm`)를 쓴다"고 안내했는데 **틀렸다**. `node_modules/tesseract.js/src/worker-script/node/getCore.js` 는 첫 인자로 `oem` 이 아니라 **`lstmOnly` 불리언(true)** 을 받아서 `[OEM.DEFAULT, OEM.LSTM_ONLY].includes(true)` 가 항상 false 가 된다. 그래서 Node 에서는 **항상 비-LSTM 코어**를 불러온다: `tesseract-core-relaxedsimd`, `tesseract-core-simd`, `tesseract-core`(CPU 기능에 따라 하나). 그걸 빼서 패키징 앱의 OCR 이 `Cannot find module 'tesseract.js-core/tesseract-core-relaxedsimd'` 로 멈췄다. (`electron-builder.yml` 은 이미 원래 상태로 되돌려 두었다. 지금 파일에는 `files:` 제외 규칙이 없다.)

## 해야 할 일
1. `electron-builder.yml` 의 `files:` 에 제외 규칙(`!패턴`)을 추가해 설치 파일을 줄인다. **아래만** 제외한다.
   - `!**/*.map`
   - `tesseract.js-core` 의 `-lstm` 변형 9개 파일(`tesseract-core-lstm.*`, `tesseract-core-simd-lstm.*`, `tesseract-core-relaxedsimd-lstm.*` — Node 경로에서 로드되지 않음). **`-lstm` 이 붙지 않은 `tesseract-core.*`, `tesseract-core-simd.*`, `tesseract-core-relaxedsimd.*` 는 반드시 남긴다.**
   - `tesseract.js` 의 `dist/`(브라우저 번들), `docs/`, `examples/` (Node 는 `src/` 를 씀)
   - `@tesseract.js-data/kor/4.0.0/`(앱은 `4.0.0_best_int/` 만 씀)
   - `pdfjs-dist` 의 `build/`, `web/`, `types/`, `image_decoders/`, `legacy/web/`, `legacy/image_decoders/`, `legacy/build/*.min.mjs`, `legacy/build/pdf.sandbox.mjs` (앱은 `legacy/build/pdf.mjs` 와 `pdf.worker.mjs` 만 씀)
   - 그 외는 **불확실하면 제외하지 않는다.**
   - 패턴이 의도한 파일만 걸러내는지 확인한다(예: `tesseract-core.*` 패턴이 `-lstm` 파일을 잘못 건드리지 않는지).
2. 로컬 잠금을 피하려고 **출력 폴더를 `release-check` 로 따로 지정해서** 빌드한다(기본 `release` 폴더의 `win-unpacked` 가 다른 프로세스에 잠겨 있을 수 있다):
   ```
   npm.cmd run build
   npx.cmd electron-builder --win nsis --publish never -c.directories.output=release-check
   ```
3. **반드시 실행 확인을 한다.** 패키징된 런타임을 Node 로 써서 OCR 파일이 온전한지 본다(GUI 를 띄우지 않는다):
   ```
   $env:ELECTRON_RUN_AS_NODE = '1'
   & ".\release-check\win-unpacked\QuestionBank.exe" ".tmp-realcheck\ocr-probe\pkprobe.cjs" ".\release-check\win-unpacked\resources\app.asar.unpacked" ".tmp-realcheck\ocr-probe\fake-page.png"
   ```
   마지막 줄이 `ok <ms> ms "..."` 이면 통과. `ERR`/`TIMEOUT` 이면 실패이므로 제외 규칙을 고쳐서 다시 한다. 통과할 때까지 반복하고, 최종 통과 출력을 보고서에 그대로 붙인다.
4. `release-check` 폴더와 `.tmp-realcheck` 는 Git 대상이 아니다(`.gitignore` 확인; 없으면 `release-check/` 를 추가).
5. `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run lint:deps` 가 통과하는지 확인한다.

## 최종 보고 형식
1. 수정한 파일
2. 제외한 패턴과 근거 / 제외하지 않은 것과 이유
3. 설치 파일 크기(전: 약 261MB → 후) 와 3번 실행 확인의 마지막 출력
4. 막힌 것·가정한 것
