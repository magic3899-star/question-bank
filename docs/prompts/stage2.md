## 실행 방식 (중요)
- 계획만 말하고 멈추지 마라. 파일을 만들고, 테스트를 돌리고, 통과할 때까지 고친 뒤에만 최종 보고하라. 사용자에게 묻지 마라.
- 먼저 AGENTS.md, docs/ARCHITECTURE.md, src/contracts/index.ts, docs/STAGE1.md 를 `Get-Content -Encoding UTF8` 로 읽어라. 모든 파일은 UTF-8(BOM 없음).
- PowerShell 에서는 `npm.cmd` / `npx.cmd` 를 써라. 의존성 `jszip`, `@xmldom/xmldom` 은 이미 설치됨. 네트워크 설치 금지.
- `src/contracts/index.ts` 는 수정 금지(이번에 내가 Validator 에 validate?/validateAll?/label 을 반영해 두었다).
- **실제 문제 파일(문제 디비/, 규칙.docx)을 절대 읽지 마라.** 모든 테스트 입력은 코드로 만든 가짜 docx 다.
- `.dependency-cruiser.cjs` 는 필요하면 수정하라: `importers/<id>`, `validators/<id>` 끼리는 서로 import 금지이지만, 상위 집계 파일(`src/modules/importers/index.ts`, `src/modules/validators/index.ts`)은 하위 플러그인을 import 할 수 있어야 한다. 규칙이 실제로 작동하는지(위반 시 실패) 다시 확인하라.

## 2-A. content-model 브라우저 안전화
- `src/modules/content-model/index.ts` 에서 `node:crypto` import 를 제거하라(UI 화면=브라우저 환경에서도 써야 한다).
- 순수 JS SHA-256 구현 `sha256Hex(data: Uint8Array | string): string` 을 content-model 에 추가·export (문자열은 UTF-8 인코딩, TextEncoder 사용). `hashBlocks` 는 이것을 쓴다.
- 테스트(테스트 파일에서는 node:crypto 사용 가능): 빈 입력, "abc", 한글 문자열, 1MB 바이트 배열, 경계 길이(55,56,63,64,65바이트)에서 node:crypto 결과와 동일.
- 기존 hashBlocks 결과 값이 바뀌지 않는지 확인(기존 테스트 통과).

## 2-B. tests/fixtures/docxBuilder.ts — 가짜 docx 생성기
jszip 으로 최소 유효 docx(.docx zip: [Content_Types].xml, _rels/.rels, word/document.xml, word/_rels/document.xml.rels, 필요 시 word/media/*)를 만드는 테스트 도우미. DSL 예:
`buildDocx({ body: [ p('1. 가짜 문제'), p([run('밑줄', {underline:true}), run(' 일반')]), table([[ [p('셀')] ]]), image({ widthEmu, heightEmu, bytes, anchor:true|false }), textbox([p('보기')], { shaded:true }), emptyP(), raw('<w:p>...</w:p>') ] })`.
다음 실제 구조를 재현할 수 있어야 한다(실제 문서에서 확인된 형태):
 1. 텍스트박스: `w:p > w:r > w:pict > v:rect > v:textbox > w:txbxContent > w:p...` (음영 w:shd 포함). (레거시 VML 방식)
 2. 떠 있는 이미지: `w:r > w:drawing > wp:anchor > wp:extent(cx,cy) ... a:graphic > a:graphicData > pic:pic > pic:blipFill > a:blip r:embed="rIdN"`, 그리고 인라인 `wp:inline` 도.
 3. 레거시 이미지: `w:pict > v:shape > v:imagedata r:id="rIdN"`.
 4. `mc:AlternateContent` (Choice/Fallback 둘 다 같은 텍스트박스 내용 포함) — 중복 방지 테스트용.
 5. 표(w:tbl/w:tr/w:tc), 셀 안 여러 문단, 중첩 표.
 6. 서식 run: 밑줄(w:u w:val="single"/"none"), 굵게(w:b, w:b w:val="0"), 기울임, 위/아래첨자(w:vertAlign), w:tab, w:br, 수식(m:oMath 안 m:t), 변경추적(w:ins/w:del+w:delText), w:sdt, w:hyperlink, w:fldSimple.
 7. 자동 번호 문단(w:pPr/w:numPr)이지만 본문에 번호 글자 없는 것.
이 빌더 자체도 간단한 테스트를 둔다(생성한 docx 를 jszip 으로 다시 열어 구조 확인).

## 2-C. src/modules/importers/docx — Word 가져오기 (가장 중요)
공개: `export const docxImporter: Importer` (id: 'docx', extensions: ['.docx']). 파일 시스템을 읽지 않는다(입력은 Uint8Array).
`parse(input, options)` 의 options: `{ subject: string; profile?: LayoutProfile }`. subject 가 없으면 내용 파싱은 하지 않고 error 진단 `SUBJECT_REQUIRED`(한국어, 해결 방법 포함)를 담은 빈 초안을 돌려준다.

### 범용성: 레이아웃 프로파일 (코드 수정 없이 다른 문서 양식 지원)
`LayoutProfile`(이 모듈에서 정의·export, JSON 직렬화 가능, 정규식은 문자열로) 필드:
 id, label, sourceTagPattern, stemStartPattern(번호 캡처 그룹), choiceMarkers(['①','②','③','④','⑤'] 외 ⑥~⑩ 허용), answerLabelPattern, explanationLabelPattern, objectiveLinePattern(이름 있는 그룹 subject/code/text/grade), fixedChoicePatterns(문자열 배열), stemLookaheadBlocks(기본 6).
`export const standardProfile: LayoutProfile` — 아래 "문서 양식"에 맞춘 기본값. 프로파일 검증 함수 `validateProfile()`(잘못된 정규식 → 한국어 오류).

### 문서 양식 (기본 프로파일이 처리할 구조)
```
<2026-3-1>                       ← 출처 태그 (<YYYY-M-D> 또는 <YYYY-MM-DD> 형태 둘 다). 이후 문제들에 적용, 다음 태그까지.
1. 문제 본문?                    ← 문제 시작. 번호 표기는 "1." "01." "21." 제각각, 앞에 탭/공백 있을 수 있음
[보기/지문 문단·표·이미지·텍스트박스…]   ← 문제 줄과 첫 선지 사이의 모든 블록 = 이 문제의 passage (선지 번호 글자 ① 로 시작하는 줄 전까지)
① 선지1 ... ⑤ 선지5              ← 선지. 번호 글자는 제거하고 저장(내용에 넣지 않음)
(빈 줄)
정답: ④                         ← 정답 번호(들). "①, ③" "①③" 복수 가능. 숫자만("4") 있으면 허용하되 경고.
해설: 제목                       ← 이 줄 뒤부터 다음 경계 전까지 전부 해설(선지처럼 ① 로 시작하는 줄이나 ⦁ 줄 포함, 표·이미지 포함)
⦁...
법규 1-1-3 학습목표 문장 (A)      ← 학습목표 줄(과목 + 코드 + 문장 + (등급)). 레코드의 끝. 코드 사이 공백은 U+3000(전각)일 수도 있음 → 일반 공백으로 정규화.
```
- 문제 하나는 "문제 줄 → … → 정답 → 해설 → (학습목표 줄)" 이며, 학습목표 줄이 **없는** 문제도 있다. 그 경우 다음 문제 시작 또는 출처 태그 또는 문서 끝이 경계다.
- **문제 시작 판정은 앞보기(lookahead)로**: 번호 패턴 줄이면서, 이후 `stemLookaheadBlocks` 개 블록(빈 줄·표·이미지·텍스트박스 건너뜀) 안에 선지 번호(①)로 시작하는 줄이 정답 줄보다 먼저 나올 때만 문제 시작이다. (해설 안에 "1. 설명" 같은 번호 줄이 있어도 문제로 오인하면 안 된다. 해설 안의 "① 한의사: …" 줄도 선지가 아니다 — 정답 줄 이후에는 선지로 보지 않는다.)
- 문제 줄과 선지 사이에 여러 블록이 있으면: 첫 문단 = stem, 나머지 전부 = passage(문제에 종속, 분리 금지). passage 가 없으면 `passage` 필드는 undefined.
- 선지가 여러 문단/표/이미지를 포함하면(선지 줄 뒤 선지 표시 없는 블록) 직전 선지 content 에 이어 붙인다.
- 선지 번호는 위치(1~)로 `Choice.id = 'c1'..'cN'` 부여. 정답은 `answerChoiceIds` 로 변환.
- `fixedChoicePatterns` 기본값: 선지 본문에 원문자 번호(①~⑩), "모두", "위의", "상기", "해당 없음", "정답 없음", "없음" 으로 끝나는 선지 → `fixedPosition: true`. (정답 보존을 위해 섞이면 안 되는 선지)
- Question 필드: subject=options.subject, type='mcq', schemaVersion=1, shufflePolicy='free', tags=[], objectiveCode=`과목 코드`(예: "법규 1-1-3", 코드 공백 정규화), grade=(A) 안의 글자, sourceTag=현재 태그 원문, `extra: { originalNumber, objectiveText, sourceFile }`. DraftQuestion.sourceLocation = `파일명 · N번째 문단 부근`(1부터).

### 블록 변환 규칙
- 문단 → ParagraphBlock(runs). 서식: 밑줄(`w:u` 값이 none 이 아닌 것), 굵게/기울임(`w:b`/`w:i`, val=0/false 면 해제), 위/아래첨자(`w:vertAlign`). **밑줄은 반드시 보존**(법령 문제에서 중요 표시).
- `w:tab`→'\t', `w:br`→'\n'(페이지 나눔 br 은 무시). 변경추적: `w:ins` 포함, `w:del`/`w:delText` 제외. `w:sdt`·`w:hyperlink`·`w:fldSimple` 은 내부 텍스트만 풀어서 사용. 필드 코드(`w:instrText`) 제외. 
- 문단 안 이미지(`w:drawing` 의 `a:blip r:embed`, 레거시 `v:imagedata r:id`)는 문단을 이미지 위치에서 쪼개 [문단, ImageBlock, 문단…] 순서로 낸다(빈 문단 제외). 크기: `wp:extent` EMU/9525 → px 반올림. 관계(rels)로 word/media/* 를 찾아 AssetData(base64) 생성, id=`asset-`+sha256 앞 16자(같은 이미지 중복 제거), mime 은 확장자로. 관계를 못 찾으면 warn `IMAGE_NOT_FOUND`.
- **텍스트박스**(`w:txbxContent`)는 내용 블록들을 담은 **1×1 TableBlock**(박스 모양 유지)으로 변환하고 info 진단 `TEXTBOX_AS_TABLE`. `mc:AlternateContent` 는 `mc:Choice` 만 사용(`mc:Fallback` 무시 → 중복 방지).
- 표 → TableBlock(rows→cells→blocks, 중첩 가능).
- 수식(`m:oMath`/`m:oMathPara`): 안의 `m:t` 를 이어붙인 선형 텍스트로 변환하고 warn `MATH_FLATTENED`(수식은 모양이 사라짐을 안내). **조용히 버리지 않는다.**
- 문단에 `w:numPr`(자동 번호)이 있고 본문에 번호 글자가 없으면 warn `AUTO_NUMBERING_IGNORED`.
- 앞쪽 공백/탭은 번호·선지 번호 제거 후 trimStart. 내용 중간의 공백은 건드리지 않는다.
- 빈 문단은 레코드 경계 판정에서는 무시하되, passage/해설 내부의 의미 있는 빈 줄은 버려도 된다.

### 진단(Diagnostic.code 와 의미)
이 모듈이 내는 것: SUBJECT_REQUIRED(error), TEXTBOX_AS_TABLE(info), MATH_FLATTENED(warn), IMAGE_NOT_FOUND(warn), AUTO_NUMBERING_IGNORED(warn), ANSWER_FORMAT(warn: 숫자만 있는 정답), UNPARSED_BLOCKS(warn: 어느 레코드에도 속하지 못한 내용이 있을 때, 처음 몇 글자와 위치 포함), DOCX_INVALID(error: zip 이 아니거나 word/document.xml 없음 — 예외 던지지 말고 진단으로).
ref 에 draftIndex 와 sourceTag 를 담는다. 메시지는 한국어로 무엇이/어디서/어떻게 고칠지.
(학습목표 없음/선지 수/정답 유효성 등 의미 검사는 importer 가 아니라 validators 모듈이 한다 — importer 는 구조 변환만.)

### 테스트 (docxBuilder 사용, 가짜 한국어 더미 문장)
 - 기본 5지선다 1문제 완전 왕복(stem/choices(번호 제거 확인)/answerChoiceIds/explanation/objectiveCode/grade/sourceTag).
 - "1." "01." "21." 번호, 앞 탭, 태그 두 가지 형식, 태그 없음.
 - passage: 이미지(앵커/인라인/레거시), 표, 음영 텍스트박스(→1×1 표), 여러 블록 혼합. 이미지가 문제에 속하고 asset 이 draft.assets 에 중복 없이 들어감. 
 - 선지 안의 표/이미지가 선지에 붙음. 
 - 해설 안에 "1. 설명"+"① 설명" 줄이 있어도 새 문제로 오인하지 않음(앞보기 검증), 반대로 해설 직후 진짜 다음 문제는 인식.
 - 학습목표 줄 없는 문제 뒤에 다음 문제가 바로 이어짐.
 - 복수 정답, 숫자 정답(경고), 정답 줄 없음/선지 4개/선지 6개(구조는 그대로 파싱하고 의미 판단은 validators 몫).
 - 밑줄 보존(선지/본문/해설), 굵게 해제 val=0, 첨자.
 - mc:AlternateContent 중복 방지, 수식 경고, 변경추적(del 제외), sdt/hyperlink 풀기, 자동 번호 경고.
 - 전각 공백 학습목표 코드 정규화, fixedPosition 자동 지정(예: 가짜 선지 "①, ② 모두", "해당 없음").
 - 깨진 입력(빈 바이트, zip 아닌 것, document.xml 없음) → 예외 없이 DOCX_INVALID.
 - 결정성: 같은 입력 두 번 파싱 결과 deep-equal.
 - 성능: 가짜 문제 1000개 문서를 3초 안에(느린 PC 감안해 넉넉히 기준 명시).
 - subject 누락 → SUBJECT_REQUIRED.
 - 프로파일 교체: 다른 번호 형식/라벨("Answer:")을 쓰는 프로파일로 같은 구조를 파싱.

## 2-D. src/modules/validators — 검수 규칙 (각각 독립 플러그인 폴더)
각 폴더 `src/modules/validators/<id>/index.ts` 가 `Validator` 하나를 export 하고 자체 테스트를 가진다. 집계 `src/modules/validators/index.ts` 에서 `standardValidators: Validator[]` 와 `runValidators(validators, questions): Diagnostic[]` (validate 는 문제별, validateAll 은 전체; draftIndex 설정; severity 순 정렬 안정) 를 export.
 1. `objective-missing` (warn, OBJECTIVE_MISSING): objectiveCode 비었음. 메시지에 "학습목표가 없으면 출제 규칙 대상에서 빠집니다".
 2. `objective-format` (warn, OBJECTIVE_FORMAT): objectiveCode 가 `^\S+ \d+(-\d+)+$` 형태가 아님(예: 과목과 코드가 붙어 있음, 전각 공백).
 3. `choice-count` (error 또는 warn): 선지 2개 미만 error CHOICES_TOO_FEW, 5개가 아니면 warn CHOICE_COUNT_UNUSUAL, 선지 내용이 비어 있으면 error CHOICE_EMPTY, 선지 ID 중복 error.
 4. `answer-valid` (error): 정답 없음 ANSWER_MISSING, 정답 ID 가 선지에 없음 ANSWER_INVALID, 정답이 선지 수 초과 등.
 5. `empty-content` (error): stem 비었음 STEM_EMPTY. (이미지/표만 있어도 비어 있지 않은 것으로 본다 — isEmptyBlocks 사용)
 6. `choice-reference` (warn, CHOICE_REFERENCES_OTHERS): 선지가 다른 선지/번호를 가리키는 표현(원문자 번호, "모두", "위의", "해당 없음" 등)을 담고 있는데 fixedPosition 이 false 이고 shufflePolicy 가 free — 섞으면 정답이 깨질 수 있음을 알림.
 7. `duplicate-stem` (validateAll, warn, DUPLICATE_STEM): stem+passage 의 정규화 텍스트가 같은 문제 묶음을 찾아 서로의 위치를 메시지에 담는다. 선지 집합까지 같으면 DUPLICATE_EXACT(warn, "완전히 같은 문제"), 선지가 다르면 DUPLICATE_STEM_VARIANT(info, "같은 문제 지문, 선지 다름(변형 가능)"). 정규화: 공백/전각공백/번호 접두 제거, 소문자.
 8. `duplicate-choices` (warn): 한 문제 안에서 선지 내용이 서로 같음.
 9. `answer-distribution` (validateAll, info, ANSWER_SKEW): 정답 위치 분포가 한쪽으로 쏠림(가장 많은 위치가 평균의 1.5배 초과)이면 분포를 알림.
 - 진단 ref 에 가능한 questionId/draftIndex/sourceTag 포함. 메시지는 한국어.
 - 테스트: 각 검사의 정상/비정상, runValidators 정렬/인덱스, 대량(1000문제) 중복 검사 성능(해시 맵 기반, O(n)).

## 마무리
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint:deps` 모두 통과.
- 임시로 `importers/docx` 에서 `storage` 를 import 하는 위반을 만들어 lint 가 실패하는지 확인하고 지워라. validators 끼리 import 하는 위반도 확인.
- AGENTS.md 의 최종 보고 형식으로 보고하고, importer 가 처리하지 못하거나 가정한 문서 구조를 솔직히 적어라.
